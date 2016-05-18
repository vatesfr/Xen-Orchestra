import findKey from 'lodash/findKey'
import Icon from 'icon'
import isFunction from 'lodash/isFunction'
import isString from 'lodash/isString'
import map from 'lodash/map'
import React from 'react'

import Component from './base-component'
import { propTypes } from './utils'

const LONG_CLICK = 400

@propTypes({
  alt: propTypes.node.isRequired
})
class Hover extends Component {
  constructor () {
    super()

    this.state = {
      hover: false
    }

    this._onMouseEnter = () => this.setState({ hover: true })
    this._onMouseLeave = () => this.setState({ hover: false })
  }

  render () {
    if (this.state.hover) {
      return <a onMouseLeave={this._onMouseLeave}>
        {this.props.alt}
      </a>
    }

    return <a onMouseEnter={this._onMouseEnter}>
      {this.props.children}
    </a>
  }
}

class Editable extends Component {
  _closeEdition = () => {
    this.setState({ editing: false })
  }

  _openEdition = () => {
    this.setState({
      editing: true,
      error: null,
      saving: false
    })
  }

  _undo = () => {
    const { onUndo } = this.props
    if (onUndo === false) {
      return
    }

    return this._save(this.state.previous, isFunction(onUndo) && onUndo)
  }

  async _save (value, fn) {
    const { props } = this

    const previous = props.children
    if (value === previous) {
      return this._closeEdition()
    }

    this.setState({ saving: true })

    try {
      await (fn || props.onChange)(value)

      this.setState({ previous })
      this._closeEdition()
    } catch (error) {
      this.setState({
        error: isString(error) ? error : error.message,
        saving: false
      })
    }
  }

  _startTimer = event => {
    event.persist()
    this._timeout = setTimeout(() => {
      event.preventDefault()
      this._openEdition()
    }, LONG_CLICK)
  }
  _stopTimer = () => clearTimeout(this._timeout)
}

@propTypes({
  children: propTypes.string.isRequired,
  onChange: propTypes.func.isRequired,
  onUndo: propTypes.oneOf([
    propTypes.bool,
    propTypes.func
  ]),
  useLongClick: propTypes.bool
})
export class Text extends Editable {
  _onKeyDown = event => {
    const { keyCode } = event
    if (keyCode === 27) {
      return this._closeEdition()
    }

    if (keyCode === 13) {
      return this._save(event.target.value)
    }
  }
  _onInput = ({ target }) => {
    target.style.width = `${target.value.length + 1}ex`
  }

  render () {
    const { state } = this

    if (!state.editing) {
      const { onUndo, previous } = state
      const { useLongClick } = this.props

      const success = <Icon icon='success' />

      return <span>
        <span
          onMouseDown={useLongClick && this._startTimer}
          onMouseUp={useLongClick && this._stopTimer}
          onClick={!useLongClick && this._openEdition}
        >
          {this.props.children}
        </span>
        {previous != null && (onUndo !== false
          ? <Hover alt={<Icon icon='undo' onClick={this._undo} />}>
            {success}
          </Hover>
          : success
        )}
      </span>
    }

    const { children } = this.props
    const { error, saving } = state

    return <span>
      <input
        autoFocus
        defaultValue={children}
        onBlur={this._closeEdition}
        onInput={this._onInput}
        onKeyDown={this._onKeyDown}
        readOnly={saving}
        style={{
          width: `${children.length + 1}ex`
        }}
        type='text'
      />
      {saving && <span>{' '}<Icon icon='loading' /></span>}
      {error != null && <span>{' '}<Icon icon='error' title={error} /></span>}
    </span>
  }
}

@propTypes({
  onChange: propTypes.func.isRequired,
  options: propTypes.oneOfType([
    propTypes.array,
    propTypes.object
  ]).isRequired,
  labelProp: propTypes.string.isRequired,
  defaultValue: propTypes.any,
  useLongClick: propTypes.bool
})
export class Select extends Editable {
  componentDidMount () {
    this._defaultValue = findKey(this.props.options, option => option === this.props.defaultValue)
  }

  _onKeyDown = event => {
    if (event.keyCode === 27) {
      return this._closeEdition()
    }
  }
  _onChange = event => {
    this._save(this.props.options[event.target.value])
  }
  _optionToJsx = (option, index) => {
    const { labelProp } = this.props
    return <option
      key={index}
      value={index}
    >
      {labelProp ? option[labelProp] : option}
    </option>
  }

  render () {
    const { state } = this

    if (!state.editing) {
      const { useLongClick } = this.props

      return <span
        onMouseDown={useLongClick && this._startTimer}
        onMouseUp={useLongClick && this._stopTimer}
        onClick={!useLongClick && this._openEdition}
      >
        {this.props.children}
      </span>
    }

    const { options } = this.props
    const { error, saving } = state
    return <span>
      <select
        className='form-control'
        style={{padding: '0px'}}
        autoFocus
        defaultValue={this._defaultValue}
        onBlur={this._closeEdition}
        onChange={this._onChange}
        onKeyDown={this._onKeyDown}
        readOnly={saving}
      >
        {map(options, this._optionToJsx)}
      </select>
      {saving && <span>{' '}<Icon icon='loading' /></span>}
      {error != null && <span>{' '}<Icon icon='error' title={error} /></span>}
    </span>
  }
}
