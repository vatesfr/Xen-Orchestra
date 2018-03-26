/* eslint-env jest */

import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'
import rimraf from 'rimraf'
import LocalHandler from './remote-handlers/local.js'
import { tmpDir, pFromCallback } from './utils'
import vhdMerge, { chainVhd, Vhd } from './vhd-merge'

const initialDir = process.cwd()

jest.setTimeout(10000)

beforeEach(async () => {
  const dir = await tmpDir()
  process.chdir(dir)
})

afterEach(async () => {
  const tmpDir = process.cwd()
  process.chdir(initialDir)
  await pFromCallback(cb => rimraf(tmpDir, cb))
})

async function createRandomFile (name, sizeMo) {
  await execa('bash', [
    '-c',
    `< /dev/urandom tr -dc "\\t\\n [:alnum:]" | head -c ${sizeMo}M >${name}`,
  ])
}

async function checkFile (vhdName) {
  await execa('vhd-util', ['check', '-p', '-b', '-t', '-n', vhdName])
}

async function recoverRawContent (vhdName, rawName, originalSize) {
  await checkFile(vhdName)
  await execa('qemu-img', ['convert', '-fvpc', '-Oraw', vhdName, rawName])
  await execa('truncate', ['-s', originalSize, rawName])
}

async function convertFromRawToVhd (rawName, vhdName) {
  await execa('qemu-img', ['convert', '-f', 'raw', '-Ovpc', rawName, vhdName])
}

test('writeData on empty file', async () => {
  expect.assertions(1)
  const moOfRandom = 11
  await createRandomFile('randomfile', moOfRandom)
  await execa('qemu-img', ['create', '-fvpc', 'empty.vhd', moOfRandom + 'M'])
  const randomData = await fs.readFile('randomfile')
  const handler = new LocalHandler({ url: 'file://' + process.cwd() })
  const originalSize = await handler.getSize('randomfile')
  const newVhd = new Vhd(handler, 'empty.vhd')
  await newVhd.readHeaderAndFooter()
  await newVhd.readBlockTable()
  await newVhd.writeData(0, randomData)
  await recoverRawContent('empty.vhd', 'recovered', originalSize)
  expect(await fs.readFile('recovered')).toEqual(randomData)
})

test('writeData in 2 non-overlaping operations', async () => {
  expect.assertions(1)
  const moOfRandom = 11
  await createRandomFile('randomfile', moOfRandom)
  await execa('qemu-img', ['create', '-fvpc', 'empty.vhd', moOfRandom + 'M'])
  const randomData = await fs.readFile('randomfile')
  const handler = new LocalHandler({ url: 'file://' + process.cwd() })
  const originalSize = await handler.getSize('randomfile')
  const newVhd = new Vhd(handler, 'empty.vhd')
  await newVhd.readHeaderAndFooter()
  await newVhd.readBlockTable()
  const splitPointSectors = 4
  await newVhd.writeData(0, randomData.slice(0, splitPointSectors * 512))
  await newVhd.writeData(
    splitPointSectors,
    randomData.slice(splitPointSectors * 512)
  )
  await recoverRawContent('empty.vhd', 'recovered', originalSize)
  expect(await fs.readFile('recovered')).toEqual(randomData)
})

test('writeData in 2 overlaping operations', async () => {
  expect.assertions(1)
  const moOfRandom = 11
  await createRandomFile('randomfile', moOfRandom)
  await execa('qemu-img', ['create', '-fvpc', 'empty.vhd', moOfRandom + 'M'])
  const randomData = await fs.readFile('randomfile')
  const handler = new LocalHandler({ url: 'file://' + process.cwd() })
  const originalSize = await handler.getSize('randomfile')
  const newVhd = new Vhd(handler, 'empty.vhd')
  await newVhd.readHeaderAndFooter()
  await newVhd.readBlockTable()
  const endFirstWrite = 5
  const startSecondWrite = 3
  await newVhd.writeData(0, randomData.slice(0, endFirstWrite * 512))
  await newVhd.writeData(
    startSecondWrite,
    randomData.slice(startSecondWrite * 512)
  )
  await recoverRawContent('empty.vhd', 'recovered', originalSize)
  expect(await fs.readFile('recovered')).toEqual(randomData)
})

