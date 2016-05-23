import _ from 'messages'
import ActionRowButton from 'action-row-button'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import TabButton from 'tab-button'
import React, { Component } from 'react'
import { confirm } from 'modal'
import { deleteMessage, deleteVdi, deleteVm } from 'xo'
import { FormattedRelative, FormattedTime } from 'react-intl'
import { Row, Col } from 'grid'
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

const AlarmMessage = connectStore(() => {
  const object = createGetObject(
    (_, props) => props.message.$object
  )
  const pool = createGetObject(
    (_, props) => props.message.$pool
  )

  return (state, props) => ({
    object: object(state, props),
    pool: pool(state, props)
  })
})(({ message, object, pool }) =>
  <tr>
    <td><FormattedTime value={message.time * 1000} minute='numeric' hour='numeric' day='numeric' month='long' year='numeric' /> (<FormattedRelative value={message.time * 1000} />)</td>
    <td>{message.body}</td>
    <td>{object.name_label}</td>
    <td>{pool.name_label}</td>
    <td>
      <ActionRowButton
        btnStyle='danger'
        handler={deleteMessage}
        handlerParam={message}
        icon='delete'
      />
    </td>
  </tr>
)

const OrphanVdiSnapshot = connectStore(() => {
  const sr = createGetObject(
    (_, props) => props.vdi.$SR
  )

  return (state, props) => ({
    sr: sr(state, props)
  })
})(({ vdi, sr }) =>
  <tr>
    <td>
      <FormattedTime
        value={vdi.snapshot_time * 1000}
        minute='numeric'
        hour='numeric'
        day='numeric'
        month='long'
        year='numeric' />
      (<FormattedRelative value={vdi.snapshot_time * 1000} />)
    </td>
    <td>{vdi.name_label}</td>
    <td>{vdi.name_description}</td>
    <td>{formatSize(vdi.size)}</td>
    <td>{sr.name_label}</td>
    <td>
      <ActionRowButton
        btnStyle='danger'
        handler={deleteVdi}
        handlerParam={vdi}
        icon='delete'
        />
    </td>
  </tr>
)

const OrphanVmSnapshot = connectStore(() => {
  const container = createGetObject(
    (_, props) => props.vm.$container
  )

  return (state, props) => ({
    container: container(state, props)
  })
})(({ container, vm }) =>
  <tr>
    <td><FormattedTime value={vm.snapshot_time * 1000} minute='numeric' hour='numeric' day='numeric' month='long' year='numeric' /> (<FormattedRelative value={vm.snapshot_time * 1000} />)</td>
    <td>{vm.name_label}</td>
    <td>{vm.name_description}</td>
    <td>{container.name_label}</td>
    <td>
      <ActionRowButton
        btnStyle='danger'
        handler={deleteVm}
        handlerParam={vm}
        icon='delete'
      />
    </td>
  </tr>
)

const Sr = connectStore(() => {
  const container = createGetObject(
    (_, props) => props.sr.$container
  )

  return (state, props) => ({
    container: container(state, props)
  })
})(({ container, sr }) =>
  <tr>
    <td>{sr.name_label}</td>
    <td>{container.name_label}</td>
    <td>{sr.SR_type}</td>
    <td>{formatSize(sr.size)}</td>
    <td>
      <progress className='progress' value={sr.physical_usage} max={sr.size} /></td>
  </tr>
)

@connectStore(() => {
  const getOrphanVdiSnapshots = createGetObjectsOfType('VDI-snapshot')
    .filter([ snapshot => !snapshot.$snapshot_of ])
    .sort()
  const getOrphanVmSnapshots = createGetObjectsOfType('VM-snapshot')
    .filter([ snapshot => !snapshot.$snapshot_of ])
    .sort()
  const getUserSrs = createGetObjectsOfType('SR')
    .filter([ sr => sr.content_type === 'user' ])
  const getVdiSrs = createGetObjectsOfType('SR')
    .pick(createSelector(
      getOrphanVdiSnapshots,
      snapshots => map(snapshots, '$SR')
    ))
  const getAlertMessages = createGetObjectsOfType('message')
    .filter([ message => message.name === 'ALARM' ])

  return (state, props) => ({
    alertMessages: getAlertMessages(state, props),
    userSrs: getUserSrs(state, props),
    vdiOrphaned: getOrphanVdiSnapshots(state, props),
    vdiSr: getVdiSrs(state, props),
    vmOrphaned: getOrphanVmSnapshots(state, props)
  })
})
export default class Health extends Component {
  _deleteOrphanedVdis = () => (
    confirm({
      title: 'Remove all orphaned VDIs',
      body: <div>
        <p>Are you sure you want to remove all orphaned VDIs?</p>
        <p>This operation is definitive.</p>
      </div>
    }).then(
      () => map(this.props.vdiOrphaned, deleteVdi),
      noop
    )
  )
  _deleteAllLogs = () => (
    confirm({
      title: 'Remove all logs',
      body: <div>
        <p>Are you sure you want to remove all logs?</p>
        <p>This operation is definitive.</p>
      </div>
    }).then(
      () => map(this.props.alertMessages, deleteMessage),
      noop
    )
  )

