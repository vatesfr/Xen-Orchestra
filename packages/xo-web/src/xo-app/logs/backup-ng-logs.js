import _, { FormattedDuration } from 'intl'
import ActionButton from 'action-button'
import addSubscriptions from 'add-subscriptions'
import defined, { get } from '@xen-orchestra/defined'
import Icon from 'icon'
import NoObjects from 'no-objects'
import React from 'react'
import SortedTable from 'sorted-table'
import { alert } from 'modal'
import { Card, CardHeader, CardBlock } from 'card'
import { connectStore, formatSize, formatSpeed } from 'utils'
import { createGetObjectsOfType } from 'selectors'
import { FormattedDate } from 'react-intl'
import { injectState, provideState } from 'reaclette'
import { isEmpty, groupBy, keyBy } from 'lodash'
import { subscribeBackupNgJobs, subscribeBackupNgLogs } from 'xo'
import { VmItem, SrItem } from 'render-xo-item'

import LogAlertBody from './log-alert-body'
import LogAlertHeader from './log-alert-header'

const UL_STYLE = { listStyleType: 'none' }

const LI_STYLE = {
  whiteSpace: 'nowrap',
}

const STATUS_LABELS = {
  failure: {
    className: 'danger',
    label: 'jobFailed',
  },
  skipped: {
    className: 'info',
    label: 'jobSkipped',
  },
  success: {
    className: 'success',
    label: 'jobSuccess',
  },
  pending: {
    className: 'warning',
    label: 'jobStarted',
  },
  interrupted: {
    className: 'danger',
    label: 'jobInterrupted',
  },
}

const LogDate = ({ time }) => (
  <FormattedDate
    value={new Date(time)}
    month='short'
    day='numeric'
    year='numeric'
    hour='2-digit'
    minute='2-digit'
    second='2-digit'
  />
)

const DURATION_COLUMN = {
  name: _('jobDuration'),
  itemRenderer: log =>
    log.end !== undefined && (
      <FormattedDuration duration={log.end - log.start} />
    ),
  sortCriteria: log => log.end - log.start,
}

const STATUS_COLUMN = {
  name: _('jobStatus'),
  itemRenderer: log => {
    const { className, label } = STATUS_LABELS[log.status]
    return <span className={`tag tag-${className}`}>{_(label)}</span>
  },
  sortCriteria: 'status',
}

const LOG_BACKUP_COLUMNS = [
  {
    name: _('jobId'),
    itemRenderer: log => log.jobId.slice(4, 8),
    sortCriteria: log => log.jobId,
  },
  {
    name: _('jobName'),
    itemRenderer: (log, { jobs }) => get(() => jobs[log.jobId].name),
    sortCriteria: (log, { jobs }) => get(() => jobs[log.jobId].name),
  },
  {
    name: _('jobStart'),
    itemRenderer: log => <LogDate time={log.start} />,
    sortCriteria: 'start',
    sortOrder: 'desc',
  },
  {
    default: true,
    name: _('jobEnd'),
    itemRenderer: log => log.end !== undefined && <LogDate time={log.end} />,
    sortCriteria: log => log.end || log.start,
    sortOrder: 'desc',
  },
  DURATION_COLUMN,
  STATUS_COLUMN,
  {
    name: _('labelSize'),
    itemRenderer: ({ tasks: vmTasks }) => {
      if (isEmpty(vmTasks)) {
        return null
      }

      let transferSize = 0
      let mergeSize = 0
      vmTasks.forEach(({ tasks: targetSnapshotTasks = [] }) => {
        let vmTransferSize
        let vmMergeSize
        targetSnapshotTasks.forEach(({ message, tasks: operationTasks }) => {
          if (message !== 'export' || isEmpty(operationTasks)) {
            return
          }
          operationTasks.forEach(operationTask => {
            if (operationTask.status !== 'success') {
              return
            }
            if (
              operationTask.message === 'transfer' &&
              vmTransferSize === undefined
            ) {
              vmTransferSize = operationTask.result.size
            }
            if (
              operationTask.message === 'merge' &&
              vmMergeSize === undefined
            ) {
              vmMergeSize = operationTask.result.size
            }

            if (vmTransferSize !== undefined && vmMergeSize !== undefined) {
              return false
            }
          })
        })
        vmTransferSize !== undefined && (transferSize += vmTransferSize)
        vmMergeSize !== undefined && (mergeSize += vmMergeSize)
      })
      return (
        <ul style={UL_STYLE}>
          {transferSize > 0 && (
            <li style={LI_STYLE}>
              {_.keyValue(_('labelTransfer'), formatSize(transferSize))}
            </li>
          )}
          {mergeSize > 0 && (
            <li style={LI_STYLE}>
              {_.keyValue(_('labelMerge'), formatSize(mergeSize))}
            </li>
          )}
        </ul>
      )
    },
  },
]

