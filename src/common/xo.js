import _ from 'messages'
import assign from 'lodash/assign'
import cookies from 'cookies-js'
import forEach from 'lodash/forEach'
import once from 'lodash/once'
import React from 'react'
import sortBy from 'lodash/fp/sortBy'
import throttle from 'lodash/throttle'
import Xo from 'xo-lib'
import { confirm } from 'modal'
import { createBackoff } from 'jsonrpc-websocket-client'
import { confirm } from 'modal'
import { info } from 'notification'
import { invoke, noop } from 'utils'
import { resolve } from 'url'
import {
  connected,
  disconnected,
  signedIn,
  signedOut,
  updateObjects
} from 'store/actions'

// ===================================================================

const xo = invoke(() => {
  const signOut = () => {
    cookies.expire('token')
    window.location.reload(true)
  }

  const token = cookies.get('token')
  if (!token) {
    signOut()
    throw new Error('no valid token')
  }

  const xo = new Xo({
    credentials: { token }
  })

  const connect = () => {
    xo.open(createBackoff()).catch(error => {
      console.error('failed to connect to xo-server', error)
    })
  }
  connect()

  xo.on('scheduledAttempt', ({ delay }) => {
    console.log('next attempt in %s ms', delay)
  })

  xo.on('closed', connect)

  return xo
})

// ===================================================================

export const connectStore = (store) => {
  let updates = {}
  const sendUpdates = throttle(() => {
    store.dispatch(updateObjects(updates))
    updates = {}
  }, 5e2)

  xo.on('open', () => store.dispatch(connected()))
  xo.on('closed', () => {
    store.dispatch(signedOut())
    store.dispatch(disconnected())
  })
  xo.on('authenticated', () => {
    store.dispatch(signedIn(xo.user))

    xo.call('xo.getAllObjects').then(objects => store.dispatch(updateObjects(objects)))
  })
  xo.on('notification', notification => {
    if (notification.method !== 'all') {
      return
    }

    assign(updates, notification.params.items)
    sendUpdates()
  })
}

// -------------------------------------------------------------------

export const resolveUrl = invoke(
  xo._url, // FIXME: accessing private prop
  baseUrl => to => resolve(baseUrl, to)
)

// -------------------------------------------------------------------

const createSubscription = cb => {
  const delay = 5e3

  const subscribers = Object.create(null)
  let n = 0
  let nextId = 0
  let timeout

  const loop = () => {
    new Promise(resolve => resolve(cb())).then(result => {
      forEach(subscribers, subscriber => {
        subscriber(result)
      })

      timeout = setTimeout(loop, delay)
    }, ::console.error)
  }

  return cb => {
    const id = nextId++
    subscribers[id] = cb

    if (!n++) {
      loop()
    }

    return once(() => {
      delete subscribers[id]

      if (!--n) {
        clearTimeout(timeout)
      }
    })
  }
}

// -------------------------------------------------------------------

export const subscribeJobs = createSubscription(() => xo.call('job.getAll'))

export const subscribePermissions = createSubscription(() => xo.call('acl.getCurrentPermissions'))

export const subscribePlugins = createSubscription(() => xo.call('plugin.get'))

export const subscribeRemotes = createSubscription(() => xo.call('remote.getAll'))

export const subscribeScheduleTable = createSubscription(() => xo.call('scheduler.getScheduleTable'))

export const subscribeSchedules = createSubscription(() => xo.call('schedule.getAll'))

export const subscribeServers = createSubscription(invoke(
  sortBy('host'),
  sort => () => xo.call('server.getAll').then(sort)
))

export const subscribeUsers = createSubscription(invoke(
  sortBy('email'),
  sort => () => xo.call('user.getAll').then(sort)
))

// ===================================================================

export const addServer = (host, username, password) => (
  xo.call('server.add', { host, username, password })
)

export const editServer = ({ id }, { host, username, password }) => (
  xo.call('server.set', { id, host, username, password })
)

export const connectServer = ({ id }) => (
  xo.call('server.connect', { id })
)

export const disconnectServer = ({ id }) => (
  xo.call('server.disconnect', { id })
)

export const removeServer = ({ id }) => (
  xo.call('server.remove', { id })
)

// -------------------------------------------------------------------

export const editHost = ({ id }, props) => (
  xo.call('host.set', { ...props, id })
)

export const fetchHostStats = ({ id }, granularity) => (
  xo.call('host.stats', { host: id, granularity })
)

export const restartHost = ({ id }, force = false) => (
  xo.call('host.restart', { id, force })
)

export const restartHostAgent = ({ id }) => (
  xo.call('host.restart_agent', { id })
)

export const startHost = ({ id }) => (
  xo.call('host.start', { id })
)

export const stopHost = ({ id }) => (
  xo.call('host.stop', { id })
)

export const enableHost = ({ id }) => (
  xo.call('host.enable', { id })
)

export const disableHost = ({ id }) => (
  xo.call('host.disable', { id })
)

export const getHostMissingPatches = ({ id }) => (
  xo.call('host.listMissingPatches', { host: id })
)

export const emergencyShutdownHost = ({ id }) => (
  xo.call('host.emergencyShutdownHost', { host: id })
)

