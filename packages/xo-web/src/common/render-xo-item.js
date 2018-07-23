import _ from 'intl'
import PropTypes from 'prop-types'
import React, { Component } from 'react'
import { startsWith } from 'lodash'

import Icon from './icon'
import Link from './link'
import { FormattedDate } from 'react-intl'
import { get } from './xo-defined'
import { isSrWritable, subscribeRemotes } from './xo'
import { addSubscriptions, connectStore, formatSize } from './utils'
import {
  createGetObject,
  createSelector,
  getCheckPermissions,
} from './selectors'

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

@connectStore(() => {
  const getVdi = createGetObject()
  const getSr = createGetObject(createSelector(getVdi, vdi => vdi.$SR))
  const getContainer = createGetObject(
    createSelector(getSr, sr => sr.$container)
  )

  return {
    checkPermissions: getCheckPermissions,
    container: getContainer,
    sr: getSr,
    vdi: getVdi,
  }
})
export class VdiItem extends Component {
  _getCheckPermission = createSelector(
    () => this.props.checkPermissions,
    () => this.props.container,
    (check, container) =>
      check(container.id, ['view', 'operate', 'administrate'])
  )

  render () {
    const { props } = this
    const { container, sr, vdi } = props
    return (
      <XoItem item={vdi} {...props}>
        {() => (
          <span>
            <Icon icon='disk' /> {vdi.name_label}
            {sr !== undefined && (
              <span className='text-muted'> - {sr.name_label}</span>
            )}
            {this._getCheckPermission() && (
              <span className='text-muted'> ({container.name_label})</span>
            )}
          </span>
        )}
      </XoItem>
    )
  }
}

VdiItem.propTypes = XO_ITEM_PROP_TYPES

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

// Host, Network, VM-template.
export const PoolObjectItem = [
  connectStore(() => {
    const getObject = createGetObject()

    return {
      object: getObject,
      pool: createGetObject(createSelector(getObject, object => object.$pool)),
    }
  }),
  ({ object, pool, ...props }) => {
    const type = object.type
    const icon = OBJECT_TYPE_TO_ICON[type]
    const { id, name_label: nameLabel } = object
    return (
      <XoItem item={type} to={`${type}s/${get(() => id)}`} {...props}>
        {() => (
          <span>
            <Icon icon={icon} /> {`${nameLabel || id} `}
            {pool && `(${pool.name_label || pool.id})`}
          </span>
        )}
      </XoItem>
    )
  },
].reduceRight((value, decorator) => decorator(value))

PoolObjectItem.propTypes = XO_ITEM_PROP_TYPES

// ===================================================================

const VgpuItem = connectStore(() => ({
  vgpuType: createGetObject((_, props) => props.vgpu.vgpuType),
}))(({ vgpu, vgpuType }) => (
  <span>
    <Icon icon='vgpu' /> {vgpuType.modelName}
  </span>
))

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
  resourceSet: resourceSet => (
    <span>
      <strong>
        <Icon icon='resource-set' /> {resourceSet.name}
      </strong>{' '}
      ({resourceSet.id})
    </span>
  ),
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

  VDI: ({ id }) => <VdiItem id={id} />,

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

  vgpu: vgpu => <VgpuItem vgpu={vgpu} />,

  vgpuType: type => (
    <span>
      <Icon icon='gpu' /> {type.modelName} ({type.vendorName}){' '}
      {type.maxResolutionX}x{type.maxResolutionY}
    </span>
  ),

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
