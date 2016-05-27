import _, { messages } from 'messages'
import ActionButton from 'action-button'
import filter from 'lodash/filter'
import Icon from 'icon'
import includes from 'lodash/includes'
import info, { error } from 'notification'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import React, { Component } from 'react'
import trim from 'lodash.trim'
import Wizard, { Section } from 'wizard'
import { confirm } from 'modal'
import { connectStore, formatSize } from 'utils'
import { GenericSelect, SelectHost } from 'select-objects'
import { createGetObjectsOfType, createFilter, createSelector } from 'selectors'
import { injectIntl } from 'react-intl'

class SelectIqn extends GenericSelect {
  _computeOptions (props) {
    return map(props.options, iqn => ({
      value: iqn,
      label: `${iqn.iqn} (${iqn.ip})`
    }))
  }
  get value () {
    const value = this.state.value
    return value && value.value || value
  }
}

class SelectLun extends GenericSelect {
  _computeOptions (props) {
    return map(props.options, lun => ({
      value: lun,
      label: `LUN ${lun.id}: ${lun.serial} - ${formatSize(+lun.size)} - (${lun.vendor})`
    }))
  }
  get value () {
    const value = this.state.value
    return value && value.value || value
  }
}

import {
  createSrIso,
  createSrIscsi,
  createSrLvm,
  createSrNfs,
  probeSrIscsiExists,
  probeSrIscsiIqns,
  probeSrIscsiLuns,
  probeSrNfs,
  probeSrNfsExists,
  reattachSrIso,
  reattachSr
} from 'xo'

// ===================================================================

const SR_TYPE_TO_INFO = {
  nfs: 'NFS',
  iscsi: 'iSCSI',
  lvm: 'Local LVM',
  local: 'Local',
  nfsiso: 'NFS ISO',
  smb: 'SMB'
}

// ===================================================================

@injectIntl
@connectStore(() => {
  const hosts = createGetObjectsOfType('host')
  const srs = createGetObjectsOfType('SR')
  return (state, props) => ({
    hosts: hosts(state, props),
    srs: srs(state, props)
  })
})
export default class New extends Component {
  static contextTypes = {
    router: React.PropTypes.object
  }

  constructor (props) {
    super(props)
    this.state = {
      description: undefined,
      host: undefined,
      iqn: undefined,
      iqns: undefined,
      lockCreation: undefined,
      lun: undefined,
      luns: undefined,
      name: undefined,
      path: undefined,
      paths: undefined,
      type: undefined,
      unused: undefined,
      usage: undefined,
      used: undefined
    }
    this.getHostSrs = createFilter(
      () => this.props.srs,
      createSelector(
        () => this.state.host,
        ({$pool, id}) => sr => sr.$container === $pool || sr.$container === id
      ),
      true
    )
  }

  _handleSubmit = async () => {
    const {
      description,
      device,
      localPath,
      name,
      password,
      port,
      server,
      username
    } = this.refs
    const {
      host,
      iqn,
      lun,
      path,
      type
    } = this.state

    const createMethodFactories = {
      nfs: async () => {
        const previous = await probeSrNfsExists(host.id, server.value, path)
        if (previous && previous.length > 0) {
          try {
            await confirm('Previous Path Usage', <p>
              This path has been previously used as a Storage by a XenServer host. All data will be lost if you choose to continue the SR creation.
            </p>)
          } catch (error) {
            return
          }
        }
        return createSrNfs(host.id, name.value, description.value, server.value, path)
      },
      iscsi: async () => {
        const previous = await probeSrIscsiExists(host.id, iqn.ip, iqn.iqn, lun.scsiId, port.value, username && username.value, password && password.value)
        if (previous && previous.length > 0) {
          try {
            await confirm('Previous LUN Usage', <p>
              This LUN has been previously used as a Storage by a XenServer host. All data will be lost if you choose to continue the SR creation.
            </p>)
          } catch (error) {
            return
          }
        }
        return createSrIscsi(host.id, name.value, description.value, iqn.ip, iqn.iqn, lun.scsiId, port.value, username && username.value, password && password.value)
      },
      lvm: () => createSrLvm(host.id, name.value, description.value, device.value),
      local: () => createSrIso(host.id, name.value, description.value, localPath.value, 'local'),
      nfsiso: () => createSrIso(host.id, name.value, description.value, `${server.value}:${path}`, 'nfs', username.value, password.value),
      smb: () => createSrIso(host.id, name.value, description.value, server.value, 'smb', username.value, password.value)
    }

    try {
      const id = await createMethodFactories[type]()
      if (id) {
        this.context.router.push(`srs/${id}`)
      }
    } catch (err) {
      error('SR Creation', err.message || String(err))
    }
  }

