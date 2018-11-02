import execa from 'execa'
import fs from 'fs-extra'
import { join } from 'path'
import { tmpdir } from 'os'

import LocalHandler from './local'

const DEFAULT_NFS_OPTIONS = 'vers=3'

export default class NfsHandler extends LocalHandler {
  constructor (
    remote,
    { mountsDir = join(tmpdir(), 'xo-fs-mounts'), ...opts } = {}
  ) {
    super(remote, opts)

    this._realPath = join(mountsDir, remote.id)
  }

  get type () {
    return 'nfs'
  }

  _getRealPath () {
    return this._realPath
  }

  async _mount () {
    await fs.ensureDir(this._getRealPath())
    const { host, path, port, options } = this._remote
    return execa(
      'mount',
      [
        '-t',
        'nfs',
        '-o',
        DEFAULT_NFS_OPTIONS + (options !== undefined ? `,${options}` : ''),
        `${host}${port !== undefined ? ':' + port : ''}:${path}`,
        this._getRealPath(),
      ],
      {
        env: {
          LANG: 'C',
        },
      }
    ).catch(error => {
      if (!error.stderr.includes('already mounted')) {
        throw error
      }
    })
  }

  async _sync () {
    if (this._remote.enabled) {
      await this._mount()
    } else {
      await this._umount()
    }

    return this._remote
  }

  async _forget () {
    try {
      await this._umount(this._remote)
    } catch (_) {
      // We have to go on...
    }
  }

  async _umount () {
    await execa('umount', ['--force', this._getRealPath()], {
      env: {
        LANG: 'C',
      },
    }).catch(error => {
      if (!error.stderr.includes('not mounted')) {
        throw error
      }
    })
  }
}
