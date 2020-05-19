import _ from 'intl'
import decorate from 'apply-decorators'
import Icon from 'icon'
import PropTypes from 'prop-types'
import React from 'react'
import SortedTable from 'sorted-table'
import Tooltip from 'tooltip'
import { addSubscriptions, connectStore, createCompare } from 'utils'
import { createGetObjectsOfType } from 'selectors'
import { createPredicate } from 'value-matcher'
import { filter, flatMap, isEmpty, map, omit, some, uniq } from 'lodash'
import { Host, Pool } from 'render-xo-item'
import { injectState, provideState } from 'reaclette'
import { Text, XoSelect } from 'editable'
import {
  copyVms,
  deleteVms,
  editVm,
  migrateVm,
  migrateVms,
  pauseVms,
  restartVms,
  snapshotVms,
  startVms,
  stopVms,
  subscribeBackupNgJobs,
  suspendVms,
} from 'xo'

const createCompareContainers = poolId =>
  createCompare([c => c.$pool === poolId, c => c.type === 'pool'])

const getVmUrl = ({ id }) => `vms/${id}/general`

const COLUMNS = [
  {
    name: _('name'),
    itemRenderer: vm => {
      const operations = vm.current_operations
      const state = isEmpty(operations) ? vm.power_state : 'Busy'
      return (
        <span>
          <Tooltip
            content={
              <span>
                {_(`powerState${state}`)}
                {state === 'Busy' && (
                  <span> ({Object.values(operations)[0]})</span>
                )}
              </span>
            }
          >
            <Icon icon={state.toLowerCase()} />
          </Tooltip>
          <Text
            value={vm.name_label}
            onChange={value => editVm(vm, { name_label: value })}
            placeholder={_('vmHomeNamePlaceholder')}
            useLongClick
          />
        </span>
      )
    },
    sortCriteria: 'name_label',
  },
  {
    name: _('description'),
    itemRenderer: vm => (
      <Text
        value={vm.name_description}
        onChange={value => editVm(vm, { name_description: value })}
        placeholder={_('vmHomeDescriptionPlaceholder')}
        useLongClick
      />
    ),
    sortCriteria: 'name_description',
  },
  {
    name: _('containersTabName'),
    itemRenderer: (vm, { pools, hosts }) => {
      let container
      return vm.power_state === 'Running' &&
        (container = hosts[vm.$container]) !== undefined ? (
        <XoSelect
          compareContainers={createCompareContainers(vm.$pool)}
          labelProp='name_label'
          onChange={host => migrateVm(vm, host)}
          placeholder={_('homeMigrateTo')}
          useLongClick
          value={container}
          xoType='host'
        >
          <Host id={container.id} link />
        </XoSelect>
      ) : (
        (container = pools[vm.$container]) !== undefined && (
          <Pool id={container.id} link />
        )
      )
    },
  },
]

const ACTIONS = [
  {
    disabled: vms => some(vms, { power_state: 'Running' }),
    handler: startVms,
    icon: 'vm-start',
    label: _('startVmLabel'),
  },
  {
    disabled: vms => some(vms, { power_state: 'Halted' }),
    handler: stopVms,
    icon: 'vm-stop',
    label: _('stopVmLabel'),
  },
  {
    handler: migrateVms,
    icon: 'vm-migrate',
    label: _('migrateVmLabel'),
  },
  {
    handler: snapshotVms,
    icon: 'vm-snapshot',
    label: _('snapshotVmLabel'),
  },
  {
    handler: copyVms,
    icon: 'vm-copy',
    label: _('copyVmLabel'),
  },
  {
    handler: (vms, { setHomeVmIdsSelection }) => {
      setHomeVmIdsSelection(map(vms, 'id'))
    },
    icon: 'backup',
    label: _('backupLabel'),
    redirectOnSuccess: '/backup/new/vms',
  },
  {
    handler: deleteVms,
    icon: 'vm-delete',
    label: _('vmRemoveButton'),
    level: 'danger',
  },
]

const GROUPED_ACTIONS = [
  {
    disabled: vms => some(vms, _ => _.power_state !== 'Running'),
    handler: restartVms,
    icon: 'vm-reboot',
    label: _('rebootVmLabel'),
  },
  {
    disabled: vms => some(vms, _ => _.power_state !== 'Running'),
    handler: pauseVms,
    icon: 'vm-pause',
    label: _('pauseVmLabel'),
  },
  {
    disabled: vms => some(vms, _ => _.power_state !== 'Running'),
    handler: suspendVms,
    icon: 'vm-suspend',
    label: _('suspendVmLabel'),
  },
]

const BackedUpVms = decorate([
  addSubscriptions({
    jobs: subscribeBackupNgJobs,
  }),
  connectStore(() => ({
    hosts: createGetObjectsOfType('host'),
    pools: createGetObjectsOfType('pool'),
  })),
  provideState({
    computed: {
      collection: (_, { showBackedUpVms, jobs, vms }) => {
        if (isEmpty(vms)) {
          return []
        }

        const backedUpVms = uniq(
          flatMap(jobs, job =>
            filter(vms, createPredicate(omit(job.vms, 'power_state')))
          )
        )

        return showBackedUpVms
          ? backedUpVms
          : vms.filter(vm => !backedUpVms.includes(vm))
      },
      title: (state, { showBackedUpVms }) =>
        showBackedUpVms ? _('backedUpVms') : _('notBackedUpVms'),
    },
  }),
  injectState,
  ({
    hosts,
    itemsPerPage,
    pools,
    setHomeVmIdsSelection,
    state: { collection, title },
  }) => (
    <div>
      <h5>{title}</h5>
      <SortedTable
        actions={ACTIONS}
        collection={collection}
        columns={COLUMNS}
        data-hosts={hosts}
        data-pools={pools}
        data-setHomeVmIdsSelection={setHomeVmIdsSelection}
        groupedActions={GROUPED_ACTIONS}
        itemsPerPage={itemsPerPage}
        rowLink={getVmUrl}
        shortcutsTarget='body'
        stateUrlParam='s'
      />
    </div>
  ),
])

BackedUpVms.propTypes = {
  showBackedUpVms: PropTypes.bool,
  vms: PropTypes.arrayOf(PropTypes.object),
}

BackedUpVms.defaultProps = {
  showBackedUpVms: true,
}

export default BackedUpVms
