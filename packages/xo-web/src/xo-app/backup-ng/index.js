import _ from 'intl'
import ActionButton from 'action-button'
import addSubscriptions from 'add-subscriptions'
import Button from 'button'
import ButtonLink from 'button-link'
import Copiable from 'copiable'
import CopyToClipboard from 'react-copy-to-clipboard'
import decorate from 'apply-decorators'
import Icon from 'icon'
import PropTypes from 'prop-types'
import React from 'react'
import SortedTable from 'sorted-table'
import StateButton from 'state-button'
import Tooltip from 'tooltip'
import { Card, CardHeader, CardBlock } from 'card'
import { confirm } from 'modal'
import { connectStore, routes } from 'utils'
import { constructQueryString } from 'smart-backup'
import { Container, Row, Col } from 'grid'
import { createGetLoneSnapshots, createSelector } from 'selectors'
import { get } from '@xen-orchestra/defined'
import { isEmpty, map, groupBy, some } from 'lodash'
import { NavLink, NavTabs } from 'nav'
import {
  cancelJob,
  deleteBackupJobs,
  disableSchedule,
  enableSchedule,
  runBackupNgJob,
  runMetadataBackupJob,
  subscribeBackupNgJobs,
  subscribeBackupNgLogs,
  subscribeMetadataBackupJobs,
  subscribeSchedules,
} from 'xo'

import LogsTable, { LogStatus } from '../logs/backup-ng'
import Page from '../page'

import Edit from './edit'
import FileRestore from './file-restore'
import getSettingsWithNonDefaultValue from './_getSettingsWithNonDefaultValue'
import Health from './health'
import NewVmBackup, { NewMetadataBackup } from './new'
import Restore from './restore'
import { destructPattern } from './utils'

const Ul = props => <ul {...props} style={{ listStyleType: 'none' }} />
const Li = props => (
  <li
    {...props}
    style={{
      whiteSpace: 'nowrap',
    }}
  />
)

const _runBackupJob = ({ id, name, schedule, type }) =>
  confirm({
    title: _('runJob'),
    body: _('runBackupNgJobConfirm', {
      id: id.slice(0, 5),
      name: <strong>{name}</strong>,
    }),
  }).then(() =>
    type === 'backup'
      ? runBackupNgJob({ id, schedule })
      : runMetadataBackupJob({ id, schedule })
  )

const _deleteBackupJobs = items => {
  const { backup: backupIds, metadataBackup: metadataBackupIds } = groupBy(
    items,
    'type'
  )
  return deleteBackupJobs({ backupIds, metadataBackupIds })
}

const SchedulePreviewBody = decorate([
  addSubscriptions(({ schedule }) => ({
    lastRunLog: cb =>
      subscribeBackupNgLogs(logs => {
        let lastRunLog
        for (const runId in logs) {
          const log = logs[runId]
          if (
            log.scheduleId === schedule.id &&
            (lastRunLog === undefined || lastRunLog.start < log.start)
          ) {
            lastRunLog = log
          }
        }
        cb(lastRunLog)
      }),
  })),
  ({ job, schedule, lastRunLog }) => (
    <Ul>
      <Li>
        {schedule.name
          ? _.keyValue(_('scheduleName'), schedule.name)
          : _.keyValue(_('scheduleCron'), schedule.cron)}{' '}
        <Tooltip content={_('scheduleCopyId', { id: schedule.id.slice(4, 8) })}>
          <CopyToClipboard text={schedule.id}>
            <Button size='small'>
              <Icon icon='clipboard' />
            </Button>
          </CopyToClipboard>
        </Tooltip>
      </Li>
      <Li>
        <StateButton
          disabledLabel={_('stateDisabled')}
          disabledHandler={enableSchedule}
          disabledTooltip={_('logIndicationToEnable')}
          enabledLabel={_('stateEnabled')}
          enabledHandler={disableSchedule}
          enabledTooltip={_('logIndicationToDisable')}
          handlerParam={schedule.id}
          state={schedule.enabled}
          style={{ marginRight: '0.5em' }}
        />
        {job.runId !== undefined ? (
          <ActionButton
            btnStyle='danger'
            handler={cancelJob}
            handlerParam={job}
            icon='cancel'
            key='cancel'
            size='small'
            tooltip={_('formCancel')}
          />
        ) : (
          <ActionButton
            btnStyle='primary'
            data-id={job.id}
            data-name={job.name}
            data-schedule={schedule.id}
            data-type={job.type}
            handler={_runBackupJob}
            icon='run-schedule'
            key='run'
            size='small'
          />
        )}{' '}
        {lastRunLog !== undefined && (
          <LogStatus log={lastRunLog} tooltip={_('scheduleLastRun')} />
        )}
      </Li>
    </Ul>
  ),
])