  _handleSrHostSelection = host => this.setState({host})
  _handleNameChange = event => this.setState({name: event.target.value})
  _handleDescriptionChange = event => this.setState({description: event.target.value})

  _handleSrTypeSelection = event => {
    const type = event.target.value
    this.setState({
      type,
      paths: undefined,
      iqns: undefined,
      usage: undefined,
      used: undefined,
      unused: undefined,
      summary: type === 'lvm' || type === 'local' || type === 'smb'
    })
  }

  _handleSrIqnSelection = async iqn => {
    const {
      username,
      password
    } = this.refs
    const {
      host
    } = this.state

    try {
      this.setState({loading: true})
      const luns = await probeSrIscsiLuns(host.id, iqn.ip, iqn.iqn, username && username.value, password && password.value)
      this.setState({
        iqn,
        luns
      })
    } catch (err) {
      error('LUNs Detection', err.message || String(err))
    } finally {
      this.setState({loading: undefined})
    }
  }

  _handleSrLunSelection = async lun => {
    const {
      password,
      port,
      username
    } = this.refs
    const {
      host,
      iqn
    } = this.state

    try {
      this.setState({loading: true})
      const list = await probeSrIscsiExists(host.id, iqn.ip, iqn.iqn, lun.scsiId, port.value, username && username.value, password && password.value)
      const srIds = map(this.getHostSrs(), sr => sr.id)
      const used = filter(list, item => includes(srIds, item.id))
      const unused = filter(list, item => !includes(srIds, item.id))
      this.setState({
        lun,
        usage: true,
        used,
        unused,
        summary: used.length <= 0
      })
    } catch (err) {
      error('iSCSI Error', err.message || String(err))
    } finally {
      this.setState({loading: undefined})
    }
  }

  _handleAuthChoice = () => {
    const auth = this.refs['auth'].checked
    this.setState({
      auth
    })
  }

  _handleSearchServer = async () => {
    const {
      password,
      port,
      server,
      username
    } = this.refs

    const {
      host,
      type
    } = this.state

    try {
      if (type === 'nfs' || type === 'nfsiso') {
        const paths = await probeSrNfs(host.id, server.value)
        this.setState({
          usage: undefined,
          paths
        })
      } else if (type === 'iscsi') {
        const iqns = await probeSrIscsiIqns(host.id, server.value, port.value, username && username.value, password && password.value)
        if (!iqns.length) {
          info('iSCSI Detection', 'No IQNs found')
        } else {
          this.setState({
            usage: undefined,
            iqns
          })
        }
      }
    } catch (err) {
      error('Server Detection', err.message || String(err))
    }
  }

  _handleSrPathSelection = async path => {
    const {
      server
    } = this.refs
    const {
      host
    } = this.state

    try {
      this.setState({loading: true})
      const list = await probeSrNfsExists(host.id, server.value, path)
      const srIds = map(this.getHostSrs(), sr => sr.id)
      const used = filter(list, item => includes(srIds, item.id))
      const unused = filter(list, item => !includes(srIds, item.id))
      this.setState({
        path,
        usage: true,
        used,
        unused,
        summary: used.length <= 0
      })
    } catch (err) {
      error('NFS Error', err.message || String(err))
    } finally {
      this.setState({loading: undefined})
    }
  }

