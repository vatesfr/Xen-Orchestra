import _ from 'intl'
import ActionButton from 'action-button'
import ChartistGraph from 'react-chartist'
import Component from 'base-component'
import forEach from 'lodash/forEach'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import Upgrade from 'xoa-upgrade'
import React from 'react'
import SortedTable from 'sorted-table'
import { ButtonGroup } from 'react-bootstrap-4/lib'
import { Card, CardBlock, CardHeader } from 'card'
import { Container, Row, Col } from 'grid'
import {
  createCollectionWrapper,
  createCounter,
  createFilter,
  createGetObjectsOfType,
  createSelector,
  createTop
} from 'selectors'
import {
  connectStore,
  formatSize
} from 'utils'
import {
  getHostMissingPatches,
  installAllHostPatches,
  isSrWritable,
  subscribeUsers
} from 'xo'

import styles from './index.css'

// ===================================================================

const MISSING_PATCHES_COLUMNS = [
  {
    name: _('srPool'),
    itemRenderer: (host, { pools }) => pools[host.$pool].name_label,
    sortCriteria: (host, { pools }) => pools[host.$pool].name_label
  },
  {
    name: _('srHost'),
    itemRenderer: host => host.name_label,
    sortCriteria: host => host.name_label
  },
  {
    name: _('hostDescription'),
    itemRenderer: host => host.name_description,
    sortCriteria: host => host.name_description
  },
  {
    name: _('hostMissingPatches'),
    itemRenderer: (host, { missingPatches }) => missingPatches[host.id],
    sortCriteria: (host, { missingPatches }) => missingPatches[host.id]
  },
  {
    name: _('patchUpdateButton'),
    itemRenderer: host => (
      <ActionButton
        btnStyle='primary'
        handler={installAllHostPatches}
        handlerParam={host}
        icon='host-patch-update'
      />
    )
  }
]

// ===================================================================

@connectStore(() => {
  const getPools = createGetObjectsOfType('pool')
  const getHosts = createGetObjectsOfType('host').sort()

  return {
    pools: getPools,
    hosts: getHosts
  }
})
class MissingPatchesPanel extends Component {
  constructor (props) {
    super(props)
    this.state.missingPatches = {}
  }

  _getHosts = createFilter(
    () => this.props.hosts,
    [ host => this.state.missingPatches[host.id] ]
  )

  _refreshMissingPatches = async () => {
    const missingPatches = {}
    await Promise.all(
      map(this.props.hosts, host => (
        getHostMissingPatches(host).then(patches => {
          missingPatches[host.id] = patches.length
        })
      ))
    )
    this.setState({ missingPatches })
  }

  _installAllMissingPatches = () => (
    Promise.all(
      map(this._getHosts(), host => installAllHostPatches(host))
    )
  )

  componentWillMount () {
    this._refreshMissingPatches()
  }

  componentWillReceiveProps (nextProps) {
    forEach(nextProps.hosts, (host, push) => {
      const { id } = host

      if (this.state.missingPatches[id] !== undefined) {
        return
      }

      this.setState({
        missingPatches: {
          ...this.state.missingPatches,
          [id]: 0
        }
      })

      getHostMissingPatches(host).then(patches => {
        this.setState({
          missingPatches: {
            ...this.state.missingPatches,
            [id]: patches.length
          }
        })
      })
    })
  }

  render () {
    const hosts = this._getHosts()
    const noPatches = isEmpty(hosts)

    return (
      <Card>
        <CardHeader>
          <Icon icon='host-patch-update' /> {_('update')}
          <ButtonGroup className='pull-right'>
            <ActionButton
              btnStyle='secondary'
              handler={this._refreshMissingPatches}
              icon='refresh'
            />
            <ActionButton
              btnStyle='primary'
              disabled={noPatches}
              handler={this._installAllMissingPatches}
              icon='host-patch-update'
            />
          </ButtonGroup>
        </CardHeader>
        <CardBlock>
          {!noPatches
            ? (
            <SortedTable
              collection={hosts}
              columns={MISSING_PATCHES_COLUMNS}
              userData={{
                missingPatches: this.state.missingPatches,
                pools: this.props.pools
              }}
            />
            ) : <p>{_('patchNothing')}</p>
          }
        </CardBlock>
      </Card>
    )
  }
}