const MODES = [
  {
    label: 'rollingSnapshot',
    test: job =>
      some(job.settings, ({ snapshotRetention }) => snapshotRetention > 0),
  },
  {
    label: 'backup',
    test: job =>
      job.mode === 'full' && !isEmpty(get(() => destructPattern(job.remotes))),
  },
  {
    label: 'deltaBackup',
    test: job =>
      job.mode === 'delta' && !isEmpty(get(() => destructPattern(job.remotes))),
  },
  {
    label: 'continuousReplication',
    test: job =>
      job.mode === 'delta' && !isEmpty(get(() => destructPattern(job.srs))),
  },
  {
    label: 'disasterRecovery',
    test: job =>
      job.mode === 'full' && !isEmpty(get(() => destructPattern(job.srs))),
  },
  {
    label: 'poolMetadata',
    test: job => !isEmpty(destructPattern(job.pools)),
  },
  {
    label: 'xoConfig',
    test: job => job.xoMetadata,
  },
]

@addSubscriptions({
  jobs: subscribeBackupNgJobs,
  metadataJobs: subscribeMetadataBackupJobs,
  schedulesByJob: cb =>
    subscribeSchedules(schedules => {
      cb(groupBy(schedules, 'jobId'))
    }),
})
class JobsTable extends React.Component {
  static contextTypes = {
    router: PropTypes.object,
  }

  static tableProps = {
    actions: [
      {
        handler: _deleteBackupJobs,
        label: _('deleteBackupSchedule'),
        icon: 'delete',
        level: 'danger',
      },
    ],
    columns: [
      {
        itemRenderer: ({ id }) => (
          <Copiable data={id} tagName='p'>
            {id.slice(4, 8)}
          </Copiable>
        ),
        name: _('jobId'),
      },
      {
        valuePath: 'name',
        name: _('jobName'),
        default: true,
      },
      {
        itemRenderer: job => (
          <Ul>
            {MODES.filter(({ test }) => test(job)).map(({ label }) => (
              <Li key={label}>{_(label)}</Li>
            ))}
          </Ul>
        ),
        sortCriteria: 'mode',
        name: _('jobModes'),
      },
      {
        itemRenderer: (job, { schedulesByJob }) =>
          map(get(() => schedulesByJob[job.id]), schedule => (
            <SchedulePreviewBody
              job={job}
              key={schedule.id}
              schedule={schedule}
            />
          )),
        name: _('jobSchedules'),
      },
      {
        itemRenderer: job => {
          const {
            compression,
            concurrency,
            offlineSnapshot,
            reportWhen,
            timeout,
          } = getSettingsWithNonDefaultValue(job.mode, {
            compression: job.compression,
            ...job.settings[''],
          })

          return (
            <Ul>
              {reportWhen !== undefined && (
                <Li>{_.keyValue(_('reportWhen'), reportWhen)}</Li>
              )}
              {concurrency !== undefined && (
                <Li>{_.keyValue(_('concurrency'), concurrency)}</Li>
              )}
              {timeout !== undefined && (
                <Li>{_.keyValue(_('timeout'), timeout / 3600e3)} hours</Li>
              )}
              {offlineSnapshot !== undefined && (
                <Li>
                  {_.keyValue(
                    _('offlineSnapshot'),
                    _(offlineSnapshot ? 'stateEnabled' : 'stateDisabled')
                  )}
                </Li>
              )}
              {compression !== undefined && (
                <Li>
                  {_.keyValue(
                    _('compression'),
                    compression === 'native' ? 'GZIP' : compression
                  )}
                </Li>
              )}
            </Ul>
          )
        },
        name: _('formNotes'),
      },
    ],
    individualActions: [
      {
        handler: (job, { goTo }) =>
          goTo({
            pathname: '/home',
            query: { t: 'VM', s: constructQueryString(job.vms) },
          }),
        disabled: job => job.type !== 'backup',
        label: _('redirectToMatchingVms'),
        icon: 'preview',
      },
      {
        handler: (job, { goTo }) => goTo(`/backup-ng/${job.id}/edit`),
        label: _('formEdit'),
        icon: 'edit',
        level: 'primary',
      },
    ],
  }