  _reattach = async uuid => {
    const {
      host,
      type
    } = this.state

    let {
      name,
      description
    } = this.refs

    name = trim(name)
    description = trim(description)
    if (isEmpty(name) || isEmpty(description)) {
      error('Missing General Parameters', 'Please complete General Information')
    }

    const method = (type === 'nfsiso') ? reattachSrIso : reattachSr
    try {
      await method(host.id, uuid, name, description, type)
    } catch (err) {
      error('Reattach', err.message || String(err))
    }
  }

  render () {
    const { hosts } = this.props
    const {
      auth,
      host,
      iqns,
      loading,
      lockCreation,
      lun,
      luns,
      path,
      paths,
      summary,
      type,
      unused,
      usage,
      used
    } = this.state
    const { formatMessage } = this.props.intl

    return (
      <form id='newSrForm'>
        <Wizard>
          <Section icon='sr' title='newSrGeneral'>
            <fieldset className='form-group'>
              <label>{_('newSrHost')}</label>
              <SelectHost
                options={hosts}
                onChange={this._handleSrHostSelection}
              />
              <label htmlFor='srName'>{_('newSrName')}</label>
              <input
                id='srName'
                className='form-control'
                placeholder='storage name'
                ref='name'
                onBlur={this._handleNameChange}
                required
                type='text'
              />
              <label htmlFor='srDescription'>{_('newSrDescription')}</label>
              <input
                id='srDescription'
                className='form-control'
                placeholder='storage description'
                ref='description'
                onBlur={this._handleDescriptionChange}
                required
                type='text'
              />
              <label htmlFor='selectSrType'>{_('newSrTypeSelection')}</label>
              <select
                className='form-control'
                defaultValue={null}
                id='selectSrType'
                onChange={this._handleSrTypeSelection}
                required
              >
                <option value={null}>{formatMessage(messages.noSelectedValue)}</option>
                {map(SR_TYPE_TO_INFO, (label, key) =>
                  <option key={key} value={key}>{label}</option>
                )}
              </select>
            </fieldset>
          </Section>
          <Section icon='settings' title='newSrSettings'>
            {host &&
              <fieldset>
                {(type === 'nfs' || type === 'nfsiso') &&
                  <fieldset>
                    <label htmlFor='srServer'>{_('newSrServer')}</label>
                    <div className='input-group'>
                      <input
                        id='srServer'
                        className='form-control'
                        placeholder='address'
                        ref='server'
                        required
                        type='text'
                      />
                      <span className='input-group-btn'>
                        <ActionButton icon='search' btnStyle='default' handler={this._handleSearchServer} />
                      </span>
                    </div>
                  </fieldset>
                }
                {paths &&
                  <fieldset>
                    <label htmlFor='selectSrPath'>{_('newSrPath')}</label>
                    <select
                      className='form-control'
                      defaultValue={null}
                      id='selectSrPath'
                      onChange={event => { this._handleSrPathSelection(event.target.value) }}
                      ref='path'
                      required
                    >
                      <option value={null}>{formatMessage(messages.noSelectedValue)}</option>
                      {map(paths, (item, key) =>
                        <option key={key} value={item.path}>{item.path}</option>
                      )}
                    </select>
                  </fieldset>
                }
                {type === 'iscsi' &&
                  <fieldset>
                    <label htmlFor='srServer'>
                      {_('newSrServer')} ({_('newSrAuth')}<input type='checkbox' ref='auth' onChange={event => { this._handleAuthChoice() }} />)
                    </label>
                    <div className='form-inline'>
                      <input
                        id='srServer'
                        className='form-control'
                        placeholder='address'
                        ref='server'
                        required
                        type='text'
                      />
                      {' : '}
                      <input
                        id='srServer'
                        className='form-control'
                        placeholder='[port]'
                        ref='port'
                        type='text'
                      />
                      <ActionButton icon='search' btnStyle='default' handler={this._handleSearchServer} />
                    </div>
                    {auth &&
                      <fieldset>
                        <label htmlFor='srServerUser'>{_('newSrUsername')}</label>
                        <input
                          id='srServerUser'
                          className='form-control'
                          placeholder='user'
                          ref='username'
                          required
                          type='text'
                        />
                        <label htmlFor='srServerUser'>{_('newSrPassword')}</label>
                        <input
                          id='srServerPassword'
                          className='form-control'
                          placeholder='password'
                          ref='password'
                          required
                          type='text'
                        />
                      </fieldset>
                    }
                  </fieldset>
                }
                {iqns &&
                  <fieldset>
                    <label>{_('newSrIqn')}</label>
                    <SelectIqn
                      options={iqns}
                      onChange={this._handleSrIqnSelection}
                    />
                  </fieldset>
                }
                {luns &&
                  <fieldset>
                    <label>{_('newSrLun')}</label>
                    <SelectLun
                      options={luns}
                      onChange={this._handleSrLunSelection}
                    />
                  </fieldset>
                }
                {type === 'smb' &&
                  <fieldset>
                    <label htmlFor='srServer'>{_('newSrServer')}</label>
                    <input
                      id='srServer'
                      className='form-control'
                      placeholder='address'
                      ref='server'
                      required
                      type='text'
                    />
                    <label htmlFor='srServerUser'>{_('newSrUsername')}</label>
                    <input
                      id='srServerUser'
                      className='form-control'
                      placeholder='user'
                      ref='username'
                      required
                      type='text'
                    />
                    <label htmlFor='srServerPassword'>{_('newSrPassword')}</label>
                    <input
                      id='srServerPassword'
                      className='form-control'
                      placeholder='password'
                      ref='password'
                      required
                      type='text'
                    />
                  </fieldset>
                }
                {type === 'lvm' &&
                  <fieldset>
                    <label htmlFor='srDevice'>{_('newSrDevice')}</label>
                    <input
                      id='srDevice'
                      className='form-control'
                      placeholder='Device, e.g /dev/sda...'
                      ref='device'
                      required
                      type='text'
                    />
                  </fieldset>
                }
                {type === 'local' &&
                  <fieldset>
                    <label htmlFor='srPath'>{_('newSrPath')}</label>
                    <input
                      id='srPath'
                      className='form-control'
                      placeholder=''
                      ref='localPath'
                      required
                      type='text'
                    />
                  </fieldset>
                }
              </fieldset>
            }
            {loading &&
              <Icon icon='loading' />
            }
          </Section>
          <Section icon='shown' title='newSrUsage'>
            {usage &&
              <div>
                {map(unused, (sr, key) =>
                  <p key={key}>
                    {sr.uuid}
                    <span className='pull-right'>
                      <ActionButton btnStyle='primary' handler={this._reattach} handlerParam={sr.uuid} icon='connect' />
                    </span>
                  </p>
                )}
                {map(used, (sr, key) =>
                  <p key={key}>
                    {sr.uuid}
                    <span className='pull-right'>
                      <a className='btn btn-warning'>{_('newSrInUse')}</a> // FIXME Goes to sr view
                    </span>
                  </p>
                )}
              </div>
            }
          </Section>
          <Section icon='summary' title='newSrSummary'>
            {summary &&
              <div>
                <dl className='dl-horizontal'>
                  <dt>{_('newSrName')}</dt>
                  <dd>{this.refs.name && this.refs.name.value}</dd>
                  <dt>{_('newSrDescription')}</dt>
                  <dd>{this.refs.description && this.refs.description.value}</dd>
                  <dt>{_('newSrType')}</dt>
                  <dd>{type}</dd>
                </dl>
                {type === 'iscsi' &&
                  <dl className='dl-horizontal'>
                    <dt>{_('newSrSize')}</dt>
                    <dd>{formatSize(+lun.size)}</dd>
                  </dl>
                }
                {type === 'nfs' &&
                  <dl className='dl-horizontal'>
                    <dt>{_('newSrPath')}</dt>
                    <dd>{path}</dd>
                  </dl>
                }
                <ActionButton form='newSrForm' type='submit' disabled={lockCreation} icon='run' btnStyle='primary' handler={this._handleSubmit}>
                  {_('newSrCreate')}
                </ActionButton>
              </div>
            }
          </Section>
        </Wizard>
      </form>
    )
  }
}
