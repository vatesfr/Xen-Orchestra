import createLogger from '@xen-orchestra/log'
import { BaseError } from 'make-error'
import { pDelay, ignoreErrors } from 'promise-toolbox'
import { fibonacci } from 'iterable-backoff'
import { findKey } from 'lodash'
import { noSuchObject } from 'xo-common/api-errors'

import Xapi from '../xapi'
import xapiObjectToXo from '../xapi-object-to-xo'
import XapiStats from '../xapi-stats'
import {
  camelToSnakeCase,
  forEach,
  isEmpty,
  isString,
  popProperty,
  serializeError,
} from '../utils'
import { Servers } from '../models/server'

// ===================================================================

class PoolAlreadyConnected extends BaseError {
  constructor() {
    super("the server's pool is already connected")
  }
}

const log = createLogger('xo:xo-mixins:xen-servers')

export default class {
  constructor(xo, { xapiOptions }) {
    this._objectConflicts = { __proto__: null } // TODO: clean when a server is disconnected.
    const serversDb = (this._servers = new Servers({
      connection: xo._redis,
      prefix: 'xo:server',
      indexes: ['host'],
    }))
    this._stats = new XapiStats()
    this._xapiOptions = xapiOptions
    this._xapis = { __proto__: null }
    this._xapisByPool = { __proto__: null }
    this._xo = xo

    xo.on('clean', () => serversDb.rebuildIndexes())
    xo.on('start', async () => {
      xo.addConfigManager(
        'xenServers',
        () => serversDb.get(),
        servers => serversDb.update(servers)
      )

      // Connects to existing servers.
      const servers = await serversDb.get()
      for (const server of servers) {
        if (server.enabled) {
          this.connectXenServer(server.id).catch(error => {
            log.warn('failed to connect to XenServer', {
              host: server.host,
              error,
            })
          })
        }
      }
    })

    // TODO: disconnect servers on stop.
  }

  async registerXenServer({
    allowUnauthorized,
    host,
    label,
    password,
    readOnly,
    username,
  }) {
    // FIXME: We are storing passwords which is bad!
    //        Could we use tokens instead?
    // TODO: use plain objects
    const server = await this._servers.create({
      allowUnauthorized: allowUnauthorized ? 'true' : undefined,
      enabled: 'true',
      host,
      label: label || undefined,
      password,
      readOnly: readOnly ? 'true' : undefined,
      username,
    })

    return server.properties
  }

  async unregisterXenServer(id) {
    this.disconnectXenServer(id)::ignoreErrors()

    if (!(await this._servers.remove(id))) {
      throw noSuchObject(id, 'xenServer')
    }
  }

  async updateXenServer(
    id,
    {
      allowUnauthorized,
      enabled,
      error,
      host,
      label,
      password,
      readOnly,
      username,
    }
  ) {
    const server = await this._getXenServer(id)
    const xapi = this._xapis[id]
    const requireDisconnected =
      allowUnauthorized !== undefined ||
      host !== undefined ||
      password !== undefined ||
      username !== undefined

    if (
      requireDisconnected &&
      xapi !== undefined &&
      xapi.status !== 'disconnected'
    ) {
      throw new Error(
        'this entry require disconnecting the server to update it'
      )
    }

    if (label !== undefined) server.set('label', label || undefined)
    if (host) server.set('host', host)
    if (username) server.set('username', username)
    if (password) server.set('password', password)

    if (error !== undefined) {
      server.set('error', error ? JSON.stringify(error) : '')
    }

    if (enabled !== undefined) {
      server.set('enabled', enabled ? 'true' : undefined)
    }

    if (readOnly !== undefined) {
      server.set('readOnly', readOnly ? 'true' : undefined)
      if (xapi !== undefined) {
        xapi.readOnly = readOnly
      }
    }

    if (allowUnauthorized !== undefined) {
      server.set('allowUnauthorized', allowUnauthorized ? 'true' : undefined)
    }

    await this._servers.update(server)
  }

  // TODO: this method will no longer be async when servers are
  // integrated to the main collection.
  async _getXenServer(id) {
    const server = await this._servers.first(id)
    if (server === undefined) {
      throw noSuchObject(id, 'xenServer')
    }

    return server
  }

