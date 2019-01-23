import PropTypes from 'prop-types'
import React from 'react'
import styled from 'styled-components'
import { omit } from 'lodash'

import ActionButton from './action-button'

// do not forward `state` to ActionButton
const Button = styled(p => <ActionButton {...omit(p, 'state')} />)`
  background-color: ${p =>
    p.theme[`${p.state ? 'enabled' : 'disabled'}StateBg`]};
  border: 2px solid
    ${p => p.theme[`${p.state ? 'enabled' : 'disabled'}StateColor`]};
  color: ${p => p.theme[`${p.state ? 'enabled' : 'disabled'}StateColor`]};
`

const StateButton = props => {
  const {
    disabledHandler,
    disabledHandlerParam,
    disabledLabel,
    disabledTooltip,

    enabledLabel,
    enabledTooltip,
    enabledHandler,
    enabledHandlerParam,

    state,
    ...otherProps
  } = props
  const handlerParamProp = {}
  if ('enabledHandlerParam' in props || 'disabledHandlerParam' in props) {
    handlerParamProp.handlerParam = state
      ? enabledHandlerParam
      : disabledHandlerParam
  }
  return (
    <Button
      handler={state ? enabledHandler : disabledHandler}
      {...handlerParamProp}
      tooltip={state ? enabledTooltip : disabledTooltip}
      {...otherProps}
      icon={state ? 'running' : 'halted'}
      size='small'
      state={state}
    >
      {state ? enabledLabel : disabledLabel}
    </Button>
  )
}

StateButton.propTypes = {
  state: PropTypes.bool.isRequired,
}

export { StateButton as default }
