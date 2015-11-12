import angular from 'angular'
import find from 'lodash.find'
import forEach from 'lodash.foreach'
import later from 'later'
import prettyCron from 'prettycron'
import uiBootstrap from 'angular-ui-bootstrap'
import uiRouter from 'angular-ui-router'

later.date.localTime()

import view from './view'

// ====================================================================

export default angular.module('backup.rollingSnapshot', [
  uiRouter,
  uiBootstrap
])
  .config(function ($stateProvider) {
    $stateProvider.state('backup.rollingsnapshot', {
      url: '/rollingsnapshot/:id',
      controller: 'RollingSnapshotCtrl as ctrl',
      template: view
    })
  })
  .controller('RollingSnapshotCtrl', function ($scope, $stateParams, $interval, xo, xoApi, notify, selectHighLevelFilter, filterFilter) {
    const JOBKEY = 'rollingSnapshot'

    this.ready = false

    this.comesForEditing = $stateParams.id
    this.scheduleApi = {}
    this.formData = {}

    const refreshSchedules = () => {
      return xo.schedule.getAll()
      .then(schedules => {
        const s = {}
        forEach(schedules, schedule => {
          this.jobs && this.jobs[schedule.job] && this.jobs[schedule.job].key === JOBKEY && (s[schedule.id] = schedule)
        })
        this.schedules = s
      })
    }

    const refreshJobs = () => {
      return xo.job.getAll()
      .then(jobs => {
        const j = {}
        forEach(jobs, job => j[job.id] = job)
        this.jobs = j
      })
    }

    const refresh = () => {
      return refreshJobs().then(refreshSchedules)
    }

    this.getReady = () => refresh().then(() => this.ready = true)
    this.getReady()

    const interval = $interval(() => {
      refresh()
    }, 5e3)
    $scope.$on('$destroy', () => {
      $interval.cancel(interval)
    })

    const toggleState = (toggle, state) => {
      const selectedVms = this.formData.selectedVms.slice()
      if (toggle) {
        const vms = filterFilter(selectHighLevelFilter(this.objects), {type: 'VM'})
        forEach(vms, vm => {
          if (vm.power_state === state) {
            (selectedVms.indexOf(vm) === -1) && selectedVms.push(vm)
          }
        })
        this.formData.selectedVms = selectedVms
      } else {
        const keptVms = []
        for (let index in this.formData.selectedVms) {
          if (this.formData.selectedVms[index].power_state !== state) {
            keptVms.push(this.formData.selectedVms[index])
          }
        }
        this.formData.selectedVms = keptVms
      }
    }

    this.toggleAllRunning = toggle => toggleState(toggle, 'Running')
    this.toggleAllHalted = toggle => toggleState(toggle, 'Halted')

    this.edit = schedule => {
      const vms = filterFilter(selectHighLevelFilter(this.objects), {type: 'VM'})
      const job = this.jobs[schedule.job]
      const selectedVms = []
      forEach(job.paramsVector.items[0].values, value => {
        const vm = find(vms, vm => vm.id === value.id)
        vm && selectedVms.push(vm)
      })
      const tag = job.paramsVector.items[0].values[0].tag
      const depth = job.paramsVector.items[0].values[0].depth
      const cronPattern = schedule.cron

      this.resetData()
      // const formData = this.formData
      this.formData.selectedVms = selectedVms
      this.formData.tag = tag
      this.formData.depth = depth
      this.formData.scheduleId = schedule.id
      this.scheduleApi.setCron(cronPattern)
    }

    this.save = (id, vms, tag, depth, cron, enabled) => {
      if (!vms.length) {
        notify.warning({
          title: 'No Vms selected',
          message: 'Choose VMs to snapshot'
        })
        return
      }
      const _save = (id === undefined) ? saveNew(vms, tag, depth, cron, enabled) : save(id, vms, tag, depth, cron)
      return _save
      .then(() => {
        notify.info({
          title: 'Rolling snapshot',
          message: 'Job schedule successfuly saved'
        })
        this.resetData()
      })
      .finally(() => {
        refresh()
      })
    }

    const save = (id, vms, tag, depth, cron) => {
      const schedule = this.schedules[id]
      const job = this.jobs[schedule.job]
      const values = []
      forEach(vms, vm => {
        values.push({
          id: vm.id,
          tag,
          depth
        })
      })
      job.paramsVector.items[0].values = values
      return xo.job.set(job)
      .then(response => {
        if (response) {
          return xo.schedule.set(schedule.id, undefined, cron, undefined)
        } else {
          notify.error({
            title: 'Update schedule',
            message: 'Job updating failed'
          })
          throw new Error('Job updating failed')
        }
      })
    }

    const saveNew = (vms, tag, depth, cron, enabled) => {
      const values = []
      forEach(vms, vm => {
        values.push({
          id: vm.id,
          tag,
          depth
        })
      })
      const job = {
        type: 'call',
        key: JOBKEY,
        method: 'vm.rollingSnapshot',
        paramsVector: {
          type: 'crossProduct',
          items: [
            {
              type: 'set',
              values
            }
          ]
        }
      }
      return xo.job.create(job)
      .then(jobId => {
        return xo.schedule.create(jobId, cron, enabled)
      })
    }

    this.delete = schedule => {
      let jobId = schedule.job
      return xo.schedule.delete(schedule.id)
      .then(() => xo.job.delete(jobId))
      .finally(() => {
        if (this.formData.scheduleId === schedule.id) {
          this.resetData()
        }
        refresh()
      })
    }

    this.resetData = () => {
      this.formData.allRunning = false
      this.formData.allHalted = false
      this.formData.selectedVms = []
      this.formData.scheduleId = undefined
      this.formData.tag = undefined
      this.formData.depth = undefined
      this.formData.enabled = false
      this.scheduleApi && this.scheduleApi.resetData && this.scheduleApi.resetData()
    }

    this.collectionLength = col => Object.keys(col).length
    this.prettyCron = prettyCron.toString.bind(prettyCron)

    if (!this.comesForEditing) {
      refresh()
    } else {
      refresh()
      .then(() => {
        this.edit(this.schedules[this.comesForEditing])
        delete this.comesForEditing
      })
    }
    this.resetData()
    this.objects = xoApi.all
  })

  // A module exports its name.
  .name
