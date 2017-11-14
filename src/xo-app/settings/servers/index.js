import _, { messages } from 'intl'
import ActionButton from 'action-button'
import Component from 'base-component'
import Icon from 'icon'
import React from 'react'
import SortedTable from 'sorted-table'
import StateButton from 'state-button'
import Tooltip from 'tooltip'
import { addSubscriptions } from 'utils'
import { alert, confirm } from 'modal'
import { Container } from 'grid'
import { Password as EditablePassword, Text } from 'editable'
import { Password, Toggle } from 'form'
import { injectIntl } from 'react-intl'
import { noop } from 'lodash'
import {
  addServer,
  editServer,
  connectServer,
  disconnectServer,
  removeServer,
  subscribeServers,
} from 'xo'

const showInfo = () =>
  alert(
    _('serverAllowUnauthorizedCertificates'),
    _('serverUnauthorizedCertificatesInfo')
  )
const showServerError = server => {
  const { code, message } = server.error

  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return confirm({
      title: _('serverSelfSignedCertError'),
      body: _('serverSelfSignedCertQuestion'),
    }).then(
      () =>
        editServer(server, { allowUnauthorized: true }).then(() =>
          connectServer(server)
        ),
      noop
    )
  }

  if (code === 'SESSION_AUTHENTICATION_FAILED') {
    return alert(_('serverAuthFailed'), message)
  }

  return alert(code || _('serverUnknownError'), message)
}

const COLUMNS = [
  {
    itemRenderer: (server, formatMessage) => (
      <Text
        value={server.label || ''}
        onChange={label => editServer(server, { label })}
        placeholder={formatMessage(messages.serverPlaceHolderLabel)}
      />
    ),
    default: true,
    name: _('serverLabel'),
    sortCriteria: _ => _.name_label,
  },
  {
    itemRenderer: (server, formatMessage) => (
      <Text
        value={server.host}
        onChange={host => editServer(server, { host })}
        placeholder={formatMessage(messages.serverPlaceHolderAddress)}
      />
    ),
    name: _('serverHost'),
    sortCriteria: _ => _.host,
  },
  {
    itemRenderer: (server, formatMessage) => (
      <Text
        value={server.username}
        onChange={username => editServer(server, { username })}
        placeholder={formatMessage(messages.serverPlaceHolderUser)}
      />
    ),
    name: _('serverUsername'),
    sortCriteria: _ => _.username,
  },
  {
    itemRenderer: (server, formatMessage) => (
      <EditablePassword
        value=''
        onChange={password => editServer(server, { password })}
        placeholder={formatMessage(messages.serverPlaceHolderPassword)}
      />
    ),
    name: _('serverPassword'),
  },
  {
    itemRenderer: server => (
      <div>
        <StateButton
          disabledLabel={_('serverDisconnected')}
          disabledHandler={connectServer}
          disabledTooltip={_('serverConnect')}
          enabledLabel={_('serverConnected')}
          enabledHandler={disconnectServer}
          enabledTooltip={_('serverDisconnect')}
          handlerParam={server}
          pending={server.status === 'connecting'}
          state={server.status === 'connected'}
        />{' '}
        {server.error && (
          <Tooltip content={_('serverConnectionFailed')}>
            <a
              className='text-danger btn btn-link btn-sm'
              onClick={() => showServerError(server)}
            >
              <Icon icon='alarm' size='lg' />
            </a>
          </Tooltip>
        )}
      </div>
    ),
    name: _('serverStatus'),
    sortCriteria: _ => _.status,
  },
  {
    itemRenderer: server => (
      <Toggle
        onChange={readOnly => editServer(server, { readOnly })}
        value={!!server.readOnly}
      />
    ),
    name: _('serverReadOnly'),
    sortCriteria: _ => !!_.readOnly,
  },
  {
    itemRenderer: server => (
      <Toggle
        value={server.allowUnauthorized}
        onChange={allowUnauthorized =>
          editServer(server, { allowUnauthorized })
        }
      />
    ),
    name: (
      <span>
        {_('serverUnauthorizedCertificates')}{' '}
        <Tooltip content={_('serverAllowUnauthorizedCertificates')}>
          <a className='text-info' onClick={showInfo}>
            <Icon icon='info' size='lg' />
          </a>
        </Tooltip>
      </span>
    ),
    sortCriteria: _ => !!_.allowUnauthorized,
  },
]
const INDIVIDUAL_ACTIONS = [
  {
    handler: removeServer,
    icon: 'delete',
    label: _('remove'),
    level: 'danger',
  },
]

@addSubscriptions({
  servers: subscribeServers,
})
@injectIntl
export default class Servers extends Component {
  _addServer = async () => {
    const { label, host, password, username } = this.state

    await addServer(host, username, password, label)

    this.setState({ label: '', host: '', password: '', username: '' })
  }

  render () {
    const { props: { intl: { formatMessage }, servers }, state } = this

    return (
      <Container>
        <SortedTable
          collection={servers}
          columns={COLUMNS}
          individualActions={INDIVIDUAL_ACTIONS}
          userData={formatMessage}
        />
        <form className='form-inline' id='form-add-server'>
          <div className='form-group'>
            <input
              className='form-control'
              onChange={this.linkState('label')}
              placeholder={formatMessage(messages.serverPlaceHolderLabel)}
              type='text'
              value={state.label}
            />
          </div>{' '}
          <div className='form-group'>
            <input
              className='form-control'
              onChange={this.linkState('host')}
              placeholder={formatMessage(messages.serverPlaceHolderAddress)}
              required
              type='text'
              value={state.host}
            />
          </div>{' '}
          <div className='form-group'>
            <input
              className='form-control'
              onChange={this.linkState('username')}
              placeholder={formatMessage(messages.serverPlaceHolderUser)}
              required
              type='text'
              value={state.username}
            />
          </div>{' '}
          <div className='form-group'>
            <Password
              disabled={!this.state.username}
              onChange={this.linkState('password')}
              placeholder={formatMessage(messages.serverPlaceHolderPassword)}
              required
              value={state.password}
            />
          </div>{' '}
          <ActionButton
            btnStyle='primary'
            form='form-add-server'
            handler={this._addServer}
            icon='save'
          >
            {_('serverConnect')}
          </ActionButton>
        </form>
      </Container>
    )
  }
}
