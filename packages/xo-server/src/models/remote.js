import Collection from '../collection/redis'
import Model from '../model'
import { forEach } from '../utils'

// ===================================================================

export default class Remote extends Model {}

export class Remotes extends Collection {
  get Model () {
    return Remote
  }

  create (name, url) {
    return this.add(
      new Remote({
        name,
        url,
        enabled: false,
        error: '',
      })
    )
  }

  async save (remote) {
    return /* await */ this.update(remote)
  }

  async get (properties) {
    const remotes = await super.get(properties)
    forEach(remotes, remote => {
      remote.enabled = remote.enabled === 'true'
    })
    return remotes
  }
}
