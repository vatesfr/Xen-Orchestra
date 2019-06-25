import assert from 'assert'
import createLogger from '@xen-orchestra/log'
import NodeOpenssl from 'node-openssl-cert'
import { access, constants, readFile, writeFile } from 'fs'
import { EventEmitter } from 'events'
import { filter, find, forOwn, map } from 'lodash'
import { fromCallback, fromEvent } from 'promise-toolbox'
import { join } from 'path'

import { OvsdbClient } from './ovsdb-client'

// =============================================================================

const log = createLogger('xo:xo-server:sdn-controller')

const PROTOCOL = 'pssl'

const CA_CERT = 'ca-cert.pem'
const CLIENT_KEY = 'client-key.pem'
const CLIENT_CERT = 'client-cert.pem'

const SDN_CONTROLLER_CERT = 'sdn-controller-ca.pem'

const NB_DAYS = 9999

// =============================================================================

export const configurationSchema = {
  type: 'object',
  properties: {
    'cert-dir': {
      description: `Full path to a directory where to find: \`client-cert.pem\`,
 \`client-key.pem\` and \`ca-cert.pem\` to create ssl connections with hosts.
 If none is provided, the plugin will create its own self-signed certificates.`,

      type: 'string',
    },
    'override-certs': {
      description: `Replace already existing SDN controller CA certificate`,

      type: 'boolean',
      default: false,
    },
  },
}

// =============================================================================

async function fileWrite(path, data) {
  try {
    await fromCallback(cb => writeFile(path, data, cb))
    log.debug(`${path} successfully written`)
  } catch (error) {
    log.error(`Couldn't write in: ${path} because: ${error}`)
  }
}

async function fileRead(path) {
  let result
  try {
    result = await fromCallback(cb => readFile(path, cb))
  } catch (error) {
    log.error(`Error while reading file: ${path} because: ${error}`)
    return null
  }
  return result
}

async function fileExists(path) {
  try {
    await fromCallback(cb => access(path, constants.F_OK, cb))
  } catch (error) {
    return false
  }

  return true
}

// =============================================================================

class SDNController extends EventEmitter {
  constructor({ xo, getDataDir }) {
    super()

    this._xo = xo

    this._getDataDir = getDataDir

    this._clientKey = null
    this._clientCert = null
    this._caCert = null

    this._poolNetworks = []
    this._ovsdbClients = []
    this._newHosts = []

    this._networks = new Map()
    this._starCenters = new Map()

    this._cleaners = []
    this._objectsAdded = this._objectsAdded.bind(this)
    this._objectsUpdated = this._objectsUpdated.bind(this)

    this._overrideCerts = false

    this._unsetApiMethod = null
  }

  // ---------------------------------------------------------------------------

  async configure(configuration) {
    this._overrideCerts = configuration['override-certs']
    let certDirectory = configuration['cert-dir']
    if (certDirectory == null) {
      log.debug(`No cert-dir provided, using default self-signed certificates`)
      certDirectory = await this._getDataDir()

      if (!(await fileExists(join(certDirectory, CA_CERT)))) {
        // If one certificate doesn't exist, none should
        assert(
          !(await fileExists(join(certDirectory, CLIENT_KEY))),
          `${CLIENT_KEY} should not exist`
        )
        assert(
          !(await fileExists(join(certDirectory, CLIENT_CERT))),
          `${CLIENT_CERT} should not exist`
        )

        log.debug(`No default self-signed certificates exists, creating them`)
        await this._generateCertificatesAndKey(certDirectory)
      }
    }
    // TODO: verify certificates and create new certificates if needed

    ;[this._clientKey, this._clientCert, this._caCert] = await Promise.all([
      fileRead(join(certDirectory, CLIENT_KEY)),
      fileRead(join(certDirectory, CLIENT_CERT)),
      fileRead(join(certDirectory, CA_CERT)),
    ])

    this._ovsdbClients.forEach(client => {
      client.updateCertificates(this._clientKey, this._clientCert, this._caCert)
    })
    const updatedPools = []
    for (let i = 0; i < this._poolNetworks.length; ++i) {
      const poolNetwork = this._poolNetworks[i]
      if (updatedPools.includes(poolNetwork.pool)) {
        continue
      }

      const xapi = this._xo.getXapi(poolNetwork.pool)
      await this._installCaCertificateIfNeeded(xapi)
      updatedPools.push(poolNetwork.pool)
    }
  }

