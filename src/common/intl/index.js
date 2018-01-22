import isFunction from 'lodash/isFunction'
import isString from 'lodash/isString'
import moment from 'moment'
import PropTypes from 'prop-types'
import React, { Component } from 'react'
import { connect } from 'react-redux'
import { FormattedMessage, IntlProvider as IntlProvider_ } from 'react-intl'

import locales from './locales'
import messages from './messages'
import Tooltip from '.././tooltip'
import { createSelector } from '.././selectors'

// ===================================================================

// Params:
//
// - props (optional): properties to add to the FormattedMessage
// - messageId: identifier of the message to format/translate
// - values (optional): values to pass to the message
// - render (optional): a function receiving the React nodes of the
//     translated message and returning the React node to render
const getMessage = (props, messageId, values, render) => {
  if (isString(props)) {
    render = values
    values = messageId
    messageId = props
    props = undefined
  }

  const message = messages[messageId]
  if (process.env.NODE_ENV !== 'production' && !message) {
    throw new Error(`no message defined for ${messageId}`)
  }

  if (isFunction(values)) {
    render = values
    values = undefined
  }

  return (
    <FormattedMessage {...props} {...message} values={values}>
      {render}
    </FormattedMessage>
  )
}
getMessage.keyValue = (key, value) =>
  getMessage('keyValue', {
    key: <strong>{key}</strong>,
    value,
  })

export { getMessage as default }

export { messages }

@connect(({ lang }) => ({ lang }))
export class IntlProvider extends Component {
  static propTypes = {
    children: PropTypes.node.isRequired,
    lang: PropTypes.string.isRequired,
  }

  render () {
    const { lang, children } = this.props
    // Adding a key prop is a work-around suggested by react-intl documentation
    // to make sure changes to the locale trigger a re-render of the child components
    // https://github.com/yahoo/react-intl/wiki/Components#dynamic-language-selection
    //
    // FIXME: remove the key prop when React context propagation is fixed (https://github.com/facebook/react/issues/2517)
    return (
      <IntlProvider_ key={lang} locale={lang} messages={locales[lang]}>
        {children}
      </IntlProvider_>
    )
  }
}

const parseDuration = seconds => {
  const days = Math.floor(seconds / 86400)
  seconds -= days * 86400
  const hours = Math.floor(seconds / 3600)
  seconds -= hours * 3600
  const minutes = Math.floor(seconds / 60)
  seconds -= minutes * 60
  return { days, hours, minutes, seconds }
}

@connect(({ lang }) => ({ lang }))
export class FormattedDuration extends Component {
  _parseDuration = createSelector(
    () => this.props.duration,
    duration => parseDuration(duration / 1e3)
  )

  _humanizeDuration = createSelector(
    () => this.props.duration,
    () => this.props.lang,
    (duration, lang) =>
      moment
        .duration(duration)
        .locale(lang)
        .humanize()
  )

  render () {
    return (
      <Tooltip content={getMessage('parseDuration', this._parseDuration())}>
        <span>{this._humanizeDuration()}</span>
      </Tooltip>
    )
  }
}
