import * as actions from 'store/actions'
import every from 'lodash/every'
import forEach from 'lodash/forEach'
import humanFormat from 'human-format'
import isArray from 'lodash/isArray'
import isEmpty from 'lodash/isEmpty'
import isFunction from 'lodash/isFunction'
import isPlainObject from 'lodash/isPlainObject'
import isString from 'lodash/isString'
import map from 'lodash/map'
import mapValues from 'lodash/mapValues'
import React from 'react'
import replace from 'lodash/replace'
import { connect } from 'react-redux'

import BaseComponent from './base-component'
import invoke from './invoke'

export const EMPTY_ARRAY = Object.freeze([ ])
export const EMPTY_OBJECT = Object.freeze({ })

// ===================================================================

export const ensureArray = (value) => {
  if (value === undefined) {
    return []
  }

  return Array.isArray(value) ? value : [ value ]
}

export const propsEqual = (o1, o2, props) => {
  props = ensureArray(props)

  for (const prop of props) {
    if (o1[prop] !== o2[prop]) {
      return false
    }
  }

  return true
}

// ===================================================================

export const addSubscriptions = subscriptions => Component => {
  class SubscriptionWrapper extends BaseComponent {
    constructor () {
      super()

      this._unsubscribes = null
    }

    componentWillMount () {
      this._unsubscribes = map(subscriptions, (subscribe, prop) =>
        subscribe(value => this.setState({ [prop]: value }))
      )
    }

    componentWillUnmount () {
      forEach(this._unsubscribes, unsubscribe => unsubscribe())
      this._unsubscribes = null
    }

    render () {
      return <Component
        {...this.props}
        {...this.state}
      />
    }
  }

  return SubscriptionWrapper
}

// -------------------------------------------------------------------

export const checkPropsState = (propsNames, stateNames) => Component => {
  const nProps = propsNames && propsNames.length
  const nState = stateNames && stateNames.length

  Component.prototype.shouldComponentUpdate = (newProps, newState) => {
    const { props, state } = this

    for (let i = 0; i < nProps; ++i) {
      const name = propsNames[i]
      if (newProps[name] !== props[name]) {
        return true
      }
    }

    for (let i = 0; i < nState; ++i) {
      const name = stateNames[i]
      if (newState[name] !== state[name]) {
        return true
      }
    }
  }

  return Component
}

// -------------------------------------------------------------------

const _normalizeMapStateToProps = mapper => {
  if (isFunction(mapper)) {
    let factoryOrMapper = (state, props) => {
      const result = mapper(state, props)

      // Properly handles factory pattern.
      if (isFunction(result)) {
        mapper = result
        return factoryOrMapper
      }

      if (isPlainObject(result)) {
        if (isEmpty(result)) {
          // Nothing can be determined, wait for it.
          return result
        }

        if (every(result, isFunction)) {
          indirection = (state, props) => mapValues(result, selector => selector(state, props))
          return indirection(state, props)
        }
      }

      indirection = mapper
      return result
    }

    let indirection = factoryOrMapper
    return (state, props) => indirection(state, props)
  }

  mapper = mapValues(mapper, _normalizeMapStateToProps)
  return (state, props) => mapValues(mapper, fn => fn(state, props))
}

export const connectStore = (mapStateToProps, opts = {}) => {
  const connector = connect(
    _normalizeMapStateToProps(mapStateToProps),
    actions,
    undefined,
    opts
  )

  return Component => {
    const ConnectedComponent = connector(Component)

    if (opts.withRef && 'value' in Component.prototype) {
      Object.defineProperty(ConnectedComponent.prototype, 'value', {
        configurable: true,
        get () {
          return this.getWrappedInstance().value
        },
        set (value) {
          this.getWrappedInstance().value = value
        }
      })
    }

    return ConnectedComponent
  }
}

// -------------------------------------------------------------------

export { default as Debug } from './debug'

// -------------------------------------------------------------------

// Returns the first defined (non-null, non-undefined) value.
export const firstDefined = function () {
  const n = arguments.length
  for (let i = 0; i < n; ++i) {
    const arg = arguments[i]
    if (arg != null) {
      return arg
    }
  }
}
// -------------------------------------------------------------------

// Returns the current XOA Plan or the Plan name if number given
export const getXoaPlan = plan => {
  switch (plan || +process.env.XOA_PLAN) {
    case 1:
      return 'Free'
    case 2:
      return 'Starter'
    case 3:
      return 'Enterprise'
    case 4:
      return 'Premium'
    case 5:
      return 'Community'
  }
  return 'Unknown'
}

// -------------------------------------------------------------------

export const mapPlus = (collection, cb) => {
  const result = []
  const push = ::result.push
  forEach(collection, value => cb(value, push))
  return result
}

// -------------------------------------------------------------------

export const noop = () => {}

// -------------------------------------------------------------------

