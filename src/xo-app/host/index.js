import _ from 'messages'
import assign from 'lodash/assign'
import HostActionBar from './action-bar'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import { Link } from 'react-router'
import { NavLink, NavTabs } from 'nav'
import Page from '../page'
import pick from 'lodash/pick'
import React, { cloneElement, Component } from 'react'
import sortBy from 'lodash/sortBy'
import { Text } from 'editable'
import { editHost, fetchHostStats, getHostMissingPatches, installAllHostPatches, installHostPatch } from 'xo'
import { Container, Row, Col } from 'grid'
import {
  autobind,
  connectStore,
  routes
} from 'utils'
import {
  createGetObject,
  createGetObjectsOfType,
  createSelector
} from 'selectors'

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
  storage: TabStorage
})
@connectStore(() => {
  const getHost = createGetObject()

  const getPool = createGetObject(
    (state, props) => getHost(state, props).$pool
  )

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

  const getLogs = createGetObjectsOfType('message').filter(
    createSelector(
      getHost,
      getVmController,
      (host, controller) => ({ $object }) => $object === host.id || $object === controller.id
    )
  ).sort()

  const getPifs = createGetObjectsOfType('PIF').pick(
    createSelector(getHost, host => host.$PIFs)
  ).sort()

  const getNetworks = createGetObjectsOfType('network').pick(
    createSelector(
      getPifs,
      pifs => map(pifs, pif => pif.$network)
    )
  )

  const getPoolPatches = createGetObjectsOfType('pool_patch').pick(
    createSelector(
      createGetObjectsOfType(
        'host_patch',
        createSelector(getHost, host => host.patches)
      ),
      hostPatches => map(hostPatches, patch => patch.pool_patch)
    )
  ).sort()

  const getPbds = createGetObjectsOfType('PBD').pick(
    createSelector(getHost, host => host.$PBDs)
  )

  const getSrs = createGetObjectsOfType('SR').pick(
    createSelector(
      getPbds,
      pbds => map(pbds, pbd => pbd.SR)
    )
  )

  return (state, props) => {
    const host = getHost(state, props)
    if (!host) {
      return {}
    }

    return {
      host,
      logs: getLogs(state, props),
      networks: getNetworks(state, props),
      pbds: getPbds(state, props),
      pifs: getPifs(state, props),
      pool: getPool(state, props),
      poolPatches: getPoolPatches(state, props),
      srs: getSrs(state, props),
      vmController: getVmController(state, props),
      vms: getHostVms(state, props)
    }
  }
})
export default class Host extends Component {
  @autobind
  loop (host = this.props.host) {
    if (this.cancel) {
      this.cancel()
    }

    if (!isRunning(host)) {
      return
    }

    let cancelled = false
    this.cancel = () => { cancelled = true }

    fetchHostStats(host).then(stats => {
      if (cancelled) {
        return
      }
      this.cancel = null

      clearTimeout(this.timeout)
      this.setState({
        statsOverview: stats
      }, () => {
        this.timeout = setTimeout(this.loop, stats.interval * 1000)
      })
    })
  }

  _getMissingPatches (host) {
    getHostMissingPatches(host).then(missingPatches => {
      this.setState({ missingPatches: sortBy(missingPatches, (patch) => -patch.time) })
    })
  }

  componentWillMount () {
    if (!this.props.host) {
      return
    }
    this.loop()
    this._getMissingPatches(this.props.host)
  }

  componentWillUnmount () {
    clearTimeout(this.timeout)
  }

  componentWillReceiveProps (props) {
    const hostNext = props.host
    if (!hostNext) {
      return
    }

    const hostCur = this.props.host
    if (!hostCur) {
      this._getMissingPatches(hostNext)
    }

    if (!isRunning(hostCur) && isRunning(hostNext)) {
      this.loop(hostNext)
    } else if (isRunning(hostCur) && !isRunning(hostNext)) {
      this.setState({
        statsOverview: undefined
      })
    }
  }

  _installAllPatches = () => {
    const { host } = this.props
    return installAllHostPatches(host).then(() => {
      this._getMissingPatches(host)
    })
  }

  _installPatch = patch => {
    const { host } = this.props
    return installHostPatch(host, patch).then(() => {
      this._getMissingPatches(host)
    })
  }

  _setNameDescription = nameDescription => editHost(this.props.host, { name_description: nameDescription })
  _setNameLabel = nameLabel => editHost(this.props.host, { name_label: nameLabel })

  header () {
    const { host, pool } = this.props
    const { missingPatches } = this.state || {}
    if (!host) {
      return <Icon icon='loading' />
    }
    return <Container>
      <Row className='header-title'>
        <Col smallSize={6}>
          <h2>
            <Icon icon={`host-${host.power_state.toLowerCase()}`} />
            {' '}
            <Text
              onChange={this._setNameLabel}
            >{host.name_label}</Text>
          </h2>
          <span>
            <Text
              onChange={this._setNameDescription}
            >{host.name_description}</Text>
            <span className='text-muted'> - <Link to={`/pools/${pool.id}`}>{pool.name_label}</Link></span>
          </span>
        </Col>
        <Col smallSize={6}>
          <div className='pull-xs-right'>
            <HostActionBar host={host} />
          </div>
        </Col>
      </Row>
      <Row>
        <Col size={12}>
          <NavTabs>
            <NavLink to={`/hosts/${host.id}/general`}>{_('generalTabName')}</NavLink>
            <NavLink to={`/hosts/${host.id}/stats`}>{_('statsTabName')}</NavLink>
            <NavLink to={`/hosts/${host.id}/console`}>{_('consoleTabName')}</NavLink>
            <NavLink to={`/hosts/${host.id}/network`}>{_('networkTabName')}</NavLink>
            <NavLink to={`/hosts/${host.id}/storage`}>{_('storageTabName')}</NavLink>
            <NavLink to={`/hosts/${host.id}/patches`}>{_('patchesTabName')} {isEmpty(missingPatches) ? null : <span className='label label-pill label-danger'>{missingPatches.length}</span>}</NavLink>
            <NavLink to={`/hosts/${host.id}/logs`}>{_('logsTabName')}</NavLink>
            <NavLink to={`/hosts/${host.id}/advanced`}>{_('advancedTabName')}</NavLink>
          </NavTabs>
        </Col>
      </Row>
    </Container>
  }

  render () {
    const { host } = this.props
    if (!host) {
      return <h1>Loading…</h1>
    }
    const childProps = assign(pick(this.props, [
      'host',
      'logs',
      'networks',
      'pbds',
      'pifs',
      'poolPatches',
      'srs',
      'vmController',
      'vms'
    ]), pick(this.state, [
      'missingPatches',
      'statsOverview'
    ]), {
      installAllPatches: this._installAllPatches,
      installPatch: this._installPatch
    }
   )
    return <Page header={this.header()}>
      {cloneElement(this.props.children, childProps)}
    </Page>
  }
}
