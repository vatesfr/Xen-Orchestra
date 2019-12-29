import forEach from 'lodash/forEach'
import getKeys from 'lodash/keys'
import moment from 'moment-timezone'

import { noSuchObject } from 'xo-common/api-errors'
import { version as xoServerVersion } from '../../package.json'

// ===================================================================

export function getMethodsInfo() {
  const methods = {}

  forEach(this.apiMethods, (method, name) => {
    methods[name] = {
      description: method.description,
      params: method.params || {},
      permission: method.permission,
    }
  })

  return methods
}
getMethodsInfo.description =
  'returns the signatures of all available API methods'

// -------------------------------------------------------------------

export const getServerTimezone = (tz => () => tz)(moment.tz.guess())
getServerTimezone.description = 'return the timezone server'

// -------------------------------------------------------------------

export const getServerVersion = () => xoServerVersion
getServerVersion.description = 'return the version of xo-server'

// -------------------------------------------------------------------

export const getVersion = () => '0.1'
getVersion.description = 'API version (unstable)'

// -------------------------------------------------------------------

export function listMethods() {
  return getKeys(this.apiMethods)
}
listMethods.description = 'returns the name of all available API methods'

// -------------------------------------------------------------------

export function methodSignature({ method: name }) {
  const method = this.apiMethods[name]

  if (!method) {
    throw noSuchObject()
  }

  // Return an array for compatibility with XML-RPC.
  return [
    // XML-RPC require the name of the method.
    {
      name,
      description: method.description,
      params: method.params || {},
      permission: method.permission,
    },
  ]
}
methodSignature.description = 'returns the signature of an API method'
