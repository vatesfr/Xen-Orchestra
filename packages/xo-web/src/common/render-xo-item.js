import _ from 'intl'
import PropTypes from 'prop-types'
import React from 'react'
import { startsWith } from 'lodash'

import Icon from './icon'
import Link from './link'
import { addSubscriptions, connectStore, formatSize } from './utils'
import { createGetObject, createSelector } from './selectors'
import { FormattedDate } from 'react-intl'
import { get } from './xo-defined'
import { isSrWritable, subscribeRemotes, subscribeResourceSets } from './xo'

// ===================================================================

const OBJECT_TYPE_TO_ICON = {
  'VM-template': 'vm',
  host: 'host',
  network: 'network',
}

const COMMON_PROP_TYPES = {
  link: PropTypes.bool,
}

const XoItem = ({ children, item, link, to }) =>
  item !== undefined ? (
    link ? (
      <Link to={to} target='_blank'>
        {children()}
      </Link>
    ) : (
      children()
    )
  ) : (
    <span className='text-muted'>{_('errorUnknownItem')}</span>
  )

XoItem.propTypes = {
  ...COMMON_PROP_TYPES,
  item: PropTypes.object,
  to: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
}
// ===================================================================

const XO_ITEM_PROP_TYPES = {
  ...COMMON_PROP_TYPES,
  id: PropTypes.string.isRequired,
}

export const VmItem = [
  connectStore(() => {
    const getVm = createGetObject()
    return {
      vm: getVm,
      container: createGetObject(
        createSelector(getVm, vm => get(() => vm.$container))
      ),
    }
  }),
  ({ vm, container, ...props }) => (
    <XoItem item={vm} to={`/vms/${get(() => vm.id)}`} {...props}>
      {() => (
        <span>
          <Icon icon={`vm-${vm.power_state.toLowerCase()}`} />{' '}
          {vm.name_label || vm.id}
          {container !== undefined &&
            ` (${container.name_label || container.id})`}
        </span>
      )}
    </XoItem>
  ),
].reduceRight((value, decorator) => decorator(value))

VmItem.propTypes = XO_ITEM_PROP_TYPES

export const SrItem = [
  connectStore(() => {
    const getSr = createGetObject()
    return {
      sr: getSr,
      container: createGetObject(
        createSelector(getSr, sr => get(() => sr.$container))
      ),
    }
  }),
  ({ sr, container, ...props }) => (
    <XoItem item={sr} to={`/srs/${get(() => sr.id)}`} {...props}>
      {() => (
        <span>
          <Icon icon='sr' /> {sr.name_label || sr.id}
          {container !== undefined && (
            <span className='text-muted'> - {container.name_label}</span>
          )}
          {isSrWritable(sr) && (
            <span>{` (${formatSize(sr.size - sr.physical_usage)} free)`}</span>
          )}
        </span>
      )}
    </XoItem>
  ),
].reduceRight((value, decorator) => decorator(value))

SrItem.propTypes = XO_ITEM_PROP_TYPES

// Host, Network, VM-template.
export const PoolObjectItem = [
  connectStore(() => {
    const getObject = createGetObject()
    return {
      object: getObject,
      pool: createGetObject(
        createSelector(getObject, obj => get(() => obj.$pool))
      ),
      to: createSelector(
        getObject,
        obj =>
          obj !== undefined &&
          (obj.type === 'VM-template'
            ? {
                pathname: '/home',
                query: {
                  t: 'VM-template',
                  s: `id:"${obj.id}"`,
                },
              }
            : obj.type === 'host'
              ? `/hosts/${obj.id}`
              : `/pools/${obj.$pool}/network`)
      ),
    }
  }),
  ({ object, pool, to, ...props }) => (
    <XoItem item={object} to={to} {...props}>
      {() => (
        <span>
          <Icon icon={OBJECT_TYPE_TO_ICON[object.type]} />{' '}
          {`${object.name_label || object.id} `}
          {pool && `(${pool.name_label || pool.id})`}
        </span>
      )}
    </XoItem>
  ),
].reduceRight((value, decorator) => decorator(value))

PoolObjectItem.propTypes = XO_ITEM_PROP_TYPES

export const PoolItem = [
  connectStore(() => ({
    pool: createGetObject(),
  })),
  ({ pool, ...props }) => (
    <XoItem item={pool} to={`/pools/${get(() => pool.id)}`} {...props}>
      {() => (
        <span>
          <Icon icon='pool' /> {pool.name_label || pool.id}
        </span>
      )}
    </XoItem>
  ),
].reduceRight((value, decorator) => decorator(value))

PoolItem.propTypes = XO_ITEM_PROP_TYPES

export const VgpuTypeItem = [
  connectStore(() => ({
    type: createGetObject(),
  })),
  ({ type }) => (
    <XoItem item={type}>
      {() => (
        <span>
          <Icon icon='gpu' /> {type.modelName} ({type.vendorName}){' '}
          {type.maxResolutionX}x{type.maxResolutionY}
        </span>
      )}
    </XoItem>
  ),
].reduceRight((value, decorator) => decorator(value))

VgpuTypeItem.propTypes = XO_ITEM_PROP_TYPES

export const VgpuItem = [
  connectStore(() => ({
    type: createGetObject(
      createSelector(createGetObject(), vgpu => get(() => vgpu.vgpuType))
    ),
  })),
  ({ type }) => (
    <XoItem item={type}>
      {() => (
        <span>
          <Icon icon='vgpu' /> {type.modelName}
        </span>
      )}
    </XoItem>
  ),
].reduceRight((value, decorator) => decorator(value))

VgpuItem.propTypes = XO_ITEM_PROP_TYPES