  _onXenAdd(
    newXapiObjects,
    xapiIdsToXo,
    toRetry,
    conId,
    dependents,
    xapiObjects
  ) {
    const conflicts = this._objectConflicts
    const objects = this._xo._objects

    forEach(newXapiObjects, function handleObject(xapiObject, xapiId) {
      const { $ref } = xapiObject

      const dependent = dependents[$ref]
      if (dependent !== undefined) {
        delete dependents[$ref]
        return handleObject(xapiObjects[dependent], dependent)
      }

      try {
        const xoObject = xapiObjectToXo(xapiObject, dependents)
        if (!xoObject) {
          return
        }

        const xoId = xoObject.id
        xapiIdsToXo[xapiId] = xoId

        const previous = objects.get(xoId, undefined)
        if (previous && previous._xapiRef !== $ref) {
          const conflicts_ =
            conflicts[xoId] || (conflicts[xoId] = { __proto__: null })
          conflicts_[conId] = xoObject
        } else {
          objects.set(xoId, xoObject)
        }
      } catch (error) {
        log.error('xapiObjectToXo', { error })

        toRetry[xapiId] = xapiObject
      }
    })
  }

  _onXenRemove(xapiObjects, xapiIdsToXo, toRetry, conId) {
    const conflicts = this._objectConflicts
    const objects = this._xo._objects

    forEach(xapiObjects, (_, xapiId) => {
      toRetry && delete toRetry[xapiId]

      const xoId = xapiIdsToXo[xapiId]
      if (!xoId) {
        // This object was not known previously.
        return
      }

      delete xapiIdsToXo[xapiId]

      const objConflicts = conflicts[xoId]
      if (objConflicts) {
        if (objConflicts[conId]) {
          delete objConflicts[conId]
        } else {
          objects.set(xoId, popProperty(objConflicts))
        }

        if (isEmpty(objConflicts)) {
          delete conflicts[xoId]
        }
      } else {
        objects.unset(xoId)
      }
    })
  }

  async connectXenServer(id) {
    const server = (await this._getXenServer(id)).properties

    const xapi = new Xapi({
      allowUnauthorized: Boolean(server.allowUnauthorized),
      readOnly: Boolean(server.readOnly),

      ...this._xapiOptions,

      auth: {
        user: server.username,
        password: server.password,
      },
      url: server.host,
      watchEvents: false,
    })

    try {
      await xapi.connect()

      const xapisByPool = this._xapisByPool
      const [{ $id: poolId }] = await xapi.getAllRecords('pool')
      if (xapisByPool[poolId] !== undefined) {
        throw new PoolAlreadyConnected()
      }

      this._xapis[server.id] = xapisByPool[poolId] = xapi

      xapi.xo = (() => {
        const conId = server.id

        // Maps ids of XAPI objects to ids of XO objects.
        const xapiIdsToXo = { __proto__: null }

        // Map of XAPI objects which failed to be transformed to XO
        // objects.
        //
        // At each `finish` there will be another attempt to transform
        // until they succeed.
        let toRetry
        let toRetryNext = { __proto__: null }

        const dependents = { __proto__: null }

        const onAddOrUpdate = objects => {
          this._onXenAdd(
            objects,
            xapiIdsToXo,
            toRetryNext,
            conId,
            dependents,
            xapi.objects.all
          )
        }
        const onRemove = objects => {
          this._onXenRemove(objects, xapiIdsToXo, toRetry, conId, dependents)
        }

        const onFinish = () => {
          if (!isEmpty(toRetry)) {
            onAddOrUpdate(toRetry)
            toRetry = null
          }

          if (!isEmpty(toRetryNext)) {
            toRetry = toRetryNext
            toRetryNext = { __proto__: null }
          }
        }

        const { objects } = xapi

        const addObject = object => {
          // TODO: optimize.
          onAddOrUpdate({ [object.$id]: object })
          return xapiObjectToXo(object, dependents)
        }

        return {
          httpRequest: this._xo.httpRequest.bind(this),

          install() {
            objects.on('add', onAddOrUpdate)
            objects.on('update', onAddOrUpdate)
            objects.on('remove', onRemove)
            objects.on('finish', onFinish)

            onAddOrUpdate(objects.all)
          },
          uninstall() {
            objects.removeListener('add', onAddOrUpdate)
            objects.removeListener('update', onAddOrUpdate)
            objects.removeListener('remove', onRemove)
            objects.removeListener('finish', onFinish)

            onRemove(objects.all)
          },

          addObject,
          getData: (id, key) => {
            const value = (typeof id === 'string' ? xapi.getObject(id) : id)
              .other_config[`xo:${camelToSnakeCase(key)}`]
            return value && JSON.parse(value)
          },
          setData: async (id, key, value) => {
            await xapi._updateObjectMapProperty(
              xapi.getObject(id),
              'other_config',
              {
                [`xo:${camelToSnakeCase(key)}`]:
                  value !== null ? JSON.stringify(value) : value,
              }
            )

            // Register the updated object.
            addObject(await xapi._waitObject(id))
          },
        }
      })()

      xapi.xo.install()
      xapi.watchEvents()

      this.updateXenServer(id, { error: null })::ignoreErrors()
    } catch (error) {
      xapi.disconnect()::ignoreErrors()
      this.updateXenServer(id, { error: serializeError(error) })::ignoreErrors()
      throw error
    }
  }