export const osFamily = invoke({
  centos: [ 'centos' ],
  debian: [ 'debian' ],
  fedora: [ 'fedora' ],
  freebsd: [ 'freebsd' ],
  gentoo: [ 'gentoo' ],
  linux: [ 'coreos' ],
  'linux-mint': [ 'linux-mint' ],
  netbsd: [ 'netbsd' ],
  oracle: [ 'oracle' ],
  osx: [ 'osx' ],
  redhat: [ 'redhat', 'rhel' ],
  solaris: [ 'solaris' ],
  suse: [ 'sles', 'suse' ],
  ubuntu: [ 'ubuntu' ],
  windows: [ 'windows' ]
}, osByFamily => {
  const osToFamily = Object.create(null)
  forEach(osByFamily, (list, family) => {
    forEach(list, os => {
      osToFamily[os] = family
    })
  })

  return osName => osName && osToFamily[osName.toLowerCase()]
})

// -------------------------------------------------------------------

export const formatSize = bytes => humanFormat(bytes, { scale: 'binary', unit: 'B' })

export const formatSizeRaw = bytes => humanFormat.raw(bytes, { scale: 'binary', unit: 'B' })

export const parseSize = size => {
  let bytes = humanFormat.parse.raw(size, { scale: 'binary' })
  if (bytes.unit && bytes.unit !== 'B') {
    bytes = humanFormat.parse.raw(size)

    if (bytes.unit && bytes.unit !== 'B') {
      throw new Error('invalid size: ' + size)
    }
  }
  return Math.floor(bytes.value * bytes.factor)
}

// -------------------------------------------------------------------

export const normalizeXenToolsStatus = status => {
  if (status === false) {
    return 'not-installed'
  }
  if (status === undefined) {
    return 'unknown'
  }
  if (status === 'up to date') {
    return 'up-to-date'
  }
  return 'out-of-date'
}

// -------------------------------------------------------------------

const _NotFound = () => <h1>Page not found</h1>

// Decorator to declare routes on a component.
//
// TODO: add support for function childRoutes (getChildRoutes).
export const routes = (indexRoute, childRoutes) => target => {
  if (isArray(indexRoute)) {
    childRoutes = indexRoute
    indexRoute = undefined
  } else if (isFunction(indexRoute)) {
    indexRoute = {
      component: indexRoute
    }
  } else if (isString(indexRoute)) {
    indexRoute = {
      onEnter: invoke(indexRoute, pathname => (state, replace) => {
        const current = state.location.pathname
        replace((current === '/' ? '' : current) + '/' + pathname)
      })
    }
  }

  if (isPlainObject(childRoutes)) {
    childRoutes = map(childRoutes, (component, path) => {
      // The logic can be bypassed by passing a plain object.
      if (isPlainObject(component)) {
        return { ...component, path }
      }

      return { ...component.route, component, path }
    })
  }

  if (childRoutes) {
    childRoutes.push({ component: _NotFound, path: '*' })
  }

  target.route = {
    indexRoute,
    childRoutes
  }

  return target
}

// -------------------------------------------------------------------

// Creates a new function which throws an error.
//
// ```js
// promise.catch(throwFn('an error has occured'))
//
// function foo (param = throwFn('param is required')) {}
// ```
export const throwFn = error => () => {
  throw (
    isString(error)
      ? new Error(error)
      : error
  )
}

// -------------------------------------------------------------------

export function tap (cb) {
  return this.then(value =>
    Promise.resolve(cb(value)).then(() => value)
  )
}

export function rethrow (cb) {
  return this.catch(error =>
    Promise.resolve(cb(error)).then(() => { throw error })
  )
}

// -------------------------------------------------------------------

// Generates an array of strings from a pattern and a map of rules.
//
// ```js
// generateStrings('foo_name_bar_index', 3, {
//    foo: 'baz',
//    name: [ 'John', 'Jane', 'Jack' ],
//    index: 1 // if not a string and not an array, replaced by the iteration index (1, 2, 3 ...)
// })
// --> [ 'baz_John_bar_1', 'baz_Jane_bar_2', 'baz_Jack_bar_3' ]
// ```
export function generateStrings (pattern, n, map) {
  let _firstPassString = pattern
  const _map = map
  // First pass: processes replacements that don't require an iteration (e.g.: { foo: 'baz' })
  forEach(_map, (value, key) => {
    if (isString(value)) {
      _firstPassString = replace(_firstPassString, new RegExp(key, 'g'), value)
      delete _map[key]
    }
  })
  const strings = []
  // Second pass: processes replacements that require an iteration (e.g.: { name: [ 'John', 'Jane', 'Jack' ] })
  for (let i = 1; i <= n; i++) {
    let _secondPassString = _firstPassString
    forEach(_map, (values, key) => {
      _secondPassString = replace(
        _secondPassString,
        new RegExp(key, 'g'),
        isArray(values)
          ? values[i - 1] || '' // array of explicit substitutes
          : i // 1, 2, 3 ...
      )
    })
    strings.push(_secondPassString)
  }
  return strings
}
