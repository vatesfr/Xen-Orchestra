import _, { messages } from 'intl'
import ActionButton from 'action-button'
import Button from 'button'
import find from 'lodash/find'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import moment from 'moment-timezone'
import SortedTable from 'sorted-table'
import Upgrade from 'xoa-upgrade'
import React, { Component } from 'react'
import Scheduler, { SchedulePreview } from 'scheduling'
import { createSelector } from 'selectors'
import { error } from 'notification'
import { injectIntl } from 'react-intl'
import { Select, Toggle } from 'form'
import {
  createSchedule,
  deleteSchedule,
  deleteSchedules,
  subscribeJobs,
  subscribeSchedules,
  editSchedule,
} from 'xo'

const JOB_KEY = 'genericTask'
const DEFAULT_CRON_PATTERN = '0 0 * * *'
const DEFAULT_TIMEZONE = moment.tz.guess()

const COLUMNS = [
  {
    itemRenderer: schedule => (
      <span>
        {schedule.name}{' '}
        <span className='text-muted'>({schedule.id.slice(4, 8)})</span>
      </span>
    ),
    name: _('jobName'),
    sortCriteria: 'name',
    default: true,
  },
  {
    itemRenderer: (schedule, userData) => {
      const job = userData.jobs[schedule.job]
      if (job !== undefined) {
        return (
          <span>
            {job.name} - {job.method}{' '}
            <span className='text-muted'>({schedule.job.slice(4, 8)})</span>
          </span>
        )
      }
    },
    name: _('job'),
    sortCriteria: (schedule, userData) => userData.jobs[schedule.job].name,
  },
  {
    itemRenderer: schedule => schedule.cron,
    name: _('jobScheduling'),
  },
  {
    itemRenderer: schedule => schedule.timezone || _('jobServerTimezone'),
    name: _('jobTimezone'),
    sortCriteria: 'timezone',
  },
]
const GROUPED_ACTIONS = [
  {
    handler: deleteSchedules,
    icon: 'delete',
    label: _('deleteSelectedSchedules'),
    level: 'danger',
  },
]

@injectIntl
export default class Schedules extends Component {
  constructor (props) {
    super(props)
    this.state = {
      action: undefined,
      actions: undefined,
      cronPattern: DEFAULT_CRON_PATTERN,
      job: undefined,
      jobs: undefined,
      timezone: undefined,
    }
    this.loaded = new Promise((resolve, reject) => {
      this._resolveLoaded = resolve
    }).then(() => {
      const { id } = this.props
      if (id) {
        this._edit(id)
      }
    })
  }

  componentWillMount () {
    const unsubscribeJobs = subscribeJobs(jobs => {
      const j = {}
      for (const id in jobs) {
        const job = jobs[id]
        if (job && job.key === JOB_KEY) {
          const _job = { ...job }
          _job.label = `${_job.name} - ${_job.method} (${_job.id})`
          j[job.id] = _job
        }
      }
      this.setState({ jobs: j })
    })

    const unsubscribeSchedules = subscribeSchedules(schedules => {
      const s = {}
      const { jobs } = this.state
      if (isEmpty(jobs)) {
        return
      }
      for (const id in schedules) {
        const schedule = schedules[id]
        const scheduleJob = find(jobs, job => job.id === schedule.job)
        if (scheduleJob && scheduleJob.key === JOB_KEY) {
          s[id] = schedule
        }
      }
      this.setState({ schedules: s }, this._resolveLoaded)
    })

    this.componentWillUnmount = () => {
      unsubscribeJobs()
      unsubscribeSchedules()
    }
  }

  _handleSubmit = () => {
    const { name, job, enabled } = this.refs
    const { cronPattern, schedule, timezone } = this.state
    let save
    if (schedule) {
      schedule.job = job.value.id
      schedule.cron = cronPattern
      schedule.name = name.value
      schedule.timezone = timezone
      save = editSchedule(schedule)
    } else {
      save = createSchedule(job.value.id, {
        cron: cronPattern,
        enabled: enabled.value,
        name: name.value,
        timezone,
      })
    }
    return save
      .then(this._reset)
      .catch(err => error('Save Schedule', err.message || String(err)))
  }

