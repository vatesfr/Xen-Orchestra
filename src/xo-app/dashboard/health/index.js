import _ from 'intl'
import ActionRowButton from 'action-row-button'
import Component from 'base-component'
import get from 'lodash/get'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import Link from 'link'
import map from 'lodash/map'
import mapValues from 'lodash/mapValues'
import SortedTable from 'sorted-table'
import TabButton from 'tab-button'
import Tooltip from 'tooltip'
import Upgrade from 'xoa-upgrade'
import React from 'react'
import xml2js from 'xml2js'
import { Card, CardHeader, CardBlock } from 'card'
import { confirm } from 'modal'
import { deleteMessage, deleteVdi, deleteOrphanedVdis, deleteVm, isSrWritable } from 'xo'
import { FormattedRelative, FormattedTime } from 'react-intl'
import { fromCallback } from 'promise-toolbox'
import { Container, Row, Col } from 'grid'
import {
  createGetObject,
  createGetObjectsOfType,
  createSelector
} from 'selectors'
import {
  connectStore,
  formatSize,
  noop
} from 'utils'

const SrColContainer = connectStore(() => ({
  container: createGetObject()
}))(({ container }) => <Link to={`pools/${container.id}`}>{container.name_label}</Link>)

const VdiColSr = connectStore(() => ({
  sr: createGetObject()
}))(({ sr }) => <Link to={`srs/${sr.id}`}>{sr.name_label}</Link>)

const VmColContainer = connectStore(() => ({
  container: createGetObject()
}))(({ container }) => <span>{container.name_label}</span>)

const AlarmColObject = connectStore(() => ({
  object: createGetObject()
}))(({ object }) => {
  if (!object) {
    return null
  }
  return object.type === 'VM-controller' ? <Link to={`hosts/${object.$container}`}>{object.name_label}</Link> : <Link to={`vms/${object.id}`}>{object.name_label}</Link>
})

const AlarmColPool = connectStore(() => ({
  pool: createGetObject()
}))(({ pool }) => {
  if (!pool) {
    return null
  }
  return <Link to={`pools/${pool.id}`}>{pool.name_label}</Link>
})

const SR_COLUMNS = [
  {
    name: _('srName'),
    itemRenderer: sr => sr.name_label,
    sortCriteria: sr => sr.name_label
  },
  {
    name: _('srPool'),
    itemRenderer: sr => <SrColContainer id={sr.$container} />
  },
  {
    name: _('srFormat'),
    itemRenderer: sr => sr.SR_type,
    sortCriteria: sr => sr.SR_type
  },
  {
    name: _('srSize'),
    itemRenderer: sr => formatSize(sr.size),
    sortCriteria: sr => sr.size
  },
  {
    default: true,
    name: _('srUsage'),
    itemRenderer: sr => sr.size > 1 &&
      <Tooltip content={_('spaceLeftTooltip', {used: Math.round((sr.physical_usage / sr.size) * 100), free: formatSize(sr.size - sr.physical_usage)})}>
        <meter value={(sr.physical_usage / sr.size) * 100} min='0' max='100' optimum='40' low='80' high='90' />
      </Tooltip>,
    sortCriteria: sr => sr.physical_usage / sr.size,
    sortOrder: 'desc'
  }
]

const VDI_COLUMNS = [
  {
    name: _('snapshotDate'),
    itemRenderer: vdi => <span><FormattedTime value={vdi.snapshot_time * 1000} minute='numeric' hour='numeric' day='numeric' month='long' year='numeric' /> (<FormattedRelative value={vdi.snapshot_time * 1000} />)</span>,
    sortCriteria: vdi => vdi.snapshot_time,
    sortOrder: 'desc'
  },
  {
    name: _('vdiNameLabel'),
    itemRenderer: vdi => vdi.name_label,
    sortCriteria: vdi => vdi.name_label
  },
  {
    name: _('vdiNameDescription'),
    itemRenderer: vdi => vdi.name_description,
    sortCriteria: vdi => vdi.name_description
  },
  {
    name: _('vdiSize'),
    itemRenderer: vdi => formatSize(vdi.size),
    sortCriteria: vdi => vdi.size
  },
  {
    name: _('vdiSr'),
    itemRenderer: vdi => <VdiColSr id={vdi.$SR} />
  },
  {
    name: _('logAction'),
    itemRenderer: vdi => (
      <ActionRowButton
        btnStyle='danger'
        handler={deleteVdi}
        handlerParam={vdi}
        icon='delete'
      />
    )
  }
]

