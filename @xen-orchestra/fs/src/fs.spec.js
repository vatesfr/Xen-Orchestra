/* eslint-env jest */

import 'dotenv/config'
import getStream from 'get-stream'
import { tmpdir } from 'os'

import { getHandler } from '.'

// https://gist.github.com/julien-f/3228c3f34fdac01ade09
const unsecureRandomBytes = n => {
  const bytes = Buffer.alloc(n)

  const odd = n & 1
  for (let i = 0, m = n - odd; i < m; i += 2) {
    bytes.writeUInt16BE((Math.random() * 65536) | 0, i)
  }

  if (odd) {
    bytes.writeUInt8((Math.random() * 256) | 0, n - 1)
  }

  return bytes
}

const TEST_DATA = unsecureRandomBytes(1024)

const rejectionOf = p =>
  p.then(
    value => {
      throw value
    },
    reason => reason
  )

const handlers = [`file://${tmpdir()}`]
if (process.env.xo_fs_nfs) handlers.push(process.env.xo_fs_nfs)
if (process.env.xo_fs_smb) handlers.push(process.env.xo_fs_smb)

handlers.forEach(url => {
  describe(url, () => {
    let handler

    beforeAll(async () => {
      handler = getHandler({ url })
      await handler.sync()

      handler.prefix = `xo-fs-tests-${Date.now()}`
    })
    afterAll(async () => {
      await handler.forget()
      handler = undefined
    })

    afterEach(async () => {
      // don't use the prefix feature for the final clean to avoid deleting
      // everything on the remote if it's broken
      const { prefix } = handler
      expect(prefix).not.toBe('/')
      handler.prefix = '/'
      await handler.rmdir(prefix, { recursive: true }).catch(error => {
        if (error.code !== 'ENOENT') {
          throw error
        }
      })
      handler.prefix = prefix
    })

    describe('#test()', () => {
      it('tests the remote appears to be working', async () => {
        expect(await handler.test()).toEqual({
          success: true,
        })
      })
    })

    describe('#outputFile()', () => {
      it('writes data to a file', async () => {
        await handler.outputFile('file', TEST_DATA)
        expect(await handler.readFile('file')).toEqual(TEST_DATA)
      })

      it('throws on existing files', async () => {
        await handler.outputFile('file', '')
        const error = await rejectionOf(handler.outputFile('file', ''))
        expect(error.code).toBe('EEXIST')
      })
    })

    describe('#readFile', () => {
      it('returns a buffer containing the contents of the file', async () => {
        await handler.outputFile('file', TEST_DATA)
        expect(await handler.readFile('file')).toEqual(TEST_DATA)
      })

      it('throws on missing file', async () => {
        const error = await rejectionOf(handler.readFile('file'))
        expect(error.code).toBe('ENOENT')
      })
    })

    describe('#list()', () => {
      it(`should list the content of folder`, async () => {
        await handler.outputFile('file', TEST_DATA)
        await expect(await handler.list('.')).toEqual(['file'])
      })
    })

    describe('#createReadStream()', () => {
      it(`should return a stream`, async () => {
        await handler.outputFile('file', TEST_DATA)
        const buffer = await getStream.buffer(
          await handler.createReadStream('file')
        )

        await expect(buffer).toEqual(TEST_DATA)
      })
    })
    describe('#getSize()', () => {
      it(`should return the correct size`, async () => {
        await handler.outputFile('file', TEST_DATA)
        expect(await handler.getSize('file')).toEqual(TEST_DATA.length)
      })
    })

    describe('#rename()', () => {
      it(`should rename the file`, async () => {
        await handler.outputFile('file', TEST_DATA)
        await handler.rename('file', `file2`)

        expect(await handler.list('.')).toEqual(['file2'])
        expect(await handler.readFile(`file2`)).toEqual(TEST_DATA)
      })
    })

    describe('#unlink()', () => {
      it(`should remove the file`, async () => {
        await handler.outputFile('file', TEST_DATA)
        await handler.unlink('file')

        await expect(await handler.list('.')).toEqual([])
      })
    })

    describe('#rmdir()', () => {
      it(`should remove folder resursively`, async () => {
        await handler.outputFile('file', TEST_DATA)
        await handler.rmdir('.', { recursive: true })

        const error = await rejectionOf(handler.list('.'))
        expect(error.code).toBe('ENOENT')
      })

      it(`should throw an error when recursive is false`, async () => {
        await handler.outputFile('file', TEST_DATA)

        const error = await rejectionOf(handler.rmdir('.'))
        await expect(error.code).toEqual('ENOTEMPTY')
      })
    })
  })
})
