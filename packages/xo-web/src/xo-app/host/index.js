import _ from 'intl'
import Copiable from 'copiable'
import HostActionBar from './action-bar'
import Icon from 'icon'
import Link from 'link'
import { NavLink, NavTabs } from 'nav'
import Page from '../page'
import PropTypes from 'prop-types'
import React, { cloneElement, Component } from 'react'
import Tooltip from 'tooltip'
import { Text } from 'editable'
import { Container, Row, Col } from 'grid'
import { Pool } from 'render-xo-item'
import { editHost, fetchHostStats, subscribeHostMissingPatches } from 'xo'
import { connectStore, routes } from 'utils'
import {
  createDoesHostNeedRestart,
  createFilter,
  createGetObject,
  createGetObjectsOfType,
  createSelector,
} from 'selectors'
import { assign, isEmpty, isString, map, pick, sortBy, sum } from 'lodash'

import TabAdvanced from './tab-advanced'
import TabConsole from './tab-console'
import TabGeneral from './tab-general'
import TabLogs from './tab-logs'
import TabNetwork from './tab-network'
import TabPatches from './tab-patches'
import TabStats from './tab-stats'
import TabStorage from './tab-storage'

const isRunning = host => host && host.power_state === 'Running'

// ===================================================================

@routes('general', {
  advanced: TabAdvanced,
  console: TabConsole,
  general: TabGeneral,
  logs: TabLogs,
  network: TabNetwork,
  patches: TabPatches,
  stats: TabStats,
  storage: TabStorage,
})
@connectStore(() => {
  const getHost = createGetObject()

  const getPool = createGetObject((state, props) => getHost(state, props).$pool)

  const getVmController = createGetObjectsOfType('VM-controller').find(
    createSelector(
      getHost,
      ({ id }) => obj => obj.$container === id
    )
  )

  const getHostVms = createGetObjectsOfType('VM').filter(
    createSelector(
      getHost,
      ({ id }) => obj => obj.$container === id
    )
  )

  const getNumberOfVms = getHostVms.count()

  const getLogs = createGetObjectsOfType('message')
    .filter(
      createSelector(
        getHost,
        getVmController,
        (host, controller) => ({ $object }) =>
          $object === host.id || $object === controller.id
      )
    )
    .sort()

  const getPifs = createGetObjectsOfType('PIF')
    .pick(
      createSelector(
        getHost,
        host => host.$PIFs
      )
    )
    .sort()

  const getNetworks = createGetObjectsOfType('network').pick(
    createSelector(
      getPifs,
      pifs => map(pifs, pif => pif.$network)
    )
  )

  const getPrivateNetworks = createFilter(
    createGetObjectsOfType('network'),
    createSelector(
      getPool,
      pool => network => network.$pool === pool.id && isEmpty(network.PIFs)
    )
  )

  const getHostPatches = createSelector(
    createGetObjectsOfType('pool_patch'),
    createGetObjectsOfType('host_patch').pick(
      createSelector(
        getHost,
        host => (isString(host.patches[0]) ? host.patches : [])
      )
    ),
    (poolsPatches, hostsPatches) =>
      map(hostsPatches, hostPatch => ({
        ...hostPatch,
        poolPatch: poolsPatches[hostPatch.pool_patch],
      }))
  )

  const doesNeedRestart = createDoesHostNeedRestart(getHost)

  const getMemoryUsed = createSelector(
    getHostVms,
    vms => sum(map(vms, vm => vm.memory.size))
  )

  return (state, props) => {
    const host = getHost(state, props)
    if (!host) {
      return {}
    }

    return {
      host,
      hostPatches:
        host.productBrand !== 'XCP-ng' && getHostPatches(state, props),
      logs: getLogs(state, props),
      memoryUsed: getMemoryUsed(state, props),
      needsRestart: doesNeedRestart(state, props),
      networks: getNetworks(state, props),
      nVms: getNumberOfVms(state, props),
      pifs: getPifs(state, props),
      pool: getPool(state, props),
      privateNetworks: getPrivateNetworks(state, props),
      vmController: getVmController(state, props),
      vms: getHostVms(state, props),
    }
  }
})
export default class Host extends Component {
  static contextTypes = {
    router: PropTypes.object,
  }

  loop(host = this.props.host) {
    if (host == null) {
      return
    }

    if (this.cancel) {
      this.cancel()
    }

    if (!isRunning(host)) {
      return
    }

    let cancelled = false
    this.cancel = () => {
      cancelled = true
    }

    fetchHostStats(host).then(stats => {
      if (cancelled) {
        return
      }
      this.cancel = null

      clearTimeout(this.timeout)
      this.setState(
        {
          statsOverview: stats,
        },
        () => {
          this.timeout = setTimeout(this.loop, stats.interval * 1000)
        }
      )
    })
  }
  loop = ::this.loop

