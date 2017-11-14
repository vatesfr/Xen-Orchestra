import ActionButton from 'action-button'
import map from 'lodash/map'
import moment from 'moment-timezone'
import React from 'react'

import _ from './intl'
import Component from './base-component'
import propTypes from './prop-types-decorator'
import { getXoServerTimezone } from './xo'
import { Select } from './form'

const SERVER_TIMEZONE_TAG = 'server'
const LOCAL_TIMEZONE = moment.tz.guess()

@propTypes({
  defaultValue: propTypes.string,
  onChange: propTypes.func.isRequired,
  required: propTypes.bool,
  value: propTypes.string,
})
export default class TimezonePicker extends Component {
  componentDidMount () {
    getXoServerTimezone.then(serverTimezone => {
      this.setState({
        timezone:
          this.props.value || this.props.defaultValue || SERVER_TIMEZONE_TAG,
        options: [
          ...map(moment.tz.names(), value => ({ label: value, value })),
          {
            label: _('serverTimezoneOption', {
              value: serverTimezone,
            }),
            value: SERVER_TIMEZONE_TAG,
          },
        ],
      })
    })
  }

  componentWillReceiveProps (props) {
    if (props.value !== this.props.value) {
      this.setState({ timezone: props.value || SERVER_TIMEZONE_TAG })
    }
  }

  get value () {
    return this.state.timezone === SERVER_TIMEZONE_TAG
      ? null
      : this.state.timezone
  }

  set value (value) {
    this.setState({ timezone: value || SERVER_TIMEZONE_TAG })
  }

  _onChange = option => {
    if (option && option.value === this.state.timezone) {
      return
    }

    this.setState(
      {
        timezone: (option != null && option.value) || SERVER_TIMEZONE_TAG,
      },
      () =>
        this.props.onChange(
          this.state.timezone === SERVER_TIMEZONE_TAG
            ? null
            : this.state.timezone
        )
    )
  }

  _useLocalTime = () => {
    this._onChange({ value: LOCAL_TIMEZONE })
  }

  render () {
    const { timezone, options } = this.state

    return (
      <div>
        <Select
          className='mb-1'
          onChange={this._onChange}
          options={options}
          placeholder={_('selectTimezone')}
          required={this.props.required}
          value={timezone}
        />
        <div className='pull-right'>
          <ActionButton handler={this._useLocalTime} icon='time'>
            {_('timezonePickerUseLocalTime')}
          </ActionButton>
        </div>
      </div>
    )
  }
}