  async load() {
    const createPrivateNetwork = this._createPrivateNetwork.bind(this)
    createPrivateNetwork.description =
      'Creates a pool-wide private network on a selected pool'
    createPrivateNetwork.params = {
      poolId: { type: 'string' },
      networkName: { type: 'string' },
      networkDescription: { type: 'string' },
      encapsulation: { type: 'string' },
    }
    createPrivateNetwork.resolve = {
      xoPool: ['poolId', 'pool', ''],
    }
    this._unsetApiMethod = this._xo.addApiMethod(
      'plugin.SDNController.createPrivateNetwork',
      createPrivateNetwork
    )

    // FIXME: we should monitor when xapis are added/removed
    forOwn(this._xo.getAllXapis(), async xapi => {
      await xapi.objectsFetched

      if (this._setControllerNeeded(xapi) === false) {
        this._cleaners.push(await this._manageXapi(xapi))

        const hosts = filter(xapi.objects.all, { $type: 'host' })
        await Promise.all(
          map(hosts, async host => {
            this._createOvsdbClient(host)
          })
        )

        // Add already existing pool-wide private networks
        const networks = filter(xapi.objects.all, { $type: 'network' })
        forOwn(networks, async network => {
          if (network.other_config.private_pool_wide === 'true') {
            log.debug(
              `Adding network: '${network.name_label}' for pool: '${
                network.$pool.name_label
              }' to managed networks`
            )
            const center = await this._electNewCenter(network, true)
            this._poolNetworks.push({
              pool: network.$pool.$ref,
              network: network.$ref,
              starCenter: center ? center.$ref : null,
            })
            this._networks.set(network.$id, network.$ref)
            if (center != null) {
              this._starCenters.set(center.$id, center.$ref)
            }
          }
        })
      }
    })
  }

  async unload() {
    this._ovsdbClients = []
    this._poolNetworks = []
    this._newHosts = []

    this._networks.clear()
    this._starCenters.clear()

    this._cleaners.forEach(cleaner => cleaner())
    this._cleaners = []

    this._unsetApiMethod()
  }

  // ===========================================================================

  async _createPrivateNetwork({
    xoPool,
    networkName,
    networkDescription,
    encapsulation,
  }) {
    const pool = this._xo.getXapiObject(xoPool)
    await this._setPoolControllerIfNeeded(pool)

    // Create the private network
    const privateNetworkRef = await pool.$xapi.call('network.create', {
      name_label: networkName,
      name_description: networkDescription,
      MTU: 0,
      other_config: {
        automatic: 'false',
        private_pool_wide: 'true',
        encapsulation: encapsulation,
      },
    })

    const privateNetwork = await pool.$xapi._getOrWaitObject(privateNetworkRef)

    log.info(
      `Private network '${
        privateNetwork.name_label
      }' has been created for pool '${pool.name_label}'`
    )

    // For each pool's host, create a tunnel to the private network
    const hosts = filter(pool.$xapi.objects.all, { $type: 'host' })
    await Promise.all(
      map(hosts, async host => {
        await this._createTunnel(host, privateNetwork)
        this._createOvsdbClient(host)
      })
    )

    const center = await this._electNewCenter(privateNetwork, false)
    this._poolNetworks.push({
      pool: pool.$ref,
      network: privateNetwork.$ref,
      starCenter: center ? center.$ref : null,
      encapsulation: encapsulation,
    })
    this._networks.set(privateNetwork.$id, privateNetwork.$ref)
    if (center != null) {
      this._starCenters.set(center.$id, center.$ref)
    }
  }

  // ---------------------------------------------------------------------------

  async _manageXapi(xapi) {
    const { objects } = xapi

    const objectsRemovedXapi = this._objectsRemoved.bind(this, xapi)
    objects.on('add', this._objectsAdded)
    objects.on('update', this._objectsUpdated)
    objects.on('remove', objectsRemovedXapi)

    await this._installCaCertificateIfNeeded(xapi)

    return () => {
      objects.removeListener('add', this._objectsAdded)
      objects.removeListener('update', this._objectsUpdated)
      objects.removeListener('remove', objectsRemovedXapi)
    }
  }

  async _objectsAdded(objects) {
    await Promise.all(
      map(objects, async object => {
        const { $type } = object

        if ($type === 'host') {
          log.debug(
            `New host: '${object.name_label}' in pool: '${
              object.$pool.name_label
            }'`
          )

          if (find(this._newHosts, { $ref: object.$ref }) == null) {
            this._newHosts.push(object)
          }
          this._createOvsdbClient(object)
        }
      })
    )
  }

