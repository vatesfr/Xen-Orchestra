import createLogger from '@xen-orchestra/log'
import { forEach, groupBy } from 'lodash'

import { mapToArray } from '../../utils'

const log = createLogger('xo:storage')

export default {
  _connectAllSrPbds(sr) {
    return Promise.all(mapToArray(sr.$PBDs, pbd => this._plugPbd(pbd)))
  },

  async connectAllSrPbds(id) {
    await this._connectAllSrPbds(this.getObject(id))
  },

  _disconnectAllSrPbds(sr) {
    return Promise.all(mapToArray(sr.$PBDs, pbd => this._unplugPbd(pbd)))
  },

  async disconnectAllSrPbds(id) {
    await this._disconnectAllSrPbds(this.getObject(id))
  },

  async destroySr(id) {
    const sr = this.getObject(id)
    await this._disconnectAllSrPbds(sr)
    await this.call('SR.destroy', sr.$ref)
  },

  async forgetSr(id) {
    const sr = this.getObject(id)
    await this._disconnectAllSrPbds(sr)
    await this.call('SR.forget', sr.$ref)
  },

  _plugPbd(pbd) {
    return this.callAsync('PBD.plug', pbd.$ref)
  },

  async plugPbd(id) {
    await this._plugPbd(this.getObject(id))
  },

  _unplugPbd(pbd) {
    return this.callAsync('PBD.unplug', pbd.$ref)
  },

  async unplugPbd(id) {
    await this._unplugPbd(this.getObject(id))
  },

  _getUnhealthyVdiChainLength(uuid, childrenMap, cache) {
    let length = cache[uuid]
    if (length === undefined) {
      const children = childrenMap[uuid]
      length = children !== undefined && children.length === 1 ? 1 : 0
      try {
        const parent = this.getObjectByUuid(uuid).sm_config['vhd-parent']
        if (parent !== undefined) {
          length += this._getUnhealthyVdiChainLength(parent, childrenMap, cache)
        }
      } catch (error) {
        log.warn(`Xapi#_getUnhealthyVdiChainLength(${uuid})`, { error })
      }
      cache[uuid] = length
    }
    return length
  },

  getUnhealthyVdiChainsLength(sr) {
    const vdis = this.getObject(sr).$VDIs
    const unhealthyVdis = { __proto__: null }
    const children = groupBy(vdis, 'sm_config.vhd-parent')
    const cache = { __proto__: null }
    forEach(vdis, vdi => {
      if (vdi.managed && !vdi.is_a_snapshot) {
        const { uuid } = vdi
        const length = this._getUnhealthyVdiChainLength(uuid, children, cache)
        if (length !== 0) {
          unhealthyVdis[uuid] = length
        }
      }
    })
    return unhealthyVdis
  },

  async createSr({
    hostRef,

    content_type = 'user', // recommended by Citrix
    device_config = {},
    name_description = '',
    name_label,
    shared = false,
    physical_size = 0,
    sm_config = {},
    type,
  }) {
    const srRef = await this.call(
      'SR.create',
      hostRef,
      device_config,
      physical_size,
      name_label,
      name_description,
      type,
      content_type,
      shared,
      sm_config
    )

    return (await this.barrier(srRef)).uuid
  },
}
