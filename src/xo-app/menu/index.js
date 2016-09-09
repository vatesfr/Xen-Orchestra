import _ from 'intl'
import Component from 'base-component'
import classNames from 'classnames'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import Link from 'link'
import map from 'lodash/map'
import React from 'react'
import Tooltip from 'tooltip'
import { Button } from 'react-bootstrap-4/lib'
import { connectStore, noop, getXoaPlan } from 'utils'
import { UpdateTag } from '../xoa-updates'
import {
  connect,
  signOut,
  subscribePermissions,
  subscribeResourceSets
} from 'xo'
import {
  createFilter,
  createGetObjectsOfType,
  createSelector,
  getLang,
  getStatus,
  getUser
} from 'selectors'

import styles from './index.css'

@connectStore(() => ({
  // FIXME: remove when fixed in React.
  //
  // There are currently issues between context updates (used by
  // react-intl) and pure components.
  lang: getLang,
  nTasks: createGetObjectsOfType('task').count(
    [ task => task.status === 'pending' ]
  ),
  pools: createGetObjectsOfType('pool'),
  status: getStatus,
  user: getUser
}), {
  withRef: true
})
export default class Menu extends Component {
  componentWillMount () {
    const updateCollapsed = () => {
      this.setState({ collapsed: window.innerWidth < 1200 })
    }
    updateCollapsed()

    window.addEventListener('resize', updateCollapsed)
    this._removeListener = () => {
      window.removeEventListener('resize', updateCollapsed)
      this._removeListener = noop
    }

    this._unsubscribeResourceSets = subscribeResourceSets(resourceSets => {
      this.setState({
        resourceSets
      })
    })
    this._unsubscribePermissions = subscribePermissions(permissions => {
      this.setState({
        permissions
      })
    })
  }

  componentWillUnmount () {
    this._removeListener()
    this._unsubscribeResourceSets()
    this._unsubscribePermissions()
  }

  _getNoOperatablePools = createSelector(
    createFilter(
      () => this.props.pools,
      () => this.permissions,
      [ ({ id }, permissions) => {
        const { user } = this.props
        return user && user.permission === 'admin' || permissions && permissions[id] && permissions[id].operate
      } ]
    ),
    isEmpty
  )

  get height () {
    return this.refs.content.offsetHeight
  }

  _toggleCollapsed = () => {
    this._removeListener()
    this.setState({ collapsed: !this.state.collapsed })
  }

