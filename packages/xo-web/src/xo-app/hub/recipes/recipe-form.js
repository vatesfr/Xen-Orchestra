import * as FormGrid from 'form-grid'
import _ from 'intl'
import decorate from 'apply-decorators'
import Icon from 'icon'
import React from 'react'
import Tooltip from 'tooltip'
import { Container } from 'grid'
import { sortBy } from 'lodash'
import { injectState, provideState } from 'reaclette'
import { SelectPool, SelectNetwork } from 'select-objects'

export default decorate([
  provideState({
    effects: {
      onChangePools(__, pool) {
        const { onChange, value } = this.props
        onChange({
          ...value,
          pool,
        })
      },
      onChangeNetwork(__, network) {
        const { onChange, value } = this.props
        onChange({
          ...value,
          network,
        })
      },
      onChangeValue(__, ev) {
        const { name, value } = ev.target
        const { onChange, value: prevValue } = this.props
        onChange({
          ...prevValue,
          [name]: value,
        })
      },
    },
    computed: {
      sortedPools: (_, { value }) => sortBy(value.pools, 'name_label'),
      networkPredicate: (_, { value: { pool } }) => network =>
        pool.id === network.$pool,
    },
  }),
  injectState,
  ({ effects, install, poolPredicate, state, value }) => (
    <Container>
      <FormGrid.Row>
        <label>
          {_('vmImportToPool')}
          &nbsp;
          {install && (
            <Tooltip content={_('hideInstalledPool')}>
              <Icon icon='info' />
            </Tooltip>
          )}
        </label>
        <SelectPool
          className='mb-1'
          onChange={effects.onChangePools}
          predicate={poolPredicate}
          required
          value={value.pool}
        />
      </FormGrid.Row>
      <FormGrid.Row>
        <label>Network</label>
        <SelectNetwork
          className='mb-1'
          onChange={effects.onChangeNetwork}
          required
          value={value.network}
          predicate={state.networkPredicate}
        />
      </FormGrid.Row>
      <FormGrid.Row>
        <label>Master name</label>
        <input
          className='form-control'
          name='masterName'
          onChange={effects.onChangeValue}
          placeholder='Master name'
          required
          type='text'
          value={value.masterName}
        />
      </FormGrid.Row>
      <FormGrid.Row>
        <label>Number of nodes</label>
        <input
          className='form-control'
          name='nbNodes'
          min='1'
          onChange={effects.onChangeValue}
          placeholder='Number of nodes'
          required
          type='number'
          value={value.nbNodes}
        />
      </FormGrid.Row>
      <FormGrid.Row>
        <label>SSH key</label>
        <input
          className='form-control'
          name='sshKey'
          onChange={effects.onChangeValue}
          placeholder='SSH key'
          required
          type='text'
          value={value.sshKey}
        />
      </FormGrid.Row>
      <FormGrid.Row>
        <label>Network CIDR</label>
        <input
          className='form-control'
          name='networkCidr'
          onChange={effects.onChangeValue}
          placeholder='Network CIDR'
          required
          type='text'
          value={value.networkCidr}
        />
      </FormGrid.Row>
    </Container>
  ),
])