  async _objectsUpdated(objects) {
    await Promise.all(
      map(objects, async (object, id) => {
        const { $type } = object

        if ($type === 'PIF') {
          await this._pifUpdated(object)
        } else if ($type === 'host') {
          await this._hostUpdated(object)
        }
      })
    )
  }

  async _objectsRemoved(xapi, objects) {
    await Promise.all(
      map(objects, async (object, id) => {
        const client = find(this._ovsdbClients, { id: id })
        if (client != null) {
          this._ovsdbClients.splice(this._ovsdbClients.indexOf(client), 1)
        }

        // If a Star center host is removed: re-elect a new center where needed
        const starCenterRef = this._starCenters.get(id)
        if (starCenterRef != null) {
          this._starCenters.delete(id)
          const poolNetworks = filter(this._poolNetworks, {
            starCenter: starCenterRef,
          })
          for (let i = 0; i < poolNetworks.length; ++i) {
            const poolNetwork = poolNetworks[i]
            const network = await xapi._getOrWaitObject(poolNetwork.network)
            const newCenter = await this._electNewCenter(network, true)
            poolNetwork.starCenter = newCenter ? newCenter.$ref : null
            if (newCenter != null) {
              this._starCenters.set(newCenter.$id, newCenter.$ref)
            }
          }
          return
        }

        // If a network is removed, clean this._poolNetworks from it
        const networkRef = this._networks.get(id)
        if (networkRef != null) {
          this._networks.delete(id)
          const poolNetwork = find(this._poolNetworks, {
            network: networkRef,
          })
          if (poolNetwork != null) {
            this._poolNetworks.splice(
              this._poolNetworks.indexOf(poolNetwork),
              1
            )
          }
        }
      })
    )
  }

  async _pifUpdated(pif) {
    // Only if PIF is in a private network
    const poolNetwork = find(this._poolNetworks, { network: pif.network })
    if (poolNetwork == null) {
      return
    }

    if (!pif.currently_attached) {
      if (poolNetwork.starCenter !== pif.host) {
        return
      }

      log.debug(
        `PIF: '${pif.device}' of network: '${
          pif.$network.name_label
        }' star-center host: '${
          pif.$host.name_label
        }' has been unplugged, electing a new host`
      )
      const newCenter = await this._electNewCenter(pif.$network, true)
      poolNetwork.starCenter = newCenter ? newCenter.$ref : null
      this._starCenters.delete(pif.$host.$id)
      if (newCenter != null) {
        this._starCenters.set(newCenter.$id, newCenter.$ref)
      }
    } else {
      if (poolNetwork.starCenter == null) {
        const host = pif.$host
        log.debug(
          `First available host: '${
            host.name_label
          }' becomes star center of network: '${pif.$network.name_label}'`
        )
        poolNetwork.starCenter = pif.host
        this._starCenters.set(host.$id, host.$ref)
      }

      log.debug(
        `PIF: '${pif.device}' of network: '${pif.$network.name_label}' host: '${
          pif.$host.name_label
        }' has been plugged`
      )

      const starCenter = await pif.$xapi._getOrWaitObject(
        poolNetwork.starCenter
      )
      await this._addHostToNetwork(pif.$host, pif.$network, starCenter)
    }
  }

  async _hostUpdated(host) {
    const xapi = host.$xapi

    if (host.enabled) {
      if (host.PIFs.length === 0) {
        return
      }

      const tunnels = filter(xapi.objects.all, { $type: 'tunnel' })
      const newHost = find(this._newHosts, { $ref: host.$ref })
      if (newHost != null) {
        this._newHosts.splice(this._newHosts.indexOf(newHost), 1)
        try {
          await xapi.call('pool.certificate_sync')
        } catch (error) {
          log.error(
            `Couldn't sync SDN controller ca certificate in pool: '${
              host.$pool.name_label
            }' because: ${error}`
          )
        }
      }
      for (let i = 0; i < tunnels.length; ++i) {
        const tunnel = tunnels[i]
        const accessPIF = await xapi._getOrWaitObject(tunnel.access_PIF)
        if (accessPIF.host !== host.$ref) {
          continue
        }

        const poolNetwork = find(this._poolNetworks, {
          network: accessPIF.network,
        })
        if (poolNetwork == null) {
          continue
        }

        if (accessPIF.currently_attached) {
          continue
        }

        log.debug(
          `Pluging PIF: '${accessPIF.device}' for host: '${
            host.name_label
          }' on network: '${accessPIF.$network.name_label}'`
        )
        try {
          await xapi.call('PIF.plug', accessPIF.$ref)
        } catch (error) {
          log.error(
            `XAPI error while pluging PIF: '${accessPIF.device}' on host: '${
              host.name_label
            }' for network: '${accessPIF.$network.name_label}'`
          )
        }

        const starCenter = await host.$xapi._getOrWaitObject(
          poolNetwork.starCenter
        )
        await this._addHostToNetwork(host, accessPIF.$network, starCenter)
      }
    } else {
      const poolNetworks = filter(this._poolNetworks, { starCenter: host.$ref })
      for (let i = 0; i < poolNetworks.length; ++i) {
        const poolNetwork = poolNetworks[i]
        const network = await host.$xapi._getOrWaitObject(poolNetwork.network)
        log.debug(
          `Star center host: '${host.name_label}' of network: '${
            network.name_label
          }' in pool: '${
            host.$pool.name_label
          }' is no longer reachable, electing a new host`
        )

        const newCenter = await this._electNewCenter(network, true)
        poolNetwork.starCenter = newCenter ? newCenter.$ref : null
        this._starCenters.delete(host.$id)
        if (newCenter != null) {
          this._starCenters.set(newCenter.$id, newCenter.$ref)
        }
      }
    }
  }

