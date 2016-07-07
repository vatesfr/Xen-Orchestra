import _, { FormattedDuration } from 'intl'
import ActionButton from 'action-button'
import ActionRowButton from 'action-row-button'
import classnames from 'classnames'
import forEach from 'lodash/forEach'
import Icon from 'icon'
import includes from 'lodash/includes'
import map from 'lodash/map'
import orderBy from 'lodash/orderBy'
import propTypes from 'prop-types'
import React, { Component } from 'react'
import renderXoItem from 'render-xo-item'
import SortedTable from 'sorted-table'
import { alert, confirm } from 'modal'
import { connectStore } from 'utils'
import { createGetObject } from 'selectors'
import { FormattedDate } from 'react-intl'

import {
  Card,
  CardHeader,
  CardBlock
} from 'card'

import {
  deleteJobsLog,
  subscribeJobsLogs
} from 'xo'

// ===================================================================

const jobKeyToLabel = {
  continuousReplication: _('continuousReplication'),
  deltaBackup: _('deltaBackup'),
  disasterRecovery: _('disasterRecovery'),
  genericTask: _('customJob'),
  rollingBackup: _('backup'),
  rollingSnapshot: _('rollingSnapshot')
}

// ===================================================================

@connectStore(() => ({object: createGetObject()}))
class JobParam extends Component {
  render () {
    const {
      object,
      paramKey,
      id
    } = this.props

    return object
    ? <span><strong>{object.type || paramKey}</strong>: {renderXoItem(object)} </span>
    : <span><strong>{paramKey}:</strong> {id} </span>
  }
}

@connectStore(() => ({object: createGetObject()}))
class JobReturn extends Component {
  render () {
    const {
      object,
      id
    } = this.props

    return <span><Icon icon='arrow-right' />{' '}{object ? renderXoItem(object) : id}</span>
  }
}

const Log = props => <ul className='list-group'>
  {map(props.log.calls, call => <li key={call.callKey} className='list-group-item'>
    <strong className='text-info'>{call.method}: </strong>
    {map(call.params, (value, key) => <JobParam id={value} paramKey={key} key={key} />)}
    {call.returnedValue && <span>{' '}<JobReturn id={call.returnedValue} /></span>}
    {call.error && <Icon icon='error' />}
  </li>)}
</ul>

const showCalls = log => alert(<span>{_('job')} {log.jobId}</span>, <Log log={log} />)

const LOG_COLUMNS = [
  {
    name: '',
    itemRenderer: log => <ActionRowButton icon='preview' handler={showCalls} handlerParam={log} />
  },
  {
    name: _('jobId'),
    itemRenderer: log => log.jobId,
    sortCriteria: log => log.jobId
  },
  {
    name: _('job'),
    itemRenderer: log => jobKeyToLabel[log.key],
    sortCriteria: log => log.key
  },
  {
    name: _('jobStart'),
    itemRenderer: log => log.start && <FormattedDate value={new Date(log.start)} month='long' day='numeric' year='numeric' hour='2-digit' minute='2-digit' second='2-digit' />,
    sortCriteria: log => log.start
  },
  {
    name: _('jobEnd'),
    itemRenderer: log => log.end && <FormattedDate value={new Date(log.end)} month='long' day='numeric' year='numeric' hour='2-digit' minute='2-digit' second='2-digit' />,
    sortCriteria: log => log.end
  },
  {
    name: _('jobDuration'),
    itemRenderer: log => log.duration && <FormattedDuration duration={log.duration} />,
    sortCriteria: log => log.duration
  },
  {
    name: _('jobStatus'),
    itemRenderer: log => <span>
      {log.status === 'finished' &&
        <span className={classnames('tag', {'tag-success': (!log.error && !log.hasErrors), 'tag-danger': (log.error || log.hasErrors)})}>{_('jobFinished')}</span>
      }
      {log.status === 'started' &&
        <span className='tag tag-warning'>{_('jobStarted')}</span>
      }
      {(log.status !== 'started' && log.status !== 'finished') &&
        <span className='tag tag-default'>{_('jobUnknown')}</span>
      }
      {' '}
      <span className='pull-right'>
        <ActionRowButton btnStyle='default' handler={deleteJobsLog} handlerParam={log.logKey} icon='delete' />
      </span>
    </span>,
    sortCriteria: log => (log.error || log.hasErrors) && ' ' || log.status
  }
]

@propTypes({
  jobKeys: propTypes.array.isRequired
})
export default class LogList extends Component {
  constructor (props) {
    super(props)
    this.state = {
      logs: [],
      logsToClear: []
    }
    this.filters = {
      onError: 'error',
      successful: 'success'
    }
  }

  componentWillMount () {
    this.componentWillUnmount = subscribeJobsLogs(rawLogs => {
      const logs = {}
      const logsToClear = []
      forEach(rawLogs, (log, logKey) => {
        const data = log.data
        const { time } = log
        if (data.event === 'job.start' && includes(this.props.jobKeys, data.key)) {
          logsToClear.push(logKey)
          logs[logKey] = {
            logKey,
            jobId: data.jobId,
            key: data.key,
            userId: data.userId,
            start: time,
            calls: {},
            time
          }
        } else {
          const runJobId = data.runJobId
          const entry = logs[runJobId]
          if (!entry) {
            return
          }
          logsToClear.push(logKey)
          if (data.event === 'job.end') {
            if (data.error) {
              entry.error = data.error
            }
            entry.end = time
            entry.duration = time - entry.start
            entry.status = 'finished'
          } else if (data.event === 'jobCall.start') {
            entry.calls[logKey] = {
              callKey: logKey,
              params: data.params,
              method: data.method,
              time
            }
          } else if (data.event === 'jobCall.end') {
            const call = entry.calls[data.runCallId]

            if (data.error) {
              call.error = data.error
              entry.hasErrors = true
              entry.meta = 'error'
            } else {
              call.returnedValue = data.returnedValue
            }
          }
        }
      })

      forEach(logs, log => {
        if (log.end === undefined) {
          log.status = 'started'
        } else if (!log.meta) {
          log.meta = 'success'
        }
        log.calls = orderBy(log.calls, ['time'], ['desc'])
      })

      this.setState({
        logs: orderBy(logs, ['time'], ['desc']),
        logsToClear
      })
    })
  }

  _deleteAllLogs = () => {
    return confirm({
      title: _('removeAllLogsModalTitle'),
      body: <p>{_('removeAllLogsModalWarning')}</p>
    }).then(() => deleteJobsLog(this.state.logsToClear))
  }

  render () {
    const { logs } = this.state

    return (
      <Card>
        <CardHeader>
          <Icon icon='log' /> Logs<span className='pull-right'><ActionButton disabled={!logs.length} btnStyle='danger' handler={this._deleteAllLogs} icon='delete' /></span>
        </CardHeader>
        <CardBlock>
          {logs.length
            ? <SortedTable collection={logs} columns={LOG_COLUMNS} filters={this.filters} />
            : <p>{_('noLogs')}</p>}
        </CardBlock>
      </Card>
    )
  }
}
