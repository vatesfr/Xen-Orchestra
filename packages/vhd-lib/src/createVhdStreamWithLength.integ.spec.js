/* eslint-env jest */

import asyncIteratorToStream from 'async-iterator-to-stream'
import execa from 'execa'
import fs from 'fs-extra'
import rimraf from 'rimraf'
import getStream from 'get-stream'
import tmp from 'tmp'
import { createReadStream, createWriteStream } from 'fs'
import { pFromCallback } from 'promise-toolbox'
import { pipeline } from 'readable-stream'

import { createVhdStreamWithLength } from '.'
import { FOOTER_SIZE } from './_constants'

let tempDir = null

beforeEach(async () => {
  tempDir = await pFromCallback(cb => tmp.dir(cb))
})

afterEach(async () => {
  await pFromCallback(cb => rimraf(tempDir, cb))
})

async function convertFromRawToVhd(rawName, vhdName) {
  await execa('qemu-img', ['convert', '-f', 'raw', '-Ovpc', rawName, vhdName])
}

async function createRandomFile(name, size) {
  const createRandomStream = asyncIteratorToStream(function*(size) {
    while (size-- > 0) {
      yield Buffer.from([Math.floor(Math.random() * 256)])
    }
  })
  const input = await createRandomStream(size)
  await pFromCallback(cb => pipeline(input, fs.createWriteStream(name), cb))
}

test('createVhdStreamWithLength can extract length', async () => {
  const initialSize = 4 * 1024
  const rawFileName = `${tempDir}/randomfile`
  const vhdName = `${tempDir}/randomfile.vhd`
  const outputVhdName = `${tempDir}/output.vhd`
  await createRandomFile(rawFileName, initialSize)
  await convertFromRawToVhd(rawFileName, vhdName)
  const { size: vhdSize } = await fs.stat(vhdName)

  const result = await createVhdStreamWithLength(
    await createReadStream(vhdName)
  )
  expect(result.length).toEqual(vhdSize)
  const outputFileStream = await createWriteStream(outputVhdName)
  await pFromCallback(cb => pipeline(result, outputFileStream, cb))
  const { size: outputSize } = await fs.stat(outputVhdName)
  expect(outputSize).toEqual(vhdSize)
})

test('createVhdStreamWithLength can handle empty VHD files', async () => {
  const initialSize = 0
  const rawFileName = `${tempDir}/randomfile`
  const vhdName = `${tempDir}/randomfile.vhd`
  const outputVhdName = `${tempDir}/output.vhd`
  await createRandomFile(rawFileName, initialSize)
  await convertFromRawToVhd(rawFileName, vhdName)
  const { size: vhdSize } = await fs.stat(vhdName)
  const result = await createVhdStreamWithLength(
    await createReadStream(vhdName)
  )
  expect(result.length).toEqual(vhdSize)
  const outputFileStream = await createWriteStream(outputVhdName)
  await pFromCallback(cb => pipeline(result, outputFileStream, cb))
  const { size: outputSize } = await fs.stat(outputVhdName)
  expect(outputSize).toEqual(vhdSize)
})

test('createVhdStreamWithLength can skip blank after the last block and before the footer', async () => {
  const initialSize = 4 * 1024
  const rawFileName = `${tempDir}/randomfile`
  const vhdName = `${tempDir}/randomfile.vhd`
  const outputVhdName = `${tempDir}/output.vhd`
  await createRandomFile(rawFileName, initialSize)
  await convertFromRawToVhd(rawFileName, vhdName)
  const { size: vhdSize } = await fs.stat(vhdName)
  // read file footer
  const footer = await getStream.buffer(
    createReadStream(vhdName, { start: vhdSize - FOOTER_SIZE })
  )

  // we'll override the footer
  const endOfFile = await createWriteStream(vhdName, {
    flags: 'r+',
    start: vhdSize - FOOTER_SIZE,
  })
  // write a blank over the previous footer
  await pFromCallback(cb => endOfFile.write(Buffer.alloc(FOOTER_SIZE), cb))
  // write the footer after the new blank
  await pFromCallback(cb => endOfFile.end(footer, cb))
  const { size: longerSize } = await fs.stat(vhdName)
  // check input file has been lengthened
  expect(longerSize).toEqual(vhdSize + FOOTER_SIZE)
  const result = await createVhdStreamWithLength(
    await createReadStream(vhdName)
  )
  expect(result.length).toEqual(vhdSize)
  const outputFileStream = await createWriteStream(outputVhdName)
  await pFromCallback(cb => pipeline(result, outputFileStream, cb))
  const { size: outputSize } = await fs.stat(outputVhdName)
  // check out file has been shortened again
  expect(outputSize).toEqual(vhdSize)
  await execa('qemu-img', ['compare', outputVhdName, vhdName])
})
