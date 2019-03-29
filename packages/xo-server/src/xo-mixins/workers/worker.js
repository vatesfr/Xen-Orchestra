// @flow

import defer from 'golike-defer'
import { type Remote, getHandler } from '@xen-orchestra/fs'
import { mergeVhd as mergeVhd_ } from 'vhd-lib'

// Use Bluebird for all promises as it provides better performance and
// less memory usage.
//
// $FlowFixMe
global.Promise = require('bluebird')

// $FlowFixMe
const config: Object = JSON.parse(process.env.XO_CONFIG)

export const mergeVhd = defer(async function(
  $defer: any,
  parentRemote: Remote,
  parentPath: string,
  childRemote: Remote,
  childPath: string
) {
  const parentHandler = getHandler(parentRemote, config.remoteOptions)
  const childHandler = getHandler(childRemote, config.remoteOptions)

  await parentHandler.sync()
  $defer.call(parentHandler, 'forget')

  await childHandler.sync()
  $defer.call(childHandler, 'forget')

  return mergeVhd_(parentHandler, parentPath, childHandler, childPath)
})