// ===================================================================

@connectStore(() => {
  const getHosts = createGetObjectsOfType('host')
  const getVms = createGetObjectsOfType('VM')

  const getHostMetrics = createCollectionWrapper(
    createSelector(
      getHosts,
      hosts => {
        const metrics = {
          cpus: 0,
          memoryTotal: 0,
          memoryUsage: 0
        }
        forEach(hosts, host => {
          metrics.cpus += host.cpus.cores
          metrics.memoryTotal += host.memory.size
          metrics.memoryUsage += host.memory.usage
        })
        return metrics
      }
    )
  )

  const userSrs = createTop(
    createGetObjectsOfType('SR').filter(
      [ isSrWritable ]
    ),
    [ sr => sr.physical_usage / sr.size ],
    5
  )

  const getSrMetrics = createCollectionWrapper(
    createSelector(
      userSrs,
      userSrs => {
        const metrics = {
          srTotal: 0,
          srUsage: 0
        }
        forEach(userSrs, sr => {
          metrics.srUsage += sr.physical_usage
          metrics.srTotal += sr.size
        })
        return metrics
      }
    )
  )
  const getVmMetrics = createCollectionWrapper(
    createSelector(
      getVms,
      vms => {
        const metrics = {
          vcpus: 0,
          running: 0,
          halted: 0,
          other: 0
        }
        forEach(vms, vm => {
          if (vm.power_state === 'Running') {
            metrics.running++
            metrics.vcpus += vm.CPUs.number
          } else if (vm.power_state === 'Halted') {
            metrics.halted++
          } else metrics.other++
        })
        return metrics
      }
    )
  )
  const getNumberOfAlarmMessages = createCounter(
    createGetObjectsOfType('message'),
    [ message => message.name === 'ALARM' ]
  )
  const getNumberOfHosts = createCounter(
    getHosts
  )
  const getNumberOfPools = createCounter(
    createGetObjectsOfType('pool')
  )
  const getNumberOfTasks = createCounter(
    createGetObjectsOfType('task').filter(
      [ task => task.status === 'pending' ]
    )
  )
  const getNumberOfVms = createCounter(
    getVms
  )

  return {
    hostMetrics: getHostMetrics,
    nAlarmMessages: getNumberOfAlarmMessages,
    nHosts: getNumberOfHosts,
    nPools: getNumberOfPools,
    nTasks: getNumberOfTasks,
    nVms: getNumberOfVms,
    srMetrics: getSrMetrics,
    userSrs: userSrs,
    vmMetrics: getVmMetrics
  }
})
export default class Overview extends Component {
  componentWillMount () {
    this.componentWillUnmount = subscribeUsers(users => {
      this.setState({ users })
    })
  }
  render () {
    const { state } = this
    const users = state && state.users
    const nUsers = users && Object.keys(users).length

    return process.env.XOA_PLAN > 2
        ? <Container>
          <Row>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='pool' /> {_('poolPanel', { pools: this.props.nPools })}
                </CardHeader>
                <CardBlock>
                  <p className={styles.bigCardContent}>{this.props.nPools}</p>
                </CardBlock>
              </Card>
            </Col>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='host' /> {_('hostPanel', { hosts: this.props.nHosts })}
                </CardHeader>
                <CardBlock>
                  <p className={styles.bigCardContent}>{this.props.nHosts}</p>
                </CardBlock>
              </Card>
            </Col>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='vm' /> {_('vmPanel', { vms: this.props.nVms })}
                </CardHeader>
                <CardBlock>
                  <p className={styles.bigCardContent}>{this.props.nVms}</p>
                </CardBlock>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='memory' /> {_('memoryStatePanel')}
                </CardHeader>
                <CardBlock>
                  <ChartistGraph
                    data={{
                      labels: ['Used Memory', 'Total Memory'],
                      series: [this.props.hostMetrics.memoryUsage, this.props.hostMetrics.memoryTotal - this.props.hostMetrics.memoryUsage]
                    }}
                    options={{ donut: true, donutWidth: 40, showLabel: false }}
                    type='Pie' />
                  <p className='text-xs-center'>{formatSize(this.props.hostMetrics.memoryUsage)} ({_('ofUsage')} {formatSize(this.props.hostMetrics.memoryTotal)})</p>
                </CardBlock>
              </Card>
            </Col>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='cpu' /> {_('cpuStatePanel')}
                </CardHeader>
                <CardBlock>
                  <div className='ct-chart'>
                    <ChartistGraph
                      data={{
                        labels: ['vCPUs', 'CPUs'],
                        series: [this.props.vmMetrics.vcpus, this.props.hostMetrics.cpus]
                      }}
                      options={{ showLabel: false, showGrid: false, distributeSeries: true }}
                      type='Bar' />
                    <p className='text-xs-center'>{this.props.vmMetrics.vcpus} vCPUS ({_('ofUsage')} {this.props.hostMetrics.cpus} CPUs)</p>
                  </div>
                </CardBlock>
              </Card>
            </Col>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='disk' /> {_('srUsageStatePanel')}
                </CardHeader>
                <CardBlock>
                  <div className='ct-chart'>
                    <ChartistGraph
                      data={{
                        labels: ['Used Space', 'Total Space'],
                        series: [this.props.srMetrics.srUsage, this.props.srMetrics.srTotal - this.props.srMetrics.srUsage]
                      }}
                      options={{ donut: true, donutWidth: 40, showLabel: false }}
                      type='Pie' />
                    <p className='text-xs-center'>{formatSize(this.props.srMetrics.srUsage)} ({_('ofUsage')} {formatSize(this.props.srMetrics.srTotal)})</p>
                  </div>
                </CardBlock>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='alarm' /> {_('alarmMessage')}
                </CardHeader>
                <CardBlock>
                  <p className={`${styles.bigCardContent} ${this.props.nAlarmMessages > 0 ? 'text-warning' : ''}`}>
                    {this.props.nAlarmMessages}
                  </p>
                </CardBlock>
              </Card>
            </Col>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='task' /> {_('taskStatePanel')}
                </CardHeader>
                <CardBlock>
                  <p className={styles.bigCardContent}>{this.props.nTasks}</p>
                </CardBlock>
              </Card>
            </Col>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='user' /> {_('usersStatePanel')}
                </CardHeader>
                <CardBlock>
                  <p className={styles.bigCardContent}>{nUsers}</p>
                </CardBlock>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col mediumSize={4}>
              <Card>
                <CardHeader>
                  <Icon icon='vm-force-shutdown' /> {_('vmStatePanel')}
                </CardHeader>
                <CardBlock>
                  <ChartistGraph
                    data={{
                      labels: ['Running', 'Halted', 'Other'],
                      series: [this.props.vmMetrics.running, this.props.vmMetrics.halted, this.props.vmMetrics.other]
                    }}
                    options={{ showLabel: false }}
                    type='Pie' />
                  <p className='text-xs-center'>{this.props.vmMetrics.running} running ({this.props.vmMetrics.halted} halted)</p>
                </CardBlock>
              </Card>
            </Col>
            <Col mediumSize={8}>
              <Card>
                <CardHeader>
                  <Icon icon='disk' /> {_('srTopUsageStatePanel')}
                </CardHeader>
                <CardBlock>
                  <ChartistGraph
                    style={{strokeWidth: '30px'}}
                    data={{
                      labels: map(this.props.userSrs, 'name_label'),
                      series: map(this.props.userSrs, sr => (sr.physical_usage / sr.size) * 100)
                    }}
                    options={{ showLabel: false, showGrid: false, distributeSeries: true, high: 100 }}
                    type='Bar' />
                </CardBlock>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col>
              <MissingPatchesPanel />
            </Col>
          </Row>
        </Container>
        : <Container><Upgrade place='dashboard' available={3} /></Container>
  }
}
