export function createJob (props) {
  return this.createBackupNgJob({
    props,
    userId: this.user.id,
  })
}

createJob.permission = 'admin'
createJob.params = {
  compression: {
    enum: ['', 'native'],
    optional: true,
  },
  mode: {
    enum: ['full', 'delta'],
  },
  name: {
    type: 'string',
    optional: true,
  },
  remotes: {
    type: 'object',
    optional: true,
  },
  settings: {
    type: 'object',
  },
  vms: {
    type: 'object',
  },
}

export function deleteJob ({ id }) {
  return this.deleteBackupNgJob(id)
}
deleteJob.permission = 'admin'
deleteJob.params = {
  id: {
    type: 'string',
  },
}

export function editJob (props) {
  return this.editBackupNgJob(props)
}

editJob.permission = 'admin'
editJob.params = {
  compression: {
    enum: ['', 'native'],
    optional: true,
  },
  id: {
    type: 'string',
  },
  mode: {
    enum: ['full', 'delta'],
    optional: true,
  },
  name: {
    type: 'string',
    optional: true,
  },
  remotes: {
    type: 'object',
    optional: true,
  },
  settings: {
    type: 'object',
    optional: true,
  },
  vms: {
    type: 'object',
    optional: true,
  },
}

export function getAllJobs () {
  return this.getAllBackupNgJobs()
}

getAllJobs.permission = 'admin'

export function getJob ({ id }) {
  return this.getBackupNgJob(id)
}

getJob.permission = 'admin'

getJob.params = {
  id: {
    type: 'string',
  },
}

export async function runJob ({ id, scheduleId }) {
  return this.runJobSequence([id], {
    _schedule: await this.getSchedule(scheduleId),
  })
}

runJob.permission = 'admin'

runJob.params = {
  id: {
    type: 'string',
  },
  scheduleId: {
    type: 'string',
  },
}

export function runJobOnVm ({ id, vm, _schedule }) {}

// -----------------------------------------------------------------------------

// export function list ({})