export const installHostPatch = ({ id }, { uuid }) => (
  xo.call('host.installPatch', { host: id, patch: uuid })
)

export const installAllHostPatches = ({ id }) => (
  xo.call('host.installAllPatches', { host: id })
)

// -------------------------------------------------------------------

export const startVm = ({ id }) => (
  xo.call('vm.start', { id })
)

export const stopVm = ({ id }, force = false) => (
  xo.call('vm.stop', { id, force })
)

export const suspendVm = ({ id }) => (
  xo.call('vm.suspend', { id })
)

export const resumeVm = ({ id }) => (
  xo.call('vm.resume', { id })
)

export const recoveryStartVm = ({ id }) => (
  xo.call('vm.recoveryStart', { id })
)

export const restartVm = ({ id }, force = false) => (
  xo.call('vm.restart', { id, force })
)

export const cloneVm = ({ id, name_label: nameLabel }, fullCopy = false) => (
  xo.call('vm.clone', {
    id,
    name: `${nameLabel}_clone`,
    full_copy: fullCopy
  })
)

export const convertVmToTemplate = ({ id }) => (
  confirm({
    title: 'Convert to template',
    body: <div>
      <p>Are you sure you want to convert this VM into a template?</p>
      <p>This operation is definitive.</p>
    </div>
  }).then(
    () => xo.call('vm.convert', { id }),
    noop
  )
)

export const snapshotVm = ({ id, name_label: nameLabel }) => (
  xo.call('vm.snapshot', {
    id,
    name: `${nameLabel}_${new Date().toISOString()}`
  })
)

export const deleteVm = ({ id }, force = true) => (
  confirm({
    title: 'Remove VM',
    body: <div>
      <p>Are you sure you want to remove this VM?</p>
      <p>This operation is definitive.</p>
    </div>
  }).then(
    () => xo.call('vm.delete', { id, force }),
    noop
  )
)

export const revertSnapshot = ({ id }) => (
  xo.call('vm.revert', { id })
)

export const editVm = ({ id }, props) => (
  xo.call('vm.set', { ...props, id })
)

export const fetchVmStats = ({ id }, granularity) => (
  xo.call('vm.stats', { id, granularity })
)

// -------------------------------------------------------------------

export const editVdi = ({ id }, props) => (
  xo.call('vdi.set', { ...props, id })
)

export const deleteVdi = ({ id }) => (
  xo.call('vdi.delete', { id })
)

// -------------------------------------------------------------------

export const editNetwork = ({ id }, props) => (
  xo.call('network.set', { ...props, id })
)

// -------------------------------------------------------------------

export const deleteSr = ({ id }) => (
  confirm({
    title: 'Delete SR',
    body: <div>
      <p>Are you sure you want to remove this SR?</p>
      <p>This operation is definitive, and ALL DISKS WILL BE LOST FOREVER.</p>
    </div>
  }).then(
    () => { throw new Error('not implemented') },
    noop
  )
)

export const editSr = ({ id }, props) => (
  xo.call('sr.set', { ...props, id })
)

// -------------------------------------------------------------------

export const deleteMessage = ({ id }) => (
  xo.call('message.delete', { id })
)

// -------------------------------------------------------------------

export const addTag = (id, tag) => (
  xo.call('tag.add', { id, tag })
)

export const removeTag = (id, tag) => (
  xo.call('tag.remove', { id, tag })
)

// -------------------------------------------------------------------

export const createSchedule = (jobId, cron, enabled) => (
  xo.call('schedule.create', { jobId, cron, enabled })
)

export const createJob = (job) => (
  xo.call('job.create', { job })
)

export const runJob = jobId => {
  info(_('runJob'), _('runJobVerbose'))
  return xo.call('job.runSequence', { idSequence: [jobId] })
}

export const enableSchedule = (scheduleId) => (
  xo.call('scheduler.enable', { id: scheduleId })
)

export const disableSchedule = (scheduleId) => (
  xo.call('scheduler.disable', { id: scheduleId })
)

// -------------------------------------------------------------------

export const loadPlugin = async id => {
  try {
    await xo.call('plugin.load', { id })
  } catch (error) {
    info(_('pluginError'), error.data || _('unknownPluginError'))
  }
}

export const unloadPlugin = async id => {
  try {
    await xo.call('plugin.unload', { id })
  } catch (error) {
    info(_('pluginError'), error.data || _('unknownPluginError'))
  }
}

export const enablePluginAutoload = id => (
  xo.call('plugin.enableAutoload', { id })
)

export const disablePluginAutoload = id => (
  xo.call('plugin.disableAutoload', { id })
)

export const configurePlugin = (id, configuration) => {
  try {
    xo.call('plugin.configure', { id, configuration })
  } catch (error) {
    info(_('pluginError'), error.data || _('unknownPluginError'))
  }
}

export const purgePluginConfiguration = async id => {
  try {
    await confirm(_('purgePluginConfiguration'), _('purgePluginConfigurationQuestion'))
    await xo.call('plugin.purgeConfiguration', { id })
    return true
  } catch (_) {
    return false
  }
}