  _edit = id => {
    const { schedules, jobs } = this.state
    const schedule = find(schedules, schedule => schedule.id === id)
    if (!schedule) {
      error(
        'Schedule edition',
        'This schedule was not found, or may not longer exists.'
      )
      return
    }

    const { name, job } = this.refs
    name.value = schedule.name
    job.value = jobs[schedule.job]
    this.setState({
      cronPattern: schedule.cron,
      schedule,
      timezone: schedule.timezone,
    })
  }

  _reset = () => {
    this.setState(
      {
        cronPattern: DEFAULT_CRON_PATTERN,
        schedule: undefined,
        timezone: undefined,
      },
      () => {
        const { name, job, enabled } = this.refs
        name.value = ''
        enabled.value = false
        job.value = undefined
      }
    )
  }

  _updateCronPattern = value => {
    this.setState(value)
  }

  individualActions = [
    {
      handler: job => this._edit(job.id),
      icon: 'edit',
      label: _('scheduleEdit'),
      level: 'primary',
    },
    {
      handler: deleteSchedule,
      icon: 'delete',
      label: _('scheduleDelete'),
      level: 'danger',
    },
  ]

  _getTimezone = createSelector(
    () => this.state.schedule !== undefined,
    () => this.state.timezone,
    (scheduleExists, timezone) => (scheduleExists ? timezone : DEFAULT_TIMEZONE)
  )

  render () {
    const { cronPattern, jobs, schedule, schedules } = this.state
    const timezone = this._getTimezone()
    const userData = { jobs }
    return (
      <div>
        <h2>{_('newSchedule')}</h2>
        <form id='newScheduleForm'>
          <div className='form-group'>
            <input
              type='text'
              ref='name'
              className='form-control'
              placeholder={this.props.intl.formatMessage(
                messages.jobScheduleNamePlaceHolder
              )}
              required
            />
          </div>
          <div className='form-group'>
            <Select
              labelKey='name'
              ref='job'
              options={map(jobs)}
              valueKey='id'
              placeholder={this.props.intl.formatMessage(
                messages.jobScheduleJobPlaceHolder
              )}
            />
          </div>
          {!schedule && (
            <div className='form-group'>
              <label>{_('scheduleEnableAfterCreation')}</label>{' '}
              <Toggle ref='enabled' />
            </div>
          )}
        </form>
        <fieldset>
          <Scheduler
            cronPattern={cronPattern}
            onChange={this._updateCronPattern}
            timezone={timezone}
          />
          <SchedulePreview cronPattern={cronPattern} timezone={timezone} />
        </fieldset>
        <br />
        <div className='form-group'>
          {schedule && (
            <p className='text-warning'>
              {_('scheduleEditMessage', {
                name: schedule.name,
                id: schedule.id,
              })}
            </p>
          )}
          {process.env.XOA_PLAN > 3 ? (
            <span>
              <ActionButton
                form='newScheduleForm'
                handler={this._handleSubmit}
                icon='save'
                btnStyle='primary'
              >
                {_('saveBackupJob')}
              </ActionButton>{' '}
              <Button onClick={this._reset}>{_('selectTableReset')}</Button>
            </span>
          ) : (
            <span>
              <Upgrade place='health' available={4} />
            </span>
          )}
        </div>
        {schedules !== undefined && (
          <div>
            <h2>{_('jobSchedules')}</h2>
            <SortedTable
              collection={schedules}
              columns={COLUMNS}
              groupedActions={GROUPED_ACTIONS}
              individualActions={this.individualActions}
              userData={userData}
            />
          </div>
        )}
      </div>
    )
  }
}