  // ---------------------------------------------------------------------------

  async _setPoolControllerIfNeeded(pool) {
    if (!this._setControllerNeeded(pool.$xapi)) {
      // Nothing to do
      return
    }

    const controller = find(pool.$xapi.objects.all, { $type: 'SDN_controller' })
    if (controller != null) {
      await pool.$xapi.call('SDN_controller.forget', controller.$ref)
      log.debug(`Remove old SDN controller from pool: '${pool.name_label}'`)
    }

    await pool.$xapi.call('SDN_controller.introduce', PROTOCOL)
    log.debug(`Set SDN controller of pool: '${pool.name_label}'`)
    this._cleaners.push(await this._manageXapi(pool.$xapi))
  }

  _setControllerNeeded(xapi) {
    const controller = find(xapi.objects.all, { $type: 'SDN_controller' })
    return !(
      controller != null &&
      controller.protocol === PROTOCOL &&
      controller.address === '' &&
      controller.port === 0
    )
  }

  // ---------------------------------------------------------------------------

  async _installCaCertificateIfNeeded(xapi) {
    let needInstall = false
    try {
      const result = await xapi.call('pool.certificate_list')
      if (!result.includes(SDN_CONTROLLER_CERT)) {
        needInstall = true
      } else if (this._overrideCerts) {
        await xapi.call('pool.certificate_uninstall', SDN_CONTROLLER_CERT)
        log.debug(
          `Old SDN Controller CA certificate uninstalled on pool: '${
            xapi.pool.name_label
          }'`
        )
        needInstall = true
      }
    } catch (error) {
      log.error(
        `Couldn't retrieve certificate list of pool: '${xapi.pool.name_label}'`
      )
    }
    if (!needInstall) {
      return
    }

    try {
      await xapi.call(
        'pool.certificate_install',
        SDN_CONTROLLER_CERT,
        this._caCert.toString()
      )
      await xapi.call('pool.certificate_sync')
      log.debug(
        `SDN controller CA certificate install in pool: '${
          xapi.pool.name_label
        }'`
      )
    } catch (error) {
      log.error(
        `Couldn't install SDN controller CA certificate in pool: '${
          xapi.pool.name_label
        }' because: ${error}`
      )
    }
  }

  // ---------------------------------------------------------------------------

  async _electNewCenter(network, resetNeeded) {
    const pool = network.$pool

    let newCenter = null
    const hosts = filter(pool.$xapi.objects.all, { $type: 'host' })
    await Promise.all(
      map(hosts, async host => {
        if (resetNeeded) {
          // Clean old ports and interfaces
          const hostClient = find(this._ovsdbClients, { host: host.$ref })
          if (hostClient != null) {
            await hostClient.resetForNetwork(network.uuid, network.name_label)
          }
        }

        if (newCenter != null) {
          return
        }

        const pif = find(host.$PIFs, { network: network.$ref })
        if (pif != null && pif.currently_attached && host.enabled) {
          newCenter = host
        }
      })
    )

    if (newCenter == null) {
      log.error(
        `Unable to elect a new star-center host to network: '${
          network.name_label
        }' for pool: '${
          network.$pool.name_label
        }' because there's no available host`
      )
      return null
    }

    // Recreate star topology
    await Promise.all(
      await map(hosts, async host => {
        await this._addHostToNetwork(host, network, newCenter)
      })
    )

    log.info(
      `New star center host elected: '${newCenter.name_label}' in network: '${
        network.name_label
      }'`
    )

    return newCenter
  }

