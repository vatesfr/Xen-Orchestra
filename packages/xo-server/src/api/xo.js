import getStream from 'get-stream'
import { fromCallback } from 'promise-toolbox'
import { pipeline } from 'readable-stream'

import createNdJsonStream from '../_createNdJsonStream'

// ===================================================================

export function clean() {
  return this.clean()
}

clean.permission = 'admin'

// -------------------------------------------------------------------

export async function exportConfig({ entries, passphrase }) {
  let suffix = '/config.json'
  if (passphrase !== undefined) {
    suffix += '.enc'
  }

  return {
    $getFrom: await this.registerHttpRequest(
      (req, res) => {
        res.set({
          'content-disposition': 'attachment',
          'content-type': 'application/json',
        })

        return this.exportConfig({ entries, passphrase })
      },
      undefined,
      { suffix }
    ),
  }
}

exportConfig.permission = 'admin'

exportConfig.params = {
  entries: { type: 'array', items: { type: 'string' }, optional: true },
  passphrase: { type: 'string', optional: true },
}

// -------------------------------------------------------------------

function handleGetAllObjects(req, res, { filter, limit }) {
  const objects = this.getObjects({ filter, limit })
  res.set('Content-Type', 'application/json')
  return fromCallback(pipeline, createNdJsonStream(objects), res)
}

export function getAllObjects({ filter, limit, ndjson = false }) {
  return ndjson
    ? this.registerHttpRequest(handleGetAllObjects, {
        filter,
        limit,
      }).then($getFrom => ({ $getFrom }))
    : this.getObjects({ filter, limit })
}

getAllObjects.description = 'Returns all XO objects'

getAllObjects.params = {
  filter: { type: 'object', optional: true },
  limit: { type: 'number', optional: true },
  ndjson: { type: 'boolean', optional: true },
}

// -------------------------------------------------------------------

export async function importConfig({ passphrase }) {
  return {
    $sendTo: await this.registerHttpRequest(async (req, res) => {
      await this.importConfig(await getStream.buffer(req), { passphrase })

      res.end('config successfully imported')
    }),
  }
}

importConfig.permission = 'admin'

importConfig.params = {
  passphrase: { type: 'string', optional: true },
}