test('BAT can be extended and blocks moved', async () => {
  expect.assertions(1)
  const initalSize = 4
  await createRandomFile('randomfile', initalSize)
  await convertFromRawToVhd('randomfile', 'randomfile.vhd')
  const handler = new LocalHandler({ url: 'file://' + process.cwd() })
  const originalSize = await handler.getSize('randomfile')
  const newVhd = new Vhd(handler, 'randomfile.vhd')
  await newVhd.readHeaderAndFooter()
  await newVhd.readBlockTable()
  await newVhd.ensureBatSize(2000)
  await newVhd.freeFirstBlockSpace(8000000)
  await recoverRawContent('randomfile.vhd', 'recovered', originalSize)
  expect(await fs.readFile('recovered')).toEqual(
    await fs.readFile('randomfile')
  )
})

test('coalesce works with empty parent files', async () => {
  expect.assertions(1)
  const moOfRandom = 12
  await createRandomFile('randomfile', moOfRandom)
  await convertFromRawToVhd('randomfile', 'randomfile.vhd')
  await execa('qemu-img', [
    'create',
    '-fvpc',
    'empty.vhd',
    moOfRandom + 1 + 'M',
  ])
  await checkFile('randomfile.vhd')
  await checkFile('empty.vhd')
  const handler = new LocalHandler({ url: 'file://' + process.cwd() })
  const originalSize = await handler._getSize('randomfile')
  await chainVhd(handler, path.resolve('empty.vhd'), handler, 'randomfile.vhd')
  await checkFile('randomfile.vhd')
  await checkFile('empty.vhd')
  await vhdMerge(handler, 'empty.vhd', handler, 'randomfile.vhd')
  await recoverRawContent('empty.vhd', 'recovered', originalSize)
  expect(await fs.readFile('recovered')).toEqual(
    await fs.readFile('randomfile')
  )
})

test('coalesce works in normal cases', async () => {
  expect.assertions(1)
  const moOfRandom = 5
  await createRandomFile('randomfile', moOfRandom)
  await createRandomFile('small_randomfile', Math.ceil(moOfRandom / 2))
  await execa('qemu-img', [
    'create',
    '-fvpc',
    'parent.vhd',
    moOfRandom + 1 + 'M',
  ])
  await convertFromRawToVhd('randomfile', 'child1.vhd')
  const handler = new LocalHandler({ url: 'file://' + process.cwd() })
  await execa('vhd-util', ['snapshot', '-n', 'child2.vhd', '-p', 'child1.vhd'])
  const vhd = new Vhd(handler, 'child2.vhd')
  await vhd.readHeaderAndFooter()
  await vhd.readBlockTable()
  vhd.footer.creatorApplication = 'xoa'
  await vhd.writeFooter()

  const originalSize = await handler._getSize('randomfile')
  await chainVhd(handler, 'parent.vhd', handler, 'child1.vhd')
  await execa('vhd-util', ['check', '-t', '-n', 'child1.vhd'])
  await chainVhd(handler, 'child1.vhd', handler, 'child2.vhd')
  await execa('vhd-util', ['check', '-t', '-n', 'child2.vhd'])
  const smallRandom = await fs.readFile('small_randomfile')
  const newVhd = new Vhd(handler, 'child2.vhd')
  await newVhd.readHeaderAndFooter()
  await newVhd.readBlockTable()
  await newVhd.writeData(5, smallRandom)
  await checkFile('child2.vhd')
  await checkFile('child1.vhd')
  await checkFile('parent.vhd')
  await vhdMerge(handler, 'parent.vhd', handler, 'child1.vhd')
  await checkFile('parent.vhd')
  await chainVhd(handler, 'parent.vhd', handler, 'child2.vhd')
  await checkFile('child2.vhd')
  await vhdMerge(handler, 'parent.vhd', handler, 'child2.vhd')
  await checkFile('parent.vhd')
  await recoverRawContent(
    'parent.vhd',
    'recovered_from_coalescing',
    originalSize
  )
  await execa('cp', ['randomfile', 'randomfile2'])
  const fd = await fs.open('randomfile2', 'r+')
  try {
    await fs.write(fd, smallRandom, 0, smallRandom.length, 5 * 512)
  } finally {
    await fs.close(fd)
  }
  expect(await fs.readFile('recovered_from_coalescing')).toEqual(
    await fs.readFile('randomfile2')
  )
})