  _goTo = path => {
    this.context.router.push(path)
  }

  _getCollection = createSelector(
    () => this.props.jobs,
    () => this.props.metadataJobs,
    (jobs = [], metadataJobs = []) => [...jobs, ...metadataJobs]
  )

  render() {
    return (
      <SortedTable
        {...JobsTable.tableProps}
        collection={this._getCollection()}
        data-goTo={this._goTo}
        data-schedulesByJob={this.props.schedulesByJob}
      />
    )
  }
}

const Overview = () => (
  <div>
    <Card>
      <CardHeader>
        <Icon icon='schedule' /> {_('backupSchedules')}
      </CardHeader>
      <CardBlock>
        <JobsTable />
      </CardBlock>
    </Card>
    <LogsTable />
  </div>
)

const HealthNavTab = decorate([
  addSubscriptions({
    // used by createGetLoneSnapshots
    schedules: subscribeSchedules,
  }),
  connectStore({
    nLoneSnapshots: createGetLoneSnapshots.count(),
  }),
  ({ nLoneSnapshots }) => (
    <NavLink to='/backup-ng/health'>
      <Icon icon='menu-dashboard-health' /> {_('overviewHealthDashboardPage')}{' '}
      {nLoneSnapshots > 0 && (
        <Tooltip content={_('loneSnapshotsMessages', { nLoneSnapshots })}>
          <span className='tag tag-pill tag-warning'>{nLoneSnapshots}</span>
        </Tooltip>
      )}
    </NavLink>
  ),
])

const HEADER = (
  <Container>
    <Row>
      <Col mediumSize={3}>
        <h2>
          <Icon icon='backup' /> {_('backupPage')}
        </h2>
      </Col>
      <Col mediumSize={9}>
        <NavTabs className='pull-right'>
          <NavLink exact to='/backup-ng/overview'>
            <Icon icon='menu-backup-overview' /> {_('backupOverviewPage')}
          </NavLink>
          <NavLink to='/backup-ng/new'>
            <Icon icon='menu-backup-new' /> {_('backupNewPage')}
          </NavLink>
          <NavLink to='/backup-ng/restore'>
            <Icon icon='menu-backup-restore' /> {_('backupRestorePage')}
          </NavLink>
          <NavLink to='/backup-ng/file-restore'>
            <Icon icon='menu-backup-file-restore' />{' '}
            {_('backupFileRestorePage')}
          </NavLink>
          <HealthNavTab />
        </NavTabs>
      </Col>
    </Row>
  </Container>
)

const ChooseBackupType = () => (
  <Container>
    <Row>
      <Col>
        <Card>
          <CardHeader>{_('backupType')}</CardHeader>
          <CardBlock className='text-md-center'>
            <ButtonLink to='backup-ng/new/vms'>
              <Icon icon='backup' /> {_('backupVms')}
            </ButtonLink>{' '}
            <ButtonLink to='backup-ng/new/metadata'>
              <Icon icon='database' /> {_('backupMetadata')}
            </ButtonLink>
          </CardBlock>
        </Card>
      </Col>
    </Row>
  </Container>
)

export default routes('overview', {
  ':id/edit': Edit,
  new: ChooseBackupType,
  'new/vms': NewVmBackup,
  'new/metadata': NewMetadataBackup,
  overview: Overview,
  restore: Restore,
  'file-restore': FileRestore,
  health: Health,
})(({ children }) => (
  <Page header={HEADER} title='backupPage' formatTitle>
    {children}
  </Page>
))
