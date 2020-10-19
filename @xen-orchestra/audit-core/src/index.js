// see https://github.com/babel/babel/issues/8450
import 'core-js/features/symbol/async-iterator'

import assert from 'assert'
import createLogger from '@xen-orchestra/log'
import defer from 'golike-defer'
import hash from 'object-hash'

const log = createLogger('xo:audit-core')

export class Storage {
  constructor() {
    this._lock = Promise.resolve()
  }

  async acquireLock() {
    const lock = this._lock
    let releaseLock
    this._lock = new Promise(resolve => {
      releaseLock = resolve
    })
    await lock
    return releaseLock
  }
}

// Format: $<algorithm>$<salt>$<encrypted>
//
// http://man7.org/linux/man-pages/man3/crypt.3.html#NOTES
const ID_TO_ALGORITHM = {
  5: 'sha256',
}

export class AlteredRecordError extends Error {
  constructor(id, nValid, record) {
    super('altered record')

    this.id = id
    this.nValid = nValid
    this.record = record
  }
}

export class MissingRecordError extends Error {
  constructor(id, nValid) {
    super('missing record')

    this.id = id
    this.nValid = nValid
  }
}

export const NULL_ID = 'nullId'

const HASH_ALGORITHM_ID = '5'
const createHash = (data, algorithmId = HASH_ALGORITHM_ID) =>
  `$${algorithmId}$$${hash(data, {
    algorithm: ID_TO_ALGORITHM[algorithmId],
    excludeKeys: key => key === 'id',
  })}`

export class AuditCore {
  constructor(storage) {
    assert.notStrictEqual(storage, undefined)
    this._storage = storage
  }

  @defer
  async add($defer, subject, event, data) {
    const time = Date.now()
    $defer(await this._storage.acquireLock())
    return this._addUnsafe({
      data,
      event,
      subject,
      time,
    })
  }

  async _addUnsafe({ data, event, subject, time }) {
    const storage = this._storage

    // delete "undefined" properties and normalize data with JSON.stringify
    const record = JSON.parse(
      JSON.stringify({
        data,
        event,
        previousId: (await storage.getLastId()) ?? NULL_ID,
        subject,
        time,
      })
    )
    record.id = createHash(record)
    await storage.put(record)
    await storage.setLastId(record.id)
    return record
  }

  async checkIntegrity(oldest, newest) {
    const storage = this._storage

    // handle separated chains case
    if (newest !== (await storage.getLastId())) {
      let isNewestAccessible = false
      for await (const { id } of this.getFrom()) {
        if (id === newest) {
          isNewestAccessible = true
          break
        }
      }
      if (!isNewestAccessible) {
        throw new MissingRecordError(newest, 0)
      }
    }

    let nValid = 0
    while (newest !== oldest) {
      const record = await storage.get(newest)
      if (record === undefined) {
        throw new MissingRecordError(newest, nValid)
      }
      if (
        newest !== createHash(record, newest.slice(1, newest.indexOf('$', 1)))
      ) {
        throw new AlteredRecordError(newest, nValid, record)
      }
      newest = record.previousId
      nValid++
    }
    return nValid
  }

  async *getFrom(newest) {
    const storage = this._storage

    let id = newest ?? (await storage.getLastId())
    if (id === undefined) {
      return
    }

    let record
    while ((record = await storage.get(id)) !== undefined) {
      yield record
      id = record.previousId
    }
  }

  async deleteFrom(newest) {
    assert.notStrictEqual(newest, undefined)
    for await (const { id } of this.getFrom(newest)) {
      await this._storage.del(id)
    }
  }

  @defer
  async deleteRangeAndRewrite($defer, newest, oldest) {
    assert.notStrictEqual(newest, undefined)
    assert.notStrictEqual(oldest, undefined)

    const storage = this._storage
    $defer(await storage.acquireLock())

    assert.notStrictEqual(await storage.get(newest), undefined)
    const oldestRecord = await storage.get(oldest)
    assert.notStrictEqual(oldestRecord, undefined)

    const lastId = await storage.getLastId()
    const recentRecords = []
    for await (const record of this.getFrom(lastId)) {
      if (record.id === newest) {
        break
      }

      recentRecords.push(record)
    }

    for await (const record of this.getFrom(newest)) {
      await storage.del(record.id)
      if (record.id === oldest) {
        break
      }
    }

    await storage.setLastId(oldestRecord.previousId)

    for (const record of recentRecords) {
      try {
        await this._addUnsafe(record)
        await storage.del(record.id)
      } catch (error) {
        log.error(error)
      }
    }
  }
}
