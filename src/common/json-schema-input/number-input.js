import React from 'react'

import AbstractInput from './abstract-input'
import { PrimitiveInputWrapper } from './helpers'

// ===================================================================

export default class NumberInput extends AbstractInput {
  get value () {
    const { value } = this.refs.input
    return !value ? undefined : +value
  }

  render () {
    const { props } = this
    const { onChange } = props

    return (
      <PrimitiveInputWrapper {...props}>
        <input
          className='form-control'
          defaultValue={props.value || ''}
          onChange={onChange && ((event) => onChange(event.target.value))}
          placeholder={props.placeholder}
          ref='input'
          required={props.required}
          step='any'
          type='number'
        />
      </PrimitiveInputWrapper>
    )
  }
}
