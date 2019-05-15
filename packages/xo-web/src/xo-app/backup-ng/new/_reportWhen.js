import _ from 'intl'
import decorate from 'apply-decorators'
import PropTypes from 'prop-types'
import React from 'react'
import Icon from 'icon'
import Select from 'form/select'
import Link from 'link'
import Tooltip from 'tooltip'
import { generateId } from 'reaclette-utils'
import { injectState, provideState } from 'reaclette'

import { FormGroup } from './../utils'

const REPORT_WHEN_FILTER_OPTIONS = [
  {
    label: 'reportWhenAlways',
    value: 'always',
  },
  {
    label: 'reportWhenFailure',
    value: 'failure',
  },
  {
    label: 'reportWhenNever',
    value: 'Never',
  },
]

const getOptionRenderer = ({ label }) => <span>{_(label)}</span>

const ReportWhen = decorate([
  provideState({
    computed: {
      idInput: generateId,
    },
  }),
  injectState,
  ({ state, onChange, value }) => (
    <FormGroup>
      <label htmlFor={state.idInput}>
        <strong>{_('reportWhen')}</strong>
      </label>{' '}
      <Tooltip content={_('pluginsWarning')}>
        <Link
          className='btn btn-primary btn-sm'
          target='_blank'
          to='/settings/plugins'
        >
          <Icon icon='menu-settings-plugins' />{' '}
          <strong>{_('pluginsSettings')}</strong>
        </Link>
      </Tooltip>
      <Select
        id={state.idInput}
        labelKey='label'
        onChange={onChange}
        optionRenderer={getOptionRenderer}
        options={REPORT_WHEN_FILTER_OPTIONS}
        required
        value={value}
        valueKey='value'
      />
    </FormGroup>
  ),
])

ReportWhen.propTypes = {
  onChange: PropTypes.func.isRequired,
  value: PropTypes.string,
}

export { ReportWhen as default }