const VM_COLUMNS = [
  {
    name: _('snapshotDate'),
    itemRenderer: vm => <span><FormattedTime value={vm.snapshot_time * 1000} minute='numeric' hour='numeric' day='numeric' month='long' year='numeric' /> (<FormattedRelative value={vm.snapshot_time * 1000} />)</span>,
    sortCriteria: vm => vm.snapshot_time,
    sortOrder: 'desc'
  },
  {
    name: _('vmNameLabel'),
    itemRenderer: vm => vm.name_label,
    sortCriteria: vm => vm.name_label
  },
  {
    name: _('vmNameDescription'),
    itemRenderer: vm => vm.name_description,
    sortCriteria: vm => vm.name_description
  },
  {
    name: _('vmContainer'),
    itemRenderer: vm => <VmColContainer id={vm.$container} />
  },
  {
    name: _('logAction'),
    itemRenderer: vm => (
      <ActionRowButton
        btnStyle='danger'
        handler={deleteVm}
        handlerParam={vm}
        icon='delete'
      />
    )
  }
]

const ALARM_COLUMNS = [
  {
    name: _('alarmDate'),
    itemRenderer: message => (
      <span><FormattedTime value={message.time * 1000} minute='numeric' hour='numeric' day='numeric' month='long' year='numeric' /> (<FormattedRelative value={message.time * 1000} />)</span>
    ),
    sortCriteria: message => message.time,
    sortOrder: 'desc'
  },
  {
    name: _('alarmContent'),
    itemRenderer: ({ formatted, body }) => formatted
      ? <div>
        <Row>
          <Col mediumSize={6}><strong>{formatted.name}</strong></Col>
          <Col mediumSize={6}>{formatted.value}</Col>
        </Row>
        <br />
        {map(formatted.alarmAttributes, (value, label) => <Row>
          <Col mediumSize={6}>{label}</Col>
          <Col mediumSize={6}>{value}</Col>
        </Row>)}
      </div>
      : <pre style={{ whiteSpace: 'pre-wrap' }}>{body}</pre>,
    sortCriteria: message => message.body
  },
  {
    name: _('alarmObject'),
    itemRenderer: message => <AlarmColObject id={message.$object} />
  },
  {
    name: _('alarmPool'),
    itemRenderer: message => <AlarmColPool id={message.$pool} />
  },
  {
    name: _('logAction'),
    itemRenderer: message => (
      <ActionRowButton
        btnStyle='danger'
        handler={deleteMessage}
        handlerParam={message}
        icon='delete'
      />
    )
  }
]

@connectStore(() => {
  const getOrphanVdiSnapshots = createGetObjectsOfType('VDI-snapshot')
    .filter([ snapshot => !snapshot.$snapshot_of ])
    .sort()
  const getOrphanVmSnapshots = createGetObjectsOfType('VM-snapshot')
    .filter([ snapshot => !snapshot.$snapshot_of ])
    .sort()
  const getUserSrs = createGetObjectsOfType('SR')
    .filter([ isSrWritable ])
  const getVdiSrs = createGetObjectsOfType('SR')
    .pick(createSelector(
      getOrphanVdiSnapshots,
      snapshots => map(snapshots, '$SR')
    ))
  const getAlertMessages = createGetObjectsOfType('message')
    .filter([ message => message.name === 'ALARM' ])

  return {
    alertMessages: getAlertMessages,
    userSrs: getUserSrs,
    vdiOrphaned: getOrphanVdiSnapshots,
    vdiSr: getVdiSrs,
    vmOrphaned: getOrphanVmSnapshots
  }
})
export default class Health extends Component {
  componentWillReceiveProps (props) {
    if (props.alertMessages !== this.props.alertMessages) {
      Promise.all(
        map(props.alertMessages, ({ body }) => {
          const matches = /^value: ([0-9\.]+) config: (.*)$/.exec(body)
          if (!matches) {
            return
          }

          const [ , value, xml ] = matches
          return fromCallback(cb =>
            xml2js.parseString(xml, cb)
          ).then(
            result => {
              const object = mapValues(result && result.variable, value => get(value, '[0].$.value'))
              if (!object || !object.name) {
                return
              }

              const { name, ...alarmAttributes } = object

              return { name, value, alarmAttributes }
            },
            noop
          )
        })
      ).then(
        formattedMessages => {
          this.setState({
            messages: map(formattedMessages, (formattedMessage, index) => ({
              formatted: formattedMessage,
              ...props.alertMessages[index]
            }))
          })
        },
        noop
      )
    }
  }