  async disconnectXenServer(id) {
    const xapi = this._xapis[id]
    if (!xapi) {
      throw noSuchObject(id, 'xenServer')
    }

    delete this._xapis[id]

    const { pool } = xapi
    if (pool != null) {
      delete this._xapisByPool[pool.$id]
    }

    xapi.xo.uninstall()
    return xapi.disconnect()
  }

  getAllXapis() {
    return this._xapis
  }

  // Returns the XAPI connection associated to an object.
  getXapi(object, type) {
    if (isString(object)) {
      object = this._xo.getObject(object, type)
    }

    const { $pool: poolId } = object
    if (!poolId) {
      throw new Error(`object ${object.id} does not belong to a pool`)
    }

    const xapi = this._xapisByPool[poolId]
    if (!xapi) {
      throw new Error(`no connection found for object ${object.id}`)
    }

    return xapi
  }

  async getAllXenServers() {
    const servers = await this._servers.get()
    const xapis = this._xapis
    forEach(servers, server => {
      const xapi = xapis[server.id]
      if (xapi !== undefined) {
        server.status = xapi.status

        let pool
        if (server.label === undefined && (pool = xapi.pool) != null) {
          server.label = pool.name_label
        }
      }

      // Do not expose password.
      delete server.password
    })

    return servers
  }

  getXapiVmStats(vmId, granularity) {
    return this._stats.getVmStats(this.getXapi(vmId), vmId, granularity)
  }

  getXapiHostStats(hostId, granularity) {
    return this._stats.getHostStats(this.getXapi(hostId), hostId, granularity)
  }

  getXapiSrStats(srId, granularity) {
    return this._stats.getSrStats(this.getXapi(srId), srId, granularity)
  }

  async mergeXenPools(sourcePoolId, targetPoolId, force = false) {
    const sourceXapi = this.getXapi(sourcePoolId)
    const {
      _auth: { user, password },
      _url: { hostname },
    } = this.getXapi(targetPoolId)

    // We don't want the events of the source XAPI to interfere with
    // the events of the new XAPI.
    sourceXapi.xo.uninstall()

    try {
      await sourceXapi.joinPool(hostname, user, password, force)
    } catch (e) {
      sourceXapi.xo.install()

      throw e
    }

    this.unregisterXenServer(
      findKey(this._xapis, candidate => candidate === sourceXapi)
    )::ignoreErrors()
  }

  async detachHostFromPool(hostId) {
    const xapi = this.getXapi(hostId)
    const { address } = xapi.getObject(hostId)

    await xapi.ejectHostFromPool(hostId)

    this._getXenServer(findKey(this._xapis, candidate => candidate === xapi))
      .then(async ({ properties }) => {
        const { id } = await this.registerXenServer({
          ...properties,
          host: address,
        })

        for (const delay of fibonacci()
          .take(5)
          .toMs()
          .map(d => d * 60)) {
          await pDelay(delay)
          try {
            await this.connectXenServer(id)
            break
          } catch (error) {
            if (
              !(error instanceof PoolAlreadyConnected) &&
              error.code !== 'EHOSTUNREACH'
            ) {
              throw error
            }
          }
        }
      })
      ::ignoreErrors()
  }
}