  render () {
    const { nTasks, status, user } = this.props
    const isAdmin = user && user.permission === 'admin'
    const noOperatablePools = this._getNoOperatablePools()
    const noResourceSets = isEmpty(this.state.resourceSets)

    /* eslint-disable object-property-newline */
    const items = [
      { to: '/home', icon: 'menu-home', label: 'homePage', subMenu: [
        { to: '/home?t=VM', icon: 'vm', label: 'homeVmPage' },
        { to: '/home?t=host', icon: 'host', label: 'homeHostPage' },
        { to: '/home?t=pool', icon: 'pool', label: 'homePoolPage' }
      ]},
      { to: '/dashboard/overview', icon: 'menu-dashboard', label: 'dashboardPage', subMenu: [
        { to: '/dashboard/overview', icon: 'menu-dashboard-overview', label: 'overviewDashboardPage' },
        { to: '/dashboard/visualizations', icon: 'menu-dashboard-visualization', label: 'overviewVisualizationDashboardPage' },
        { to: '/dashboard/stats', icon: 'menu-dashboard-stats', label: 'overviewStatsDashboardPage' },
        { to: '/dashboard/health', icon: 'menu-dashboard-health', label: 'overviewHealthDashboardPage' }
      ]},
      isAdmin && { to: '/self/dashboard', icon: 'menu-self-service', label: 'selfServicePage', subMenu: [
        { to: '/self/dashboard', icon: 'menu-self-service-dashboard', label: 'selfServiceDashboardPage' },
        { to: '/self/admin', icon: 'menu-self-service-admin', label: 'selfServiceAdminPage' }
      ]},
      { to: '/backup/overview', icon: 'menu-backup', label: 'backupPage', subMenu: [
        { to: '/backup/overview', icon: 'menu-backup-overview', label: 'backupOverviewPage' },
        { to: '/backup/new', icon: 'menu-backup-new', label: 'backupNewPage' },
        { to: '/backup/restore', icon: 'menu-backup-restore', label: 'backupRestorePage' }
      ]},
      isAdmin && { to: '/xoa-update', icon: 'menu-update', label: 'updatePage', extra: <UpdateTag /> },
      isAdmin && { to: '/settings/servers', icon: 'menu-settings', label: 'settingsPage', subMenu: [
        { to: '/settings/servers', icon: 'menu-settings-servers', label: 'settingsServersPage' },
        { to: '/settings/users', icon: 'menu-settings-users', label: 'settingsUsersPage' },
        { to: '/settings/groups', icon: 'menu-settings-groups', label: 'settingsGroupsPage' },
        { to: '/settings/acls', icon: 'menu-settings-acls', label: 'settingsAclsPage' },
        { to: '/settings/remotes', icon: 'menu-backup-remotes', label: 'backupRemotesPage' },
        { to: '/settings/plugins', icon: 'menu-settings-plugins', label: 'settingsPluginsPage' },
        { to: '/settings/logs', icon: 'menu-settings-logs', label: 'settingsLogsPage' },
        { to: '/settings/ips', icon: 'ip', label: 'settingsIpsPage' }
      ]},
      { to: '/jobs/overview', icon: 'menu-jobs', label: 'jobsPage', subMenu: [
        { to: '/jobs/overview', icon: 'menu-jobs-overview', label: 'jobsOverviewPage' },
        { to: '/jobs/new', icon: 'menu-jobs-new', label: 'jobsNewPage' },
        { to: '/jobs/scheduling', icon: 'menu-jobs-schedule', label: 'jobsSchedulingPage' }
      ]},
      { to: '/about', icon: 'menu-about', label: 'aboutPage' },
      { to: '/tasks', icon: 'task', label: 'taskMenu', pill: nTasks },
      !(noOperatablePools && noResourceSets) && { to: '/vms/new', icon: 'menu-new', label: 'newMenu', subMenu: [
        { to: '/vms/new', icon: 'menu-new-vm', label: 'newVmPage' },
        isAdmin && { to: '/new/sr', icon: 'menu-new-sr', label: 'newSrPage' },
        isAdmin && { to: '/settings/servers', icon: 'menu-settings-servers', label: 'newServerPage' },
        !noOperatablePools && { to: '/vms/import', icon: 'menu-new-import', label: 'newImport' }
      ]}
    ]
    /* eslint-enable object-property-newline */

    return <div className={classNames(
      'xo-menu',
      this.state.collapsed && styles.collapsed
    )}>
      <ul className='nav nav-sidebar nav-pills nav-stacked' ref='content'>
        <li>
          <span>
            <a className={styles.brand} href='#'>
              <span className={styles.hiddenUncollapsed}>XO</span>
              <span className={styles.hiddenCollapsed}>Xen Orchestra</span>
            </a>
          </span>
        </li>
        <li>
          <Button onClick={this._toggleCollapsed}>
            <Icon icon='menu-collapse' size='lg' fixedWidth />
          </Button>
        </li>
        {map(items, (item, index) =>
          item && <MenuLinkItem key={index} item={item} />
        )}
        <li>&nbsp;</li>
        <li>&nbsp;</li>
        <li className='nav-item xo-menu-item'>
          <Link className='nav-link' style={{display: 'flex'}} to={'/about'}>
            {+process.env.XOA_PLAN === 5
              ? <span>
                <span className={classNames(styles.hiddenCollapsed, 'text-warning')}>
                  <Icon icon='alarm' size='lg' fixedWidth /> No support
                </span>
                <span className={classNames(styles.hiddenUncollapsed, 'text-warning')}>
                  <Icon icon='alarm' size='lg' fixedWidth />
                </span>
              </span>
              : +process.env.XOA_PLAN === 1
                ? <span>
                  <span className={classNames(styles.hiddenCollapsed, 'text-warning')}>
                    <Icon icon='info' size='lg' fixedWidth /> Free upgrade!
                  </span>
                  <span className={classNames(styles.hiddenUncollapsed, 'text-warning')}>
                    <Icon icon='info' size='lg' fixedWidth />
                  </span>
                </span>
                : <span>
                  <span className={classNames(styles.hiddenCollapsed, 'text-success')}>
                    <Icon icon='info' size='lg' fixedWidth /> {getXoaPlan()}
                  </span>
                  <span className={classNames(styles.hiddenUncollapsed, 'text-success')}>
                    <Icon icon='info' size='lg' fixedWidth />
                  </span>
                </span>
            }
          </Link>
        </li>
        <li>&nbsp;</li>
        <li>&nbsp;</li>
        <li className='nav-item xo-menu-item'>
          <Button className='nav-link' onClick={signOut}>
            <Icon icon='sign-out' size='lg' fixedWidth />
            <span className={styles.hiddenCollapsed}>{' '}{_('signOut')}</span>
          </Button>
        </li>
        <li className='nav-item xo-menu-item'>
          <Link className='nav-link text-xs-center' to={'/user'}>
            <Tooltip content={user ? user.email : ''}>
              <Icon icon='user' size='lg' />
            </Tooltip>
          </Link>
        </li>
        <li>&nbsp;</li>
        <li>&nbsp;</li>
        {status === 'connecting'
          ? <li className='nav-item text-xs-center'>{_('statusConnecting')}</li>
          : status === 'disconnected' &&
            <li className='nav-item text-xs-center xo-menu-item'>
              <Button className='nav-link' onClick={connect}>
                <Icon icon='alarm' size='lg' fixedWidth /> {_('statusDisconnected')}
              </Button>
            </li>
        }
      </ul>
    </div>
  }
}

const MenuLinkItem = props => {
  const { item } = props
  const { to, icon, label, subMenu, pill, extra } = item

  return <li className='nav-item xo-menu-item'>
    <Link activeClassName='active' className={classNames('nav-link', styles.centerCollapsed)} to={to}>
      <Icon className={classNames((pill || extra) && styles.hiddenCollapsed)} icon={`${icon}`} size='lg' fixedWidth />
      <span className={styles.hiddenCollapsed}>{' '}{_(label)}&nbsp;</span>
      {pill > 0 && <span className='tag tag-pill tag-primary'>{pill}</span>}
      {extra}
    </Link>
    {subMenu && <SubMenu items={subMenu} />}
  </li>
}

const SubMenu = props => {
  return <ul className='nav nav-pills nav-stacked xo-sub-menu'>
    {map(props.items, (item, index) => (
      item && <li key={index} className='nav-item xo-menu-item'>
        <Link activeClassName='active' className='nav-link' to={item.to}>
          <Icon icon={`${item.icon}`} size='lg' fixedWidth />
          {' '}
          {_(item.label)}
        </Link>
      </li>
    ))}
  </ul>
}
