import _ from 'intl'
import ActionButton from 'action-button'
import ActionToggle from 'action-toggle'
import GenericInput from 'json-schema-input'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import React, { Component } from 'react'
import size from 'lodash/size'
import { addSubscriptions } from 'utils'
import { generateUiSchema } from 'xo-json-schema-input'
import { lastly } from 'promise-toolbox'
import { Row, Col } from 'grid'
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
    const { configurationSchema } = props

    // Don't update input with schema in edit mode!
    // It's always the same!
    this.state = {
      configurationSchema,
      uiSchema: generateUiSchema(configurationSchema)
    }
    this.formId = `form-${props.id}`
  }

  componentWillReceiveProps (nextProps) {
    // Don't update input with schema in edit mode!
    if (!this.state.edit) {
      const { configurationSchema } = nextProps

      this.setState({
        configurationSchema,
        uiSchema: generateUiSchema(configurationSchema)
      })

      if (this.refs.pluginInput) {
        // TODO: Compare values!!!
        // `|| undefined` because old configs can be null.
        this.refs.pluginInput.value = nextProps.configuration || undefined
      }
    }
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

    method(this.props.id)::lastly(() => {
      this._updateAutoload = false
    })
  }

  _updateLoad = () => {
    const { props } = this
    const { id } = props

    const method = (!props.loaded && loadPlugin) || (!props.unloadable && unloadPlugin)

    if (method) {
      return method(id)
    }
  }

  _saveConfiguration = async () => {
    try {
      await configurePlugin(this.props.id, this.refs.pluginInput.value)

      this.setState({
        edit: false
      })
    } catch (_) { }
  }

  _deleteConfiguration = async () => {
    try {
      await purgePluginConfiguration(this.props.id)
      this.refs.pluginInput.value = undefined
    } catch (_) { }
  }

  _edit = () => {
    this.setState({
      edit: true
    })
  }

  _cancelEdit = () => {
    this.setState({
      edit: false
    })
  }

  _applyPredefinedConfiguration = () => {
    const configName = this.refs.selectPredefinedConfiguration.value
    this.refs.pluginInput.value = this.props.configurationPresets[configName]
  }

  render () {
    const {
      props,
      state
    } = this
    const { expanded, edit } = state
    const {
      configurationPresets,
      loaded
    } = props
    const { formId } = this

    return (
      <div className='card-block'>
        <Row>
          <Col mediumSize={8}>
            <h5 className='form-inline clearfix'>
              <ActionToggle disabled={loaded && props.unloadable} value={loaded} handler={this._updateLoad} />
              <span className='text-primary'>
                {` ${props.name} `}
              </span>
              <span>
                {`(v${props.version}) `}
              </span>
              <div className='checkbox small'>
                <label className='text-muted'>
                  {_('autoloadPlugin')} <input type='checkbox' checked={props.autoload} onChange={this._setAutoload} />
                </label>
              </div>
            </h5>
          </Col>
          <Col mediumSize={4}>
            <div className='form-group pull-right small'>
              <button type='button' className='btn btn-primary' onClick={this._updateExpanded}>
                <Icon icon={expanded ? 'minus' : 'plus'} />
              </button>
            </div>
          </Col>
        </Row>
        {expanded &&
          <form id={formId}>
            {size(configurationPresets) > 0 && (
              <div>
                <legend>{_('pluginConfigurationPresetTitle')}</legend>
                <span className='text-muted'>
                  <p>{_('pluginConfigurationChoosePreset')}</p>
                </span>
                <div className='input-group'>
                  <select className='form-control' disabled={!edit} ref='selectPredefinedConfiguration'>
                    {map(configurationPresets, (_, name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <span className='input-group-btn'>
                    <button
                      className='btn btn-primary'
                      disabled={!edit}
                      onClick={this._applyPredefinedConfiguration}
                      type='button'
                    >
                      {_('applyPluginPreset')}
                    </button>
                  </span>
                </div>
                <hr />
              </div>
            )}
            <GenericInput
              disabled={!edit}
              label='Configuration'
              schema={state.configurationSchema}
              uiSchema={state.uiSchema}
              required
              ref='pluginInput'
              defaultValue={props.configuration || undefined}
            />
            <div className='form-group pull-right'>
              <div className='btn-toolbar'>
                <div className='btn-group'>
                  <ActionButton disabled={!edit} type='submit' form={formId} icon='save' className='btn-primary' handler={this._saveConfiguration}>
                    {_('savePluginConfiguration')}
                  </ActionButton>
                </div>
                <div className='btn-group'>
                  <ActionButton disabled={!edit} icon='delete' className='btn-danger' handler={this._deleteConfiguration}>
                    {_('deletePluginConfiguration')}
                  </ActionButton>
                </div>
                {!edit ? (
                  <div className='btn-group'>
                    <button type='button' className='btn btn-primary' onClick={this._edit}>
                      {_('editPluginConfiguration')}
                    </button>
                  </div>
                ) : (
                  <div className='btn-group'>
                    <button type='button' className='btn btn-primary' onClick={this._cancelEdit}>
                      {_('cancelPluginEdition')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </form>
        }
      </div>
    )
  }
}

@addSubscriptions({
  plugins: subscribePlugins
})
export default class Plugins extends Component {
  render () {
    if (isEmpty(this.props.plugins)) {
      return <p><em>{_('noPlugins')}</em></p>
    }

    return (
      <div>
        <ul style={{'paddingLeft': 0}} >
          {map(this.props.plugins, (plugin, key) =>
            <li key={key} className='list-group-item clearfix'>
              <Plugin {...plugin} />
            </li>
          )}
        </ul>
      </div>
    )
  }
}