  _deleteOrphanedVdis = () =>
    deleteOrphanedVdis(this.props.vdiOrphaned)

  _deleteAllLogs = () => (
    confirm({
      title: _('removeAllLogsModalTitle'),
      body: <div>
        <p>{_('removeAllLogsModalWarning')}</p>
        <p>{_('definitiveMessageModal')}</p>
      </div>
    }).then(
      () => Promise.all(map(this.props.alertMessages, deleteMessage)),
      noop
    )
  )

  _getSrUrl = sr => `srs/${sr.id}`

  render () {
    return process.env.XOA_PLAN > 3
      ? <Container>
        <Row>
          <Col>
            <Card>
              <CardHeader>
                <Icon icon='disk' /> {_('srStatePanel')}
              </CardHeader>
              <CardBlock>
                {isEmpty(this.props.userSrs)
                  ? <p className='text-xs-center'>{_('noSrs')}</p>
                  : <Row>
                    <Col>
                      <SortedTable
                        collection={this.props.userSrs}
                        columns={SR_COLUMNS}
                        rowLink={this._getSrUrl}
                      />
                    </Col>
                  </Row>
                }
              </CardBlock>
            </Card>
          </Col>
        </Row>
        <Row>
          <Col>
            <Card>
              <CardHeader>
                <Icon icon='disk' /> {_('orphanedVdis')}
              </CardHeader>
              <CardBlock>
                {isEmpty(this.props.vdiOrphaned)
                  ? <p className='text-xs-center'>{_('noOrphanedObject')}</p>
                  : <div>
                    <Row>
                      <Col className='text-xs-right'>
                        <TabButton
                          btnStyle='danger'
                          handler={this._deleteOrphanedVdis}
                          icon='delete'
                          labelId='removeAllOrphanedObject'
                        />
                      </Col>
                    </Row>
                    <Row>
                      <Col>
                        <SortedTable collection={this.props.vdiOrphaned} columns={VDI_COLUMNS} />
                      </Col>
                    </Row>
                  </div>
                }
              </CardBlock>
            </Card>
          </Col>
        </Row>
        <Row>
          <Col>
            <Card>
              <CardHeader>
                <Icon icon='vm' /> {_('orphanedVms')}
              </CardHeader>
              <CardBlock>
                {isEmpty(this.props.vmOrphaned)
                  ? <p className='text-xs-center'>{_('noOrphanedObject')}</p>
                  : <SortedTable collection={this.props.vmOrphaned} columns={VM_COLUMNS} />
                }
              </CardBlock>
            </Card>
          </Col>
        </Row>
        <Row>
          <Col>
            <Card>
              <CardHeader>
                <Icon icon='alarm' /> {_('alarmMessage')}
              </CardHeader>
              <CardBlock>
                {isEmpty(this.props.alertMessages)
                  ? <p className='text-xs-center'>{_('noAlarms')}</p>
                  : <div>
                    <Row>
                      <Col className='text-xs-right'>
                        <TabButton
                          btnStyle='danger'
                          handler={this._deleteAllLogs}
                          icon='delete'
                          labelId='logRemoveAll'
                        />
                      </Col>
                    </Row>
                    <Row>
                      <Col>
                        <SortedTable collection={this.state.messages} columns={ALARM_COLUMNS} />
                      </Col>
                    </Row>
                  </div>
                }
              </CardBlock>
            </Card>
          </Col>
        </Row>
      </Container>
      : <Container><Upgrade place='health' available={4} /></Container>
  }
}