export const RemoteItem = [
  addSubscriptions(({ id }) => ({
    remote: cb =>
      subscribeRemotes(remotes => {
        cb(get(() => remotes.find(remote => remote.id === id)))
      }),
  })),
  ({ remote, ...props }) => (
    <XoItem item={remote} to='/settings/remotes' {...props}>
      {() => (
        <span>
          <Icon icon='remote' /> {remote.name}
        </span>
      )}
    </XoItem>
  ),
].reduceRight((value, decorator) => decorator(value))

RemoteItem.propTypes = XO_ITEM_PROP_TYPES

export const ResourceSetItem = [
  addSubscriptions(({ id }) => ({
    resourceSet: cb =>
      subscribeResourceSets(resourceSets => {
        cb(get(() => resourceSets.find(resourceSet => resourceSet.id === id)))
      }),
  })),
  ({ resourceSet, ...props }) => (
    <XoItem item={resourceSet} to='/self' {...props}>
      {() => (
        <span>
          <strong>
            <Icon icon='resource-set' /> {resourceSet.name}
          </strong>{' '}
          ({resourceSet.id})
        </span>
      )}
    </XoItem>
  ),
].reduceRight((value, decorator) => decorator(value))

ResourceSetItem.propTypes = XO_ITEM_PROP_TYPES

// ===================================================================

const xoItemToRender = {
  // Subscription objects.
  cloudConfig: template => (
    <span>
      <Icon icon='template' /> {template.name}
    </span>
  ),
  group: group => (
    <span>
      <Icon icon='group' /> {group.name}
    </span>
  ),
  remote: ({ value: { id } }) => <RemoteItem id={id} />,
  role: role => <span>{role.name}</span>,
  user: user => (
    <span>
      <Icon icon='user' /> {user.email}
    </span>
  ),
  resourceSet: ({ id }) => <ResourceSetItem id={id} />,
  sshKey: key => (
    <span>
      <Icon icon='ssh-key' /> {key.label}
    </span>
  ),
  ipPool: ipPool => (
    <span>
      <Icon icon='ip' /> {ipPool.name}
    </span>
  ),
  ipAddress: ({ label, used }) => {
    if (used) {
      return <strong className='text-warning'>{label}</strong>
    }
    return <span>{label}</span>
  },

  // XO objects.
  pool: ({ id }) => <PoolItem id={id} />,

  VDI: vdi => (
    <span>
      <Icon icon='disk' /> {vdi.name_label}{' '}
      {vdi.name_description && <span> ({vdi.name_description})</span>}
    </span>
  ),

  // Pool objects.
  'VM-template': ({ id }) => <PoolObjectItem id={id} />,
  host: ({ id }) => <PoolObjectItem id={id} />,
  network: ({ id }) => <PoolObjectItem id={id} />,

  // SR.
  SR: ({ id }) => <SrItem id={id} />,

  // VM.
  VM: ({ id }) => <VmItem id={id} />,
  'VM-snapshot': ({ id }) => <VmItem id={id} />,
  'VM-controller': ({ id }) => (
    <span>
      <Icon icon='host' /> <VmItem id={id} />
    </span>
  ),

  // PIF.
  PIF: pif => (
    <span>
      <Icon
        icon='network'
        color={pif.carrier ? 'text-success' : 'text-danger'}
      />{' '}
      {pif.device} ({pif.deviceName})
    </span>
  ),

  // Tags.
  tag: tag => (
    <span>
      <Icon icon='tag' /> {tag.value}
    </span>
  ),

  // GPUs

  vgpu: ({ id }) => <VgpuItem id={id} />,

  vgpuType: ({ id }) => <VgpuTypeItem id={id} />,

  gpuGroup: group => (
    <span>
      {startsWith(group.name_label, 'Group of ')
        ? group.name_label.slice(9)
        : group.name_label}
    </span>
  ),

  backup: backup => (
    <span>
      <span className='tag tag-info' style={{ textTransform: 'capitalize' }}>
        {backup.mode}
      </span>{' '}
      <span className='tag tag-warning'>{backup.remote.name}</span>{' '}
      <FormattedDate
        value={new Date(backup.timestamp)}
        month='long'
        day='numeric'
        year='numeric'
        hour='2-digit'
        minute='2-digit'
        second='2-digit'
      />
    </span>
  ),
}

const renderXoItem = (item, { className, type: xoType } = {}) => {
  const { id, label } = item
  const type = xoType || item.type

  if (item.removed) {
    return (
      <span key={id} className='text-danger'>
        {' '}
        <Icon icon='alarm' /> {id}
      </span>
    )
  }

  if (!type) {
    if (process.env.NODE_ENV !== 'production' && !label) {
      throw new Error(`an item must have at least either a type or a label`)
    }
    return (
      <span key={id} className={className}>
        {label}
      </span>
    )
  }

  const Component = xoItemToRender[type]

  if (process.env.NODE_ENV !== 'production' && !Component) {
    throw new Error(`no available component for type ${type}`)
  }

  if (Component) {
    return (
      <span key={id} className={className}>
        <Component {...item} />
      </span>
    )
  }
}

export { renderXoItem as default }

export const getRenderXoItemOfType = type => (item, options = {}) =>
  renderXoItem(item, { ...options, type })

const GenericXoItem = connectStore(() => {
  const getObject = createGetObject()

  return (state, props) => ({
    xoItem: getObject(state, props),
  })
})(
  ({ xoItem, ...props }) =>
    xoItem ? renderXoItem(xoItem, props) : renderXoUnknownItem()
)

export const renderXoItemFromId = (id, props) => (
  <GenericXoItem {...props} id={id} />
)

export const renderXoUnknownItem = () => (
  <span className='text-muted'>{_('errorNoSuchItem')}</span>
)