  async _createTunnel(host, network) {
    const pif = find(host.$PIFs, { physical: true })
    if (pif == null) {
      log.error(
        `No PIF found to create tunnel on host: '${
          host.name_label
        }' for network: '${network.name_label}'`
      )
      return
    }

    await host.$xapi.call('tunnel.create', pif.$ref, network.$ref)
    log.debug(
      `Tunnel added on host '${host.name_label}' for network '${
        network.name_label
      }'`
    )
  }

  async _addHostToNetwork(host, network, starCenter) {
    if (host.$ref === starCenter.$ref) {
      // Nothing to do
      return
    }

    const hostClient = find(this._ovsdbClients, {
      host: host.$ref,
    })
    if (hostClient == null) {
      log.error(`No OVSDB client found for host: '${host.name_label}'`)
      return
    }

    const starCenterClient = find(this._ovsdbClients, {
      host: starCenter.$ref,
    })
    if (starCenterClient == null) {
      log.error(
        `No OVSDB client found for star-center host: '${starCenter.name_label}'`
      )
      return
    }

    const encapsulation =
      network.other_config.encapsulation != null
        ? network.other_config.encapsulation
        : 'gre'
    await hostClient.addInterfaceAndPort(
      network.uuid,
      network.name_label,
      starCenterClient.address,
      encapsulation
    )
    await starCenterClient.addInterfaceAndPort(
      network.uuid,
      network.name_label,
      hostClient.address,
      encapsulation
    )
  }

  // ---------------------------------------------------------------------------

  _createOvsdbClient(host) {
    const foundClient = find(this._ovsdbClients, { host: host.$ref })
    if (foundClient != null) {
      return foundClient
    }

    const client = new OvsdbClient(
      host,
      this._clientKey,
      this._clientCert,
      this._caCert
    )
    this._ovsdbClients.push(client)
    return client
  }

  // ---------------------------------------------------------------------------

  async _generateCertificatesAndKey(dataDir) {
    const openssl = new NodeOpenssl()

    const rsakeyoptions = {
      rsa_keygen_bits: 4096,
      format: 'PKCS8',
    }
    const subject = {
      countryName: 'XX',
      localityName: 'Default City',
      organizationName: 'Default Company LTD',
    }
    const csroptions = {
      hash: 'sha256',
      startdate: new Date('1984-02-04 00:00:00'),
      enddate: new Date('2143-06-04 04:16:23'),
      subject: subject,
    }
    const cacsroptions = {
      hash: 'sha256',
      days: NB_DAYS,
      subject: subject,
    }

    openssl.generateRSAPrivateKey(rsakeyoptions, (err, cakey, cmd) => {
      if (err) {
        log.error(`Error while generating CA private key: ${err}`)
        return
      }

      openssl.generateCSR(cacsroptions, cakey, null, (err, csr, cmd) => {
        if (err) {
          log.error(`Error while generating CA certificate: ${err}`)
          return
        }

        openssl.selfSignCSR(
          csr,
          cacsroptions,
          cakey,
          null,
          async (err, cacrt, cmd) => {
            if (err) {
              log.error(`Error while signing CA certificate: ${err}`)
              return
            }

            await fileWrite(join(dataDir, CA_CERT), cacrt)
            openssl.generateRSAPrivateKey(
              rsakeyoptions,
              async (err, key, cmd) => {
                if (err) {
                  log.error(`Error while generating private key: ${err}`)
                  return
                }

                await fileWrite(join(dataDir, CLIENT_KEY), key)
                openssl.generateCSR(csroptions, key, null, (err, csr, cmd) => {
                  if (err) {
                    log.error(`Error while generating certificate: ${err}`)
                    return
                  }
                  openssl.CASignCSR(
                    csr,
                    cacsroptions,
                    false,
                    cacrt,
                    cakey,
                    null,
                    async (err, crt, cmd) => {
                      if (err) {
                        log.error(`Error while signing certificate: ${err}`)
                        return
                      }

                      await fileWrite(join(dataDir, CLIENT_CERT), crt)
                      this.emit('certWritten')
                    }
                  )
                })
              }
            )
          }
        )
      })
    })

    try {
      await fromEvent(this, 'certWritten', {})
      log.debug('All certificates have been successfully written')
    } catch (error) {
      log.error(`${error}`)
    }
  }
}

export default opts => new SDNController(opts)
