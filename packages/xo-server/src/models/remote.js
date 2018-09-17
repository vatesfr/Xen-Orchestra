import Collection from '../collection/redis'
import Model from '../model'
import { forEach } from '../utils'

// ===================================================================

export default class Remote extends Model {}

export class Remotes extends Collection {
  get Model () {
    return Remote
  }

  async get (properties) {
    const remotes = await super.get(properties)
    forEach(remotes, remote => {
      remote.enabled = remote.enabled === 'true'
      remote.connected = remote.error === ''
    })
    return remotes
  }
}
