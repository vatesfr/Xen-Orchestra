import isArray from 'lodash/isArray'
import isString from 'lodash/isString'
import map from 'lodash/map'
import PropTypes from 'prop-types'
import React, { Component, cloneElement } from 'react'
import { createSelector } from 'selectors'
import { injectIntl } from 'react-intl'
import { Modal as ReactModal } from 'react-bootstrap-4/lib'

import _, { messages } from './intl'
import BaseComponent from './base-component'
import Button from './button'
import Icon from './icon'
import Tooltip from './tooltip'
import { generateRandomId } from './utils'
import {
  disable as disableShortcuts,
  enable as enableShortcuts,
} from './shortcuts'

// -----------------------------------------------------------------------------

let instance
const modal = (content, onClose, props) => {
  if (!instance) {
    throw new Error('No modal instance.')
  } else if (instance.state.showModal) {
    throw new Error('Other modal still open.')
  }
  instance.setState(
    { content, onClose, showModal: true, props },
    disableShortcuts
  )
}

const _addRef = (component, ref) => {
  if (isString(component) || isArray(component)) {
    return component
  }

  try {
    return cloneElement(component, { ref })
  } catch (_) {} // Stateless component.
  return component
}

// -----------------------------------------------------------------------------

class GenericModal extends Component {
  static propTypes = {
    buttons: PropTypes.arrayOf(
      PropTypes.shape({
        btnStyle: PropTypes.string,
        icon: PropTypes.string,
        label: PropTypes.node.isRequired,
        tooltip: PropTypes.node,
        value: PropTypes.any,
      })
    ).isRequired,
    children: PropTypes.node.isRequired,
    icon: PropTypes.string,
    title: PropTypes.node.isRequired,
  }

  _getBodyValue = () => {
    const { body } = this.refs
    if (body !== undefined) {
      return body.getWrappedInstance === undefined
        ? body.value
        : body.getWrappedInstance().value
    }
  }

  _resolve = (value = this._getBodyValue()) => {
    this.props.resolve(value)
    instance.close()
  }

  _reject = () => {
    this.props.reject()
    instance.close()
  }

  render () {
    const { buttons, icon, title } = this.props

    const body = _addRef(this.props.children, 'body')

    return (
      <div>
        <ReactModal.Header closeButton>
          <ReactModal.Title>
            {icon ? (
              <span>
                <Icon icon={icon} /> {title}
              </span>
            ) : (
              title
            )}
          </ReactModal.Title>
        </ReactModal.Header>
        <ReactModal.Body>{body}</ReactModal.Body>
        <ReactModal.Footer>
          {map(buttons, ({ label, tooltip, value, icon, ...props }, key) => {
            const button = (
              <Button onClick={() => this._resolve(value)} {...props}>
                {icon !== undefined && <Icon icon={icon} fixedWidth />}
                {label}
              </Button>
            )
            return (
              <span key={key}>
                {tooltip !== undefined ? (
                  <Tooltip content={tooltip}>{button}</Tooltip>
                ) : (
                  button
                )}{' '}
              </span>
            )
          })}
          {this.props.reject !== undefined && (
            <Button onClick={this._reject}>{_('genericCancel')}</Button>
          )}
        </ReactModal.Footer>
      </div>
    )
  }
}

export const chooseAction = ({ body, buttons, icon, title }) => {
  return new Promise((resolve, reject) => {
    modal(
      <GenericModal
        buttons={buttons}
        icon={icon}
        reject={reject}
        resolve={resolve}
        title={title}
      >
        {body}
      </GenericModal>,
      reject
    )
  })
}

@injectIntl
class StrongConfirm extends Component {
  static propTypes = {
    body: PropTypes.node,
    strongConfirm: PropTypes.object.isRequired,
    icon: PropTypes.string,
    reject: PropTypes.func,
    resolve: PropTypes.func,
    title: PropTypes.node.isRequired,
  }

  state = {
    buttons: [{ btnStyle: 'danger', label: _('confirmOk'), disabled: true }],
  }