const LOG_RESTORE_COLUMNS = [
  {
    name: _('logsJobId'),
    itemRenderer: ({ data: { jobId } }) => jobId.slice(4, 8),
    sortCriteria: 'data.jobId',
  },
  {
    name: _('logsJobName'),
    itemRenderer: ({ data: { jobId } }, { jobs }) =>
      get(() => jobs[jobId].name),
    sortCriteria: ({ data: { jobId } }, { jobs }) =>
      get(() => jobs[jobId].name),
  },
  {
    name: _('logsJobTime'),
    itemRenderer: ({ data: { time } }) => <LogDate time={time} />,
    sortCriteria: 'data.time',
  },
  {
    name: _('labelVm'),
    itemRenderer: ({ id, tasks }) => {
      const vmId = get(
        () => tasks.find(({ message }) => message === 'transfer').result.id
      )
      return (
        <div>
          {vmId !== undefined && <VmItem id={vmId} link newTab />}{' '}
          <span style={{ fontSize: '0.5em' }} className='text-muted'>
            {id}
          </span>
        </div>
      )
    },
    sortCriteria: ({ tasks }, { vms }) =>
      get(
        () =>
          vms[tasks.find(({ message }) => message === 'transfer').result.id]
            .name_label
      ),
  },
  {
    default: true,
    name: _('jobStart'),
    itemRenderer: log => <LogDate time={log.start} />,
    sortCriteria: 'start',
    sortOrder: 'desc',
  },
  DURATION_COLUMN,
  {
    name: _('labelSr'),
    itemRenderer: ({ data: { srId } }) => <SrItem id={srId} link newTab />,
    sortCriteria: ({ data: { srId } }, { srs }) => srs[srId].name_label,
  },
  STATUS_COLUMN,
  {
    name: _('labelSize'),
    itemRenderer: task => {
      const size = get(
        () =>
          task.tasks.find(({ message }) => message === 'transfer').result.size
      )
      return size !== undefined && formatSize(size)
    },
    sortCriteria: task =>
      get(
        () =>
          task.tasks.find(({ message }) => message === 'transfer').result.size
      ),
  },
  {
    name: _('labelSpeed'),
    itemRenderer: task => {
      const size = get(
        () =>
          task.tasks.find(({ message }) => message === 'transfer').result.size
      )
      return size > 0 && formatSpeed(size, task.end - task.start)
    },
    sortCriteria: task => {
      const size = get(
        () =>
          task.tasks.find(({ message }) => message === 'transfer').result.size
      )
      return size > 0 && size / (task.end - task.start)
    },
  },
]

const showTasks = ({ id }, { jobs }) =>
  alert(<LogAlertHeader id={id} jobs={jobs} />, <LogAlertBody id={id} />)

const LOG_INDIVIDUAL_ACTIONS = [
  {
    handler: showTasks,
    icon: 'preview',
    label: _('logDisplayDetails'),
  },
]

const LOG_FILTERS = {
  jobFailed: 'status: failure',
  jobInterrupted: 'status: interrupted',
  jobSkipped: 'status: skipped',
  jobStarted: 'status: started',
  jobSuccess: 'status: success',
}

const ShowMoreLogs = ({ name, handler, value }) => (
  <ActionButton
    className='pull-right'
    data-name={name}
    handler={handler}
    icon={value ? 'toggle-on' : 'toggle-off'}
    iconColor={value ? 'text-success' : undefined}
    size='small'
  >
    {_('logsShowMore')}
  </ActionButton>
)

export default [
  connectStore({
    srs: createGetObjectsOfType('SR'),
    vms: createGetObjectsOfType('VM'),
  }),
  addSubscriptions({
    logs: cb =>
      subscribeBackupNgLogs(logs =>
        cb(
          groupBy(
            logs,
            log => (log.message === 'restore' ? 'restore' : 'backup')
          )
        )
      ),
    jobs: cb => subscribeBackupNgJobs(jobs => cb(keyBy(jobs, 'id'))),
  }),
  provideState({
    initialState: () => ({
      showMoreLogsBackup: false,
      showMoreLogsRestore: false,
    }),
    effects: {
      toggleShowMoreLogs: (_, { name }) => state => ({
        [name]: !state[name],
      }),
    },
  }),
  injectState,
  ({ state, effects, logs, jobs, srs, vms }) => (
    <Card>
      <CardHeader>
        <Icon icon='log' /> {_('logTitle')}
      </CardHeader>
      <CardBlock>
        <h2>
          {_('labelBackup')}
          <ShowMoreLogs
            name='showMoreLogsBackup'
            handler={effects.toggleShowMoreLogs}
            value={state.showMoreLogsBackup}
          />
        </h2>
        <NoObjects
          collection={defined(() => logs.backup, [])}
          columns={LOG_BACKUP_COLUMNS}
          component={SortedTable}
          data-jobs={jobs}
          emptyMessage={_('noLogs')}
          filters={LOG_FILTERS}
          individualActions={LOG_INDIVIDUAL_ACTIONS}
          itemsPerPage={state.showMoreLogsBackup ? undefined : 3}
        />
        <h2>
          {_('labelRestore')}
          <ShowMoreLogs
            name='showMoreLogsRestore'
            handler={effects.toggleShowMoreLogs}
            value={state.showMoreLogsRestore}
          />
        </h2>
        <NoObjects
          collection={defined(() => logs.restore, [])}
          columns={LOG_RESTORE_COLUMNS}
          component={SortedTable}
          data-jobs={jobs}
          data-srs={srs}
          data-vms={vms}
          emptyMessage={_('noLogs')}
          filters={LOG_FILTERS}
          itemsPerPage={state.showMoreLogsRestore ? undefined : 3}
        />
      </CardBlock>
    </Card>
  ),
].reduceRight((value, decorator) => decorator(value))
