import cookies from 'cookies-js'
import isFunction from 'lodash/isFunction'
import xo from 'xo'
import { createBackoff } from 'jsonrpc-websocket-client'

// ===================================================================

const createAction = (() => {
  const { defineProperty } = Object
  const noop = function () {
    if (arguments.length) {
      throw new Error('this action expects no payload!')
    }
  }

  return (type, payloadCreator = noop) => {
    const createActionObject = (payload) => {
      if (isFunction(payload)) {
        return payload
      }

      let then
      if (
        payload != null &&
        isFunction(then = payload.then)
      ) {
        return then.call(payload, createActionObject)
      }

      return { type, payload }
    }

    return defineProperty(
      (...args) => createActionObject(payloadCreator(...args)),
      'toString',
      { value: () => type }
    )
  }
})()

// ===================================================================

export const selectLang = createAction('SELECT_LANG', (lang) => lang)

// ===================================================================

export const connected = createAction('CONNECTED')
export const disconnected = createAction('DISCONNECTED')
export const addObjects = createAction('ADD_OBJECTS', (objects) => objects)
export const removeObjects = createAction('REMOVE_OBJECTS', (objects) => objects)

export const signedIn = createAction('SIGNED_IN', (user) => user)
export const signIn = createAction('SIGN_IN', (credentials) => (dispatch) => {
  xo.signIn(credentials).then(() => {
    dispatch(signedIn(xo.user))

    xo.call('xo.getAllObjects').then((objects) => {
      dispatch(addObjects(objects))
    })

    if (!credentials.token) {
      xo.call('token.create').then((token) => {
        cookies.set('token', token)
      })
    }
  })
})

export const connect = createAction('CONNECT', () => (dispatch) => {
  const connect = () => {
    xo.open(createBackoff()).catch((error) => {
      console.error('failed to connect to xo-server', error)
    })
  }
  xo.on('scheduledAttempt', ({ delay }) => {
    console.log('next attempt in %s ms', delay)
  })
  connect()

  xo.on('open', () => {
    dispatch(connected())

    // FIXME: maybe the token should be stored initially in the Redux
    // store. (Maybe not)
    const token = cookies.get('token')
    if (token) {
      dispatch(signIn({ token }))
    }
  })
  xo.on('closed', () => {
    dispatch(disconnected())

    connect()
  })
  xo.on('notification', (notification) => {
    if (notification.method !== 'all') {
      return
    }

    const { params } = notification
    dispatch((
      params.type === 'enter'
        ? addObjects
        : removeObjects
    )(params.items))
  })
})

const vmStarted = createAction('VM_STARTED', (id) => id)
export const startVm = createAction('START_VM', (id) => (dispatch) => {
  xo.call('vm.start', { id }).then(() => {
    dispatch(vmStarted(id))
  })
})

const vmStopped = createAction('VM_STOPPED', (id) => id)
export const stopVm = createAction('STOP_VM', (id) => (dispatch) => {
  xo.call('vm.stop', { id }).then(() => {
    dispatch(vmStopped(id))
  })
})

const tagAdded = createAction('TAG_ADDED', (id, tag) => ({ id, tag }))
export const addTag = createAction('ADD_TAG', (id, tag) => (dispatch) => {
  xo.call('tag.add', { id, tag }).then(() => {
    dispatch(tagAdded(id, tag))
  })
})

const tagRemoved = createAction('TAG_REMOVED', (id, tag) => ({ id, tag }))
export const removeTag = createAction('REMOVE_TAG', (id, tag) => (dispatch) => {
  xo.call('tag.remove', { id, tag }).then(() => {
    dispatch(tagRemoved(id, tag))
  })
})