  _getStrongConfirmString = createSelector(
    () => this.props.intl.formatMessage,
    () => this.props.strongConfirm,
    (format, { messageId, values }) => format(messages[messageId], values)
  )

  _onInputChange = event => {
    const userInput = event.target.value
    const strongConfirmString = this._getStrongConfirmString()
    const confirmButton = this.state.buttons[0]

    let disabled
    if (
      (userInput.toLowerCase() === strongConfirmString.toLowerCase()) ^
      (disabled = !confirmButton.disabled)
    ) {
      this.setState({
        buttons: [{ ...confirmButton, disabled }],
      })
    }
  }

  render () {
    const {
      body,
      strongConfirm: { messageId, values },
      icon,
      reject,
      resolve,
      title,
    } = this.props

    return (
      <GenericModal
        buttons={this.state.buttons}
        icon={icon}
        reject={reject}
        resolve={resolve}
        title={title}
      >
        {body}
        <hr />
        <div>
          {_('enterConfirmText')}{' '}
          <strong className='no-text-selection'>{_(messageId, values)}</strong>
        </div>
        <div>
          <input
            className='form-control'
            ref={ref => {
              ref && ref.focus()
            }}
            onChange={this._onInputChange}
          />
        </div>
      </GenericModal>
    )
  }
}

// -----------------------------------------------------------------------------

const ALERT_BUTTONS = [{ label: _('alertOk'), value: 'ok' }]

export const alert = (title, body) =>
  new Promise(resolve => {
    modal(
      <GenericModal buttons={ALERT_BUTTONS} resolve={resolve} title={title}>
        {body}
      </GenericModal>,
      resolve
    )
  })

// -----------------------------------------------------------------------------

const CONFIRM_BUTTONS = [{ btnStyle: 'primary', label: _('confirmOk') }]

export const confirm = ({ body, icon = 'alarm', title, strongConfirm }) =>
  strongConfirm
    ? new Promise((resolve, reject) => {
        modal(
          <StrongConfirm
            body={body}
            icon={icon}
            reject={reject}
            resolve={resolve}
            strongConfirm={strongConfirm}
            title={title}
          />,
          reject
        )
      })
    : chooseAction({
        body,
        buttons: CONFIRM_BUTTONS,
        icon,
        title,
      })

// -----------------------------------------------------------------------------

const preventDefault = event => event.preventDefault()

class FormModal extends BaseComponent {
  state = {
    value: this.props.defaultValue,
  }

  get value () {
    return this.state.value
  }

  render () {
    const { body, formId } = this.props
    return (
      <form id={formId} onSubmit={preventDefault}>
        {cloneElement(body, {
          value: this.state.value,
          onChange: this.linkState('value'),
        })}
      </form>
    )
  }
}

export const form = ({ body, defaultValue, icon, title, size }) => {
  const formId = generateRandomId()
  const buttons = [
    {
      btnStyle: 'primary',
      label: _('formOk'),
      form: formId,
    },
  ]
  return new Promise((resolve, reject) => {
    modal(
      <GenericModal
        buttons={buttons}
        icon={icon}
        reject={reject}
        resolve={resolve}
        title={title}
      >
        <FormModal body={body} defaultValue={defaultValue} formId={formId} />
      </GenericModal>,
      reject,
      {
        bsSize: size,
      }
    )
  })
}

// -----------------------------------------------------------------------------

export default class Modal extends Component {
  constructor () {
    super()

    this.state = { showModal: false }
  }

  componentDidMount () {
    if (instance) {
      throw new Error('Modal is a singleton!')
    }
    instance = this
  }

  componentWillUnmount () {
    instance = undefined
  }

  close () {
    this.setState({ showModal: false }, enableShortcuts)
  }

  _onHide = () => {
    this.close()

    const { onClose } = this.state
    onClose && onClose()
  }

  render () {
    const { content, showModal, props } = this.state
    return (
      <ReactModal show={showModal} onHide={this._onHide} {...props}>
        {content}
      </ReactModal>
    )
  }
}