  componentDidMount() {
    this.loop()
    this._subscribePatches(this.props.host)
  }

  componentWillUnmount() {
    clearTimeout(this.timeout)
    this.unsubscribeHostMissingPatches()
  }

  componentWillReceiveProps(props) {
    const hostNext = props.host
    const hostCur = this.props.host

    if (hostCur && !hostNext) {
      return this.context.router.push('/')
    }

    if (!hostNext) {
      return
    }

    this._subscribePatches(hostNext)

    if (!isRunning(hostCur) && isRunning(hostNext)) {
      this.loop(hostNext)
    } else if (isRunning(hostCur) && !isRunning(hostNext)) {
      this.setState({
        statsOverview: undefined,
      })
    }
  }

  _subscribePatches(host) {
    if (host === undefined) {
      return
    }

    this.unsubscribeHostMissingPatches = subscribeHostMissingPatches(
      host,
      missingPatches =>
        this.setState({
          missingPatches:
            missingPatches && sortBy(missingPatches, patch => -patch.time),
        })
    )
  }

  _setNameDescription = nameDescription =>
    editHost(this.props.host, { name_description: nameDescription })
  _setNameLabel = nameLabel =>
    editHost(this.props.host, { name_label: nameLabel })

  header() {
    const { host, pool } = this.props
    const { missingPatches } = this.state || {}
    if (!host) {
      return <Icon icon='loading' />
    }
    return (
      <Container>
        <Row>
          <Col mediumSize={6} className='header-title'>
            {pool !== undefined && <Pool id={pool.id} link />}
            <h2>
              <Icon
                icon={
                  host.power_state === 'Running' && !host.enabled
                    ? 'host-disabled'
                    : `host-${host.power_state.toLowerCase()}`
                }
              />{' '}
              <Text value={host.name_label} onChange={this._setNameLabel} />
              {this.props.needsRestart && (
                <Tooltip content={_('rebootUpdateHostLabel')}>
                  <Link to={`/hosts/${host.id}/patches`}>
                    <Icon icon='alarm' />
                  </Link>
                </Tooltip>
              )}
            </h2>
            <Copiable tagName='pre' className='text-muted mb-0'>
              {host.uuid}
            </Copiable>
            <Text
              value={host.name_description}
              onChange={this._setNameDescription}
            />
          </Col>
          <Col mediumSize={6}>
            <div className='text-xs-center'>
              <HostActionBar host={host} />
            </div>
          </Col>
        </Row>
        <Row>
          <Col>
            <NavTabs>
              <NavLink to={`/hosts/${host.id}/general`}>
                {_('generalTabName')}
              </NavLink>
              <NavLink to={`/hosts/${host.id}/stats`}>
                {_('statsTabName')}
              </NavLink>
              <NavLink to={`/hosts/${host.id}/console`}>
                {_('consoleTabName')}
              </NavLink>
              <NavLink to={`/hosts/${host.id}/network`}>
                {_('networkTabName')}
              </NavLink>
              <NavLink to={`/hosts/${host.id}/storage`}>
                {_('storageTabName')}
              </NavLink>
              <NavLink to={`/hosts/${host.id}/patches`}>
                {_('patchesTabName')}{' '}
                {isEmpty(missingPatches) ? null : (
                  <span className='tag tag-pill tag-danger'>
                    {missingPatches.length}
                  </span>
                )}
              </NavLink>
              <NavLink to={`/hosts/${host.id}/logs`}>
                {_('logsTabName')}
              </NavLink>
              <NavLink to={`/hosts/${host.id}/advanced`}>
                {_('advancedTabName')}
              </NavLink>
            </NavTabs>
          </Col>
        </Row>
      </Container>
    )
  }

  render() {
    const { host, pool } = this.props
    if (!host) {
      return <h1>{_('statusLoading')}</h1>
    }
    const childProps = assign(
      pick(this.props, [
        'host',
        'hostPatches',
        'logs',
        'memoryUsed',
        'networks',
        'nVms',
        'pbds',
        'pifs',
        'privateNetworks',
        'srs',
        'vmController',
        'vms',
      ]),
      pick(this.state, ['missingPatches', 'statsOverview'])
    )
    return (
      <Page
        header={this.header()}
        title={`${host.name_label}${pool ? ` (${pool.name_label})` : ''}`}
      >
        {cloneElement(this.props.children, childProps)}
      </Page>
    )
  }
}
