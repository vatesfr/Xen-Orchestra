import React from 'react'

import _, { messages } from 'intl'
import ActionButton from 'action-button'
import ActionRowButton from 'action-row-button'
import Component from 'base-component'
import renderXoItem from 'render-xo-item'
import SelectFiles from 'select-files'
import Upgrade from 'xoa-upgrade'
import { connectStore } from 'utils'
import { Container, Row, Col } from 'grid'
import { createGetObjectsOfType, createFilter } from 'selectors'
import { injectIntl } from 'react-intl'
import { map } from 'lodash'
import { Text, XoSelect } from 'editable'
import {
  enableAllHostsMultipathing,
  installSupplementalPackOnAllHosts,
  setPoolMaster,
  setRemoteSyslogHost,
  setRemoteSyslogHosts,
} from 'xo'

@connectStore(() => ({
  master: createGetObjectsOfType('host').find((_, { pool }) => ({
    id: pool.master,
  })),
}))
class PoolMaster extends Component {
  _getPoolMasterPredicate = host => host.$pool === this.props.pool.id

  _onChange = host => setPoolMaster(host)

  render() {
    const { pool, master } = this.props

    return (
      <XoSelect
        onChange={this._onChange}
        predicate={this._getPoolMasterPredicate}
        value={pool.master}
        xoType='host'
      >
        {master.name_label}
      </XoSelect>
    )
  }
}

@injectIntl
@connectStore(() => {
  const getHosts = createGetObjectsOfType('host')
    .filter((_, { pool }) => ({ $pool: pool.id }))
    .sort()
  return {
    hosts: getHosts,
    hostsDisabledMultipathing: createFilter(getHosts, () => host =>
      !host.multipathing
    ),
    gpuGroups: createGetObjectsOfType('gpuGroup')
      .filter((_, { pool }) => ({ $pool: pool.id }))
      .sort(),
  }
})
export default class TabAdvanced extends Component {
  _setRemoteSyslogHosts = () =>
    setRemoteSyslogHosts(this.props.hosts, this.state.syslogDestination).then(
      () => this.setState({ editRemoteSyslog: false, syslogDestination: '' })
    )

  render() {
    const { hosts, gpuGroups, pool, hostsDisabledMultipathing } = this.props
    const { state } = this
    const { editRemoteSyslog } = state
    return (
      <div>
        <Container>
          <Row>
            <Col>
              <h3>{_('xenSettingsLabel')}</h3>
              <table className='table'>
                <tbody>
                  <tr>
                    <th>{_('poolHaStatus')}</th>
                    <td>
                      {pool.HA_enabled
                        ? _('poolHaEnabled')
                        : _('poolHaDisabled')}
                    </td>
                  </tr>
                  <tr>
                    <th>{_('setpoolMaster')}</th>
                    <td>
                      <PoolMaster pool={pool} />
                    </td>
                  </tr>
                  <tr>
                    <th>{_('syslogRemoteHost')}</th>
                    <td>
                      <ul className='pl-0'>
                        {map(hosts, host => (
                          <li key={host.id}>
                            <span>{`${host.name_label}: `}</span>
                            <Text
                              value={host.logging.syslog_destination || ''}
                              onChange={value =>
                                setRemoteSyslogHost(host, value)
                              }
                            />
                          </li>
                        ))}
                      </ul>
                      <ActionRowButton
                        btnStyle={editRemoteSyslog ? 'info' : 'primary'}
                        handler={this.toggleState('editRemoteSyslog')}
                        icon='edit'
                      >
                        {_('poolEditAll')}
                      </ActionRowButton>
                      {editRemoteSyslog && (
                        <form
                          id='formRemoteSyslog'
                          className='form-inline mt-1'
                        >
                          <div className='form-group'>
                            <input
                              className='form-control'
                              onChange={this.linkState('syslogDestination')}
                              placeholder={this.props.intl.formatMessage(
                                messages.poolRemoteSyslogPlaceHolder
                              )}
                              type='text'
                              value={state.syslogDestination}
                            />
                          </div>
                          <div className='form-group ml-1'>
                            <ActionButton
                              btnStyle='primary'
                              form='formRemoteSyslog'
                              handler={this._setRemoteSyslogHosts}
                              icon='save'
                            >
                              {_('confirmOk')}
                            </ActionButton>
                          </div>
                        </form>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Col>
          </Row>
        </Container>
        <h3 className='mt-1 mb-1'>{_('poolGpuGroups')}</h3>
        <Container>
          <Row>
            <Col size={9}>
              <ul className='list-group'>
                {map(gpuGroups, gpuGroup => (
                  <li key={gpuGroup.id} className='list-group-item'>
                    {renderXoItem(gpuGroup)}
                  </li>
                ))}
              </ul>
            </Col>
          </Row>
        </Container>
        <h3 className='mt-1 mb-1'>{_('hostMultipathing')}</h3>
        <ActionButton
          btnStyle='primary'
          handler={enableAllHostsMultipathing}
          handlerParam={hostsDisabledMultipathing}
          icon='host'
        >
          {_('hostEnableMultipathingForAllHost')}
        </ActionButton>
        <h3 className='mt-1 mb-1'>{_('supplementalPackPoolNew')}</h3>
        <Upgrade place='poolSupplementalPacks' required={2}>
          <SelectFiles
            onChange={file => installSupplementalPackOnAllHosts(pool, file)}
          />
        </Upgrade>
      </div>
    )
  }
}
