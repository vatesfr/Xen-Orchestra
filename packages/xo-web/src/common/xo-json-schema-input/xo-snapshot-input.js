import React from 'react'

import XoAbstractInput from './xo-abstract-input'
import { PrimitiveInputWrapper } from '../json-schema-input/helpers'
import { SelectSnapshot } from '../select-objects'

// ===================================================================

export default class snapshotInput extends XoAbstractInput {
  render () {
    const { props } = this

    return (
      <PrimitiveInputWrapper {...props}>
        <SelectSnapshot
          disabled={props.disabled}
          hasSelectAll
          multi={props.multi}
          onChange={this._onChange}
          ref='input'
          required={props.required}
          value={props.value}
        />
      </PrimitiveInputWrapper>
    )
  }
}