  render () {
    return <div className='container-fluid'>
      <h2><Icon icon='menu-dashboard-health' /> {_('overviewHealthDashboardPage')}</h2>
      <Row>
        <Col mediumSize={12}>
          <div className='card-dashboard'>
            <div className='card-header-dashboard'>
              <Icon icon='disk' /> {_('orphanedVdis')}
            </div>
            <div className='card-block'>
              {isEmpty(this.props.vdiOrphaned)
                ? <p className='text-xs-center'>{_('noOrphanedObject')}</p>
                : <div>
                  <Row>
                    <Col smallSize={12} className='text-xs-right'>
                      <TabButton
                        btnStyle='danger'
                        handler={this._deleteOrphanedVdis}
                        icon='delete'
                        labelId='logRemoveAll'
                      />
                    </Col>
                  </Row>
                  <Row>
                    <table className='table'>
                      <thead className='thead-default'>
                        <tr>
                          <th>{_('snapshotDate')}</th>
                          <th>{_('vdiNameLabel')}</th>
                          <th>{_('vdiNameDescription')}</th>
                          <th>{_('vdiSize')}</th>
                          <th>{_('vdiSr')}</th>
                          <th>{_('logAction')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {map(this.props.vdiOrphaned, vdi =>
                          <OrphanVdiSnapshot key={vdi.id} vdi={vdi} />
                        )}
                      </tbody>
                    </table>
                  </Row>
                </div>
              }
            </div>
          </div>
        </Col>
      </Row>
      <Row>
        <Col mediumSize={12}>
          <div className='card-dashboard'>
            <div className='card-header-dashboard'>
              <Icon icon='vm' /> {_('orphanedVms')}
            </div>
            <div className='card-block'>
              {isEmpty(this.props.vmOrphaned)
                ? <p className='text-xs-center'>{_('noOrphanedObject')}</p>
                : <table className='table'>
                  <thead className='thead-default'>
                    <tr>
                      <th>{_('snapshotDate')}</th>
                      <th>{_('vmNameLabel')}</th>
                      <th>{_('vmNameDescription')}</th>
                      <th>{_('vmContainer')}</th>
                      <th>{_('logAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {map(this.props.vmOrphaned, vm =>
                      <OrphanVmSnapshot key={vm.id} vm={vm} />
                    )}
                  </tbody>
                </table>
              }
            </div>
          </div>
        </Col>
      </Row>
      <Row>
        <Col mediumSize={12}>
          <div className='card-dashboard'>
            <div className='card-header-dashboard'>
              <Icon icon='disk' /> {_('srStatePanel')}
            </div>
            <div className='card-block'>
              {isEmpty(this.props.userSrs)
                ? <Row>
                  <Col smallSize={6} className='text-xs-center'>
                    <br />
                    <h4>{_('noSrs')}</h4>
                  </Col>
                </Row>
                : <Row>
                  <Col smallSize={12}>
                    <table className='table'>
                      <thead className='thead-default'>
                        <tr>
                          <th>{_('srName')}</th>
                          <th>{_('srPool')}/{_('srHost')}</th>
                          <th>{_('srFormat')}</th>
                          <th>{_('srSize')}</th>
                          <th>{_('srUsage')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {map(this.props.userSrs, sr =>
                          <Sr key={sr.id} sr={sr} />
                        )}
                      </tbody>
                    </table>
                  </Col>
                </Row>
              }
            </div>
          </div>
        </Col>
      </Row>
      <Row>
        <Col mediumSize={12}>
          <div className='card-dashboard'>
            <div className='card-header-dashboard'>
              <Icon icon='alarm' /> {_('alarmMessage')}
            </div>
            <div className='card-block'>
              {isEmpty(this.props.alertMessages)
                ? <p className='text-xs-center'>{_('noAlarms')}</p>
                : <div>
                  <Row>
                    <Col smallSize={12} className='text-xs-right'>
                      <TabButton
                        btnStyle='danger'
                        handler={this._deleteAllLogs}
                        icon='delete'
                        labelId='logRemoveAll'
                      />
                    </Col>
                  </Row>
                  <Row>
                    <table className='table'>
                      <thead className='thead-default'>
                        <tr>
                          <th>{_('alarmDate')}</th>
                          <th>{_('alarmContent')}</th>
                          <th>{_('alarmObject')}</th>
                          <th>{_('alarmPool')}</th>
                          <th>{_('logAction')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {map(this.props.alertMessages, message =>
                          <AlarmMessage key={message.id} message={message} />
                        )}
                      </tbody>
                    </table>
                  </Row>
                </div>
              }
            </div>
          </div>
        </Col>
      </Row>
    </div>
  }
}
