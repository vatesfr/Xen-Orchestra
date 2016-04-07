import ActionButton from 'action-button'
import ActionToggle from 'action-toggle'
import GenericInput from 'json-schema-input'
import Icon from 'icon'
import React, { Component } from 'react'
import _ from 'messages'
import map from 'lodash/map'
import { lastly } from 'promise-toolbox'

import {
  configurePlugin,
  disablePluginAutoload,
  enablePluginAutoload,
  loadPlugin,
  purgePluginConfiguration,
  subscribePlugins,
  unloadPlugin
} from 'xo'

class Plugin extends Component {
  constructor (props) {
    super(props)
    this.state = {}
    this.formId = `form-${props.id}`
  }

  _updateExpanded = () => {
    this.setState({
      expanded: !this.state.expanded
    })
  }

  _setAutoload = (event) => {
    if (this._updateAutoload) {
      return
    }

    this._updateAutoload = true
    const method = event.target.checked ? enablePluginAutoload : disablePluginAutoload
    method(this.props.id)::lastly(() => { this._updateAutoload = false })
  }

  _updateLoad = () => {
    const { props } = this
    const { id } = props

    if (!props.loaded) {
      return loadPlugin(id)
    }

    if (!props.unloadable) {
      return unloadPlugin(id)
    }
  }

  _saveConfiguration = () => configurePlugin(this.props.id, this.refs.pluginInput.value)

  _deleteConfiguration = async () => {
    if (await purgePluginConfiguration(this.props.id)) {
      this.refs.pluginInput.value = undefined
    }
  }

  render () {
    const {
      props,
      state
    } = this
    const { expanded } = state
    const { loaded } = props
    const { formId } = this

    return (
      <div className='card-block'>
        <h4 className='form-inline clearfix'>
          <ActionToggle disabled={loaded && props.unloadable} toggleOn={loaded} handler={this._updateLoad} />
          <span className='text-primary'>
            {`${props.name} `}
          </span>
          <span>
            {`(v${props.version}) `}
          </span>
          <div className='checkbox small'>
            <label className='text-muted'>
              {_('autoloadPlugin')} <input type='checkbox' checked={props.autoload} onChange={this._setAutoload} />
            </label>
          </div>
          <div className='form-group pull-right small'>
            <button type='button' className='btn btn-primary' onClick={this._updateExpanded}>
              <Icon icon={expanded ? 'minus' : 'plus'} />
            </button>
          </div>
        </h4>
        {expanded &&
          <form id={formId}>
            <GenericInput
              label='Configuration'
              schema={props.configurationSchema}
              required
              ref='pluginInput'
              value={props.configuration}
            />
            <div className='form-group pull-xs-right'>
              <div className='btn-toolbar'>
                <div className='btn-group'>
                  <ActionButton type='submit' form={formId} icon='save' className='btn-primary' handler={this._saveConfiguration}>
                    {_('savePluginConfiguration')}
                  </ActionButton>
                </div>
                <div className='btn-group'>
                  <ActionButton icon='delete' className='btn-danger' handler={this._deleteConfiguration}>
                    {_('deletePluginConfiguration')}
                  </ActionButton>
                </div>
              </div>
            </div>
          </form>
        }
      </div>
    )
  }
}

export default class Plugins extends Component {
  constructor (props) {
    super(props)
    this.state = {}
  }

  componentWillMount () {
    this.componentWillUnmount = subscribePlugins(plugins => {
      this.setState({ plugins })
    })
  }

  render () {
    return (
      <div>
        <h2>
          <Icon icon='menu-settings-plugins' />
          <span>Plugins</span>
        </h2>
        <ul style={{'paddingLeft': 0}} >
          {map(this.state.plugins, (plugin, key) =>
            <li key={key} className='list-group-item clearfix'>
              <Plugin {...plugin} />
            </li>
          )}
        </ul>
      </div>
    )
  }
}
