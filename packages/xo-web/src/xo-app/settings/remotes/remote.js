import _, { messages } from 'intl'
import ActionButton from 'action-button'
import Icon from 'icon'
import React from 'react'
import { addSubscriptions, generateRandomId } from 'utils'
import { alert, confirm } from 'modal'
import { createRemote, editRemote, subscribeRemotes } from 'xo'
import { error } from 'notification'
import { format } from 'xo-remote-parser'
import { injectState, provideState } from '@julien-f/freactal'
import { linkState } from 'freactal-utils'
import { map, some, trimStart } from 'lodash'
import { Number } from 'form'

const remoteTypes = {
  file: 'remoteTypeLocal',
  nfs: 'remoteTypeNfs',
  smb: 'remoteTypeSmb',
}

export default [
  addSubscriptions({
    remotes: subscribeRemotes,
  }),
  provideState({
    initialState: () => ({
      domain: undefined,
      host: undefined,
      inputTypeId: generateRandomId(),
      name: undefined,
      password: undefined,
      path: undefined,
      port: undefined,
      type: undefined,
      username: undefined,
    }),
    effects: {
      linkState,
      setPort: (_, port) => state => ({
        port: port === undefined && state.remote !== undefined ? '' : port,
      }),
      editRemote: ({ reset }) => state => {
        const {
          remote,
          domain = remote.domain,
          host = remote.host,
          name,
          password = remote.password,
          path = remote.path,
          port = remote.port,
          type = remote.type,
          username = remote.username,
        } = state
        return editRemote(remote, {
          name,
          url: format({
            domain,
            host,
            password,
            path,
            port: port || undefined,
            type,
            username,
          }),
        }).then(reset)
      },
      createRemote: ({ reset }) => async (state, { remotes }) => {
        if (some(remotes, { name: state.name })) {
          return alert(
            <span>
              <Icon icon='error' /> {_('remoteTestName')}
            </span>,
            <p>{_('remoteTestNameFailure')}</p>
          )
        }

        const {
          domain,
          host,
          name,
          password,
          path,
          port,
          type = 'nfs',
          username,
        } = state

        const urlParams = {
          host,
          path,
          port,
          type,
        }
        username && (urlParams.username = username)
        password && (urlParams.password = password)
        domain && (urlParams.domain = domain)

        if (type === 'file') {
          await confirm({
            title: _('localRemoteWarningTitle'),
            body: _('localRemoteWarningMessage'),
          })
        }

        const url = format(urlParams)
        return createRemote(name, url)
          .then(reset)
          .catch(err => error('Create Remote', err.message || String(err)))
      },
    },
    computed: {
      parsedPath: ({ remote }) => remote && trimStart(remote.path, '/'),
    },
  }),
  injectState,
  ({ state, effects, formatMessage }) => {
    const {
      remote = {},
      domain = remote.domain || '',
      host = remote.host || '',
      name = remote.name || '',
      password = remote.password || '',
      parsedPath,
      path = parsedPath || '',
      port = remote.port,
      type = remote.type || 'nfs',
      username = remote.username || '',
    } = state
    return (
      <div>
        <h2>{_('newRemote')}</h2>
        <form id={state.formId}>
          <div className='form-group'>
            <label htmlFor={state.inputTypeId}>{_('remoteType')}</label>
            <select
              className='form-control'
              id={state.inputTypeId}
              name='type'
              onChange={effects.linkState}
              required
              value={type}
            >
              {map(remoteTypes, (label, key) =>
                _({ key }, label, message => (
                  <option value={key}>{message}</option>
                ))
              )}
            </select>
            {type === 'smb' && (
              <em className='text-warning'>{_('remoteSmbWarningMessage')}</em>
            )}
          </div>
          <div className='form-group'>
            <input
              className='form-control'
              name='name'
              onChange={effects.linkState}
              placeholder={formatMessage(messages.remoteMyNamePlaceHolder)}
              required
              type='text'
              value={name}
            />
          </div>
          {type === 'file' && (
            <fieldset className='form-group'>
              <div className='input-group'>
                <span className='input-group-addon'>/</span>
                <input
                  className='form-control'
                  name='path'
                  onChange={effects.linkState}
                  pattern='^(([^/]+)+(/[^/]+)*)?$'
                  placeholder={formatMessage(
                    messages.remoteLocalPlaceHolderPath
                  )}
                  required
                  type='text'
                  value={path}
                />
              </div>
            </fieldset>
          )}
          {type === 'nfs' && (
            <fieldset>
              <div className='form-group'>
                <input
                  className='form-control'
                  name='host'
                  onChange={effects.linkState}
                  placeholder={formatMessage(messages.remoteNfsPlaceHolderHost)}
                  required
                  type='text'
                  value={host}
                />
                <br />
                <Number
                  onChange={effects.setPort}
                  placeholder={formatMessage(messages.remoteNfsPlaceHolderPort)}
                  value={port}
                />
              </div>
              <div className='input-group form-group'>
                <span className='input-group-addon'>/</span>
                <input
                  className='form-control'
                  name='path'
                  onChange={effects.linkState}
                  pattern='^(([^/]+)+(/[^/]+)*)?$'
                  placeholder={formatMessage(messages.remoteNfsPlaceHolderPath)}
                  required
                  type='text'
                  value={path}
                />
              </div>
            </fieldset>
          )}
          {type === 'smb' && (
            <fieldset>
              <div className='input-group form-group'>
                <span className='input-group-addon'>\\</span>
                <input
                  className='form-control'
                  name='host'
                  onChange={effects.linkState}
                  pattern='^([^\\/]+)\\([^\\/]+)$'
                  placeholder={formatMessage(
                    messages.remoteSmbPlaceHolderAddressShare
                  )}
                  required
                  type='text'
                  value={host}
                />
                <span className='input-group-addon'>\</span>
                <input
                  className='form-control'
                  name='path'
                  onChange={effects.linkState}
                  pattern='^(([^\\/]+)+(\\[^\\/]+)*)?$'
                  placeholder={formatMessage(
                    messages.remoteSmbPlaceHolderRemotePath
                  )}
                  type='text'
                  value={path}
                />
              </div>
              <div className='form-group'>
                <input
                  className='form-control'
                  name='username'
                  onChange={effects.linkState}
                  placeholder={formatMessage(
                    messages.remoteSmbPlaceHolderUsername
                  )}
                  required
                  type='text'
                  value={username}
                />
              </div>
              <div className='form-group'>
                <input
                  className='form-control'
                  name='password'
                  onChange={effects.linkState}
                  placeholder={formatMessage(
                    messages.remoteSmbPlaceHolderPassword
                  )}
                  required
                  type='text'
                  value={password}
                />
              </div>
              <div className='form-group'>
                <input
                  className='form-control'
                  onChange={effects.linkState}
                  name='domain'
                  placeholder={formatMessage(
                    messages.remoteSmbPlaceHolderDomain
                  )}
                  required
                  type='text'
                  value={domain}
                />
              </div>
            </fieldset>
          )}
          <div className='form-group'>
            <ActionButton
              btnStyle='primary'
              form={state.formId}
              handler={
                state.remote === undefined
                  ? effects.createRemote
                  : effects.editRemote
              }
              icon='save'
              type='submit'
            >
              {_('savePluginConfiguration')}
            </ActionButton>
            <ActionButton
              className='pull-right'
              handler={effects.reset}
              icon='reset'
              type='reset'
            >
              {_('formReset')}
            </ActionButton>
          </div>
        </form>
      </div>
    )
  },
].reduceRight((value, decorator) => decorator(value))
