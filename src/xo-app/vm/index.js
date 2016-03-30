import _ from 'messages'
import CopyToClipboard from 'react-copy-to-clipboard'
import forEach from 'lodash/forEach'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import React, { Component } from 'react'
import reverse from 'lodash/reverse'
import sortBy from 'lodash/sortBy'
import Tags from 'tags'
import xo from 'xo'
import { createSelector } from 'reselect'
import { FormattedRelative, FormattedTime } from 'react-intl'
import { Row, Col } from 'grid'
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs'
import {
  connectStore,
  createCollectionSelector,
  Debug,
  formatSize,
  normalizeXenToolsStatus,
  osFamily
} from 'utils'
import {
  CpuSparkLines,
  MemorySparkLines,
  VifSparkLines,
  XvdSparkLines
} from 'xo-sparklines'

import VmActionBar from './action-bar'

// ===================================================================

@connectStore(() => {
  const getSnapshots = createSelector(
    createCollectionSelector(
      createSelector(
        (_, vm) => vm.snapshots,
        (objects) => objects,
        (snapshotIds, objects) => map(snapshotIds, (id) => objects[id])
      )
    ),
    (snapshots) => reverse(sortBy(snapshots, 'snapshot_time'))
  )
  const getVifs = createSelector(
    createCollectionSelector(
      createSelector(
        (_, vm) => vm.VIFs,
        (objects) => objects,
        (vifIds, objects) => map(vifIds, (id) => objects[id])
      )
    ),
    (vifs) => sortBy(vifs, 'device')
  )
  const getNetworkByVifs = createCollectionSelector(
    createSelector(
      (objects) => objects,
      (_, vifs) => vifs,
      (objects, vifs) => {
        const networkByVifs = {}
        forEach(vifs, (vif) => {
          networkByVifs[vif.id] = objects[vif.$network]
        })
        return networkByVifs
      }
    )
  )
  const getVbds = createSelector(
    createCollectionSelector(
      createSelector(
        (_, vm) => vm.$VBDs,
        (objects) => objects,
        (vbdIds, objects) => map(vbdIds, (id) => objects[id])
      )
    ),
    (vbds) => sortBy(vbds, 'position')
  )
  const getVdiByVbds = createCollectionSelector(
    createSelector(
      (objects) => objects,
      (_, vbds) => vbds,
      (objects, vbds) => {
        const vdiByVbds = {}
        forEach(vbds, (vbd) => {
          // TODO: Does that make sense to hide undefined VDIs?
          if (objects[vbd.VDI]) {
            vdiByVbds[vbd.id] = objects[vbd.VDI]
          }
        })
        return vdiByVbds
      }
    )
  )

  return (state, props) => {
    const { objects } = state
    const { id } = props.params

    const vm = objects[id]
    if (!vm) {
      return {}
    }

    const vbds = getVbds(objects, vm)
    const vifs = getVifs(objects, vm)

    return {
      container: objects[vm.$container],
      networkByVifs: getNetworkByVifs(objects, vifs),
      pool: objects[vm.$pool],
      snapshots: getSnapshots(objects, vm),
      vbds,
      vdiByVbds: getVdiByVbds(objects, vbds),
      vifs,
      vm
    }
  }
})
export default class Vm extends Component {
  componentWillMount () {
    const vmId = this.props.params.id
    const loop = () => {
      xo.call('vm.stats', { id: vmId }).then((newStats) => {
        this.setState({
          stats: newStats.stats
        })
      })

      this.timeout = setTimeout(loop, 5000)
    }

    loop()
  }

  componentWillUnmount () {
    clearTimeout(this.timeout)
  }

  render () {
    const {
      addTag,
      container,
      networkByVifs,
      pool,
      removeTag,
      snapshots,
      vbds,
      vdiByVbds,
      vifs,
      vm
    } = this.props

    const { stats } = this.state || {}

    if (!vm) {
      return <h1>Loading…</h1>
    }

    return <div>
      <Row>
        <Col size={6}>
          <h1>
            {vm.name_label}
            <small className='text-muted'> - {container.name_label} ({pool.name_label})</small>
          </h1>
          <p className='lead'>{vm.name_description}</p>
        </Col>
        <Col size={6}>
          <div className='pull-xs-right'>
            <VmActionBar vm={vm} handlers={this.props}/>
          </div>
        </Col>
      </Row>
      <Tabs>
        <TabList>
          <Tab>{_('generalTabName')}</Tab>
          <Tab>{_('statsTabName')}</Tab>
          <Tab>{_('consoleTabName')}</Tab>
          <Tab>{_('disksTabName', { disks: vm.$VBDs.length })}</Tab>
          <Tab>{_('networkTabName')}</Tab>
          <Tab>{_('snapshotsTabName')} <span className='label label-pill label-default'>{snapshots.length}</span></Tab>
          <Tab>{_('logsTabName')}</Tab>
          <Tab>{_('advancedTabName')}</Tab>
        </TabList>
        <TabPanel>
          { /* TODO: use CSS style */ }
          <br/>
          <Row className='text-xs-center'>
            <Col size={3}>
              <h2>{vm.CPUs.number}x <i className='xo-icon-cpu fa-lg'></i></h2>
              {stats && stats.cpus && <CpuSparkLines data={stats.cpus} />}
            </Col>
            <Col size={3}>
              <h2>{formatSize(vm.memory.size)} <i className='xo-icon-memory fa-lg'></i></h2>
              {stats && <MemorySparkLines data={stats} />}
            </Col>
            <Col size={3}>
              { /* TODO: compute total disk usage */ }
              <h2>{vm.$VBDs.length}x <i className='xo-icon-disk fa-lg'></i></h2>
              {stats && stats.xvds && <XvdSparkLines data={stats.xvds} />}
            </Col>
            <Col size={3}>
              <h2>{vm.VIFs.length}x <i className='xo-icon-network fa-lg'></i></h2>
              {stats && stats.vifs && <VifSparkLines data={stats.vifs} />}
            </Col>
          </Row>
          { /* TODO: use CSS style */ }
          <br/>
          {vm.xenTools
            ? <Row className='text-xs-center'>
              <Col size={3}>
                {vm.power_state === 'Running'
                  ? <div>
                    <p className='text-xs-center'>{_('started')} <FormattedRelative value={vm.startTime * 1000}/></p>
                  </div>
                  : null
                }
              </Col>
              <Col size={3}>
                <p>
                  {vm.virtualizationMode === 'pv'
                    ? _('paraVirtualizedMode')
                    : _('hardwareVirtualizedMode')
                  }
                </p>
              </Col>
              <Col size={3}>
                { /* TODO: tooltip and better icon usage */ }
                <h1><i className={'icon-' + osFamily(vm.os_version.distro)} /></h1>
              </Col>
              <Col size={3}>
                <p className='copy-to-clipboard'>
                  {vm.addresses['0/ip']
                    ? vm.addresses['0/ip']
                    : _('noIpv4Record')
                  }
                </p>
              </Col>
            </Row>
            : <Row className='text-xs-center'>
              <Col size={12}><em>{_('noToolsDetected')}.</em></Col>
            </Row>
          }
          { /* TODO: use CSS style */ }
          <br/>
          <Row>
            <Col size={12}>
              <h2 className='text-xs-center'>
                <Icon icon='tags' size='lg'/>
                <Tags labels={vm.tags} onDelete={(tag) => removeTag(vm.id, tag)} onAdd={(tag) => addTag(vm.id, tag)}/>
              </h2>
            </Col>
          </Row>
        </TabPanel>
        <TabPanel>
          <Debug value={this.state} />
        </TabPanel>
        <TabPanel className='text-xs-center'>
          <Row className='text-xs-center'>
            <Col size={3}>
              <p>
                <i className='xo-icon-cpu fa-3x'>&nbsp;</i>
                {stats && <CpuSparkLines data={stats.cpus} />}
              </p>
            </Col>
            <Col size={3}>
              <p>
                <i className='xo-icon-memory fa-3x'>&nbsp;</i>
                {stats && <MemorySparkLines data={stats} />}
              </p>
            </Col>
            <Col size={3}>
              <p>
                <i className='xo-icon-disk fa-3x'>&nbsp;</i>
                {stats && <XvdSparkLines data={stats.xvds} />}
              </p>
            </Col>
            <Col size={3}>
              <p>
                <i className='xo-icon-network fa-3x'>&nbsp;</i>
                {stats && <VifSparkLines data={stats.vifs} />}
              </p>
            </Col>
          </Row>
          <Row>
            <Col size={5}>
              { /* TODO: insert real ISO selector, CtrlAltSuppr button and Clipboard */ }
              <div className='input-group'>
                <select className='form-control'>
                  <option>-- CD Drive (empty) --</option>
                  <option>Debian-8.iso</option>
                  <option>Windows7.iso</option>
                </select>
                <span className='input-group-btn'>
                  <button className='btn btn-secondary'>
                    <i className='xo-icon-vm-eject'></i>
                  </button>
                </span>
              </div>
            </Col>
            <Col size={5}>
              <div className='input-group'>
                <input type='text' className='form-control'></input>
                <span className='input-group-btn'>
                  <button className='btn btn-secondary'>
                    <i className='xo-icon-clipboard'>&nbsp;</i>{_('copyToClipboardLabel')}
                  </button>
                </span>
              </div>
            </Col>
            <Col size={2}>
              <button className='btn btn-secondary'><i className='xo-icon-vm-keyboard'>&nbsp;</i>{_('ctrlAltDelButtonLabel')}</button>
            </Col>
          </Row>
          { /* TODO: use CSS style to replace BR tag */ }
          <br/>
          { /* TODO: insert real noVNC console*/ }
          <img src='http://placehold.it/640x480'></img>
          { /* TODO: use CSS style to replace BR tag */ }
          <br/>
          <p><em><i className='xo-icon-info'>&nbsp;</i>{_('tipLabel')} {_('tipConsoleLabel')}</em></p>
        </TabPanel>
        <TabPanel>
          <Row>
            <Col size={12}>
              <button className='btn btn-lg btn-primary btn-tab pull-xs-right'>
                {_('vbdCreateDeviceButton')}
              </button>
              <br/>
              {!isEmpty(vbds)
                ? <span>
                  <table className='table'>
                    <thead className='thead-default'>
                      <tr>
                        <th>{_('vdiNameLabel')}</th>
                        <th>{_('vdiNameDescription')}</th>
                        <th>{_('vdiTags')}</th>
                        <th>{_('vdiSize')}</th>
                        <th>{_('vdiSr')}</th>
                        <th>{_('vdbBootableStatus')}</th>
                        <th>{_('vdbStatus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {map(vbds, (vbd) =>
                        vbd.is_cd_drive
                        ? null
                        : <tr key={vbd.id}>
                          <td>{vdiByVbds[vbd.id].name_label}</td>
                          <td>{vdiByVbds[vbd.id].name_description}</td>
                          <td>{vdiByVbds[vbd.id].tags}</td>
                          <td>{formatSize(vdiByVbds[vbd.id].size)}</td>
                          <td>{vdiByVbds[vbd.id].$SR}</td>
                          <td>
                            {vbd.bootable
                              ? <span className='label label-success'>
                                  {_('vdbBootable')}
                              </span>
                              : <span className='label label-default'>
                                  {_('vdbNotBootable')}
                              </span>
                            }
                          </td>
                          <td>
                            {vbd.attached
                              ? <span className='label label-success'>
                                  {_('vbdStatusConnected')}
                              </span>
                              : <span className='label label-default'>
                                  {_('vbdStatusDisconnected')}
                              </span>
                            }
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </span>
                : <h4 className='text-xs-center'>{_('vbdNoVbd')}</h4>
              }
            </Col>
          </Row>
        </TabPanel>
        <TabPanel>
          <Row>
            <Col size={12}>
              <button className='btn btn-lg btn-primary btn-tab pull-xs-right'>{_('vifCreateDeviceButton')}</button>
              <br/>
              {!isEmpty(vifs)
                ? <span>
                  <table className='table'>
                    <thead className='thead-default'>
                      <tr>
                        <th>{_('vifDeviceLabel')}</th>
                        <th>{_('vifMacLabel')}</th>
                        <th>{_('vifMtuLabel')}</th>
                        <th>{_('vifNetworkLabel')}</th>
                        <th>{_('vifStatusLabel')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {map(vifs, (vif) =>
                        <tr key={vif.id}>
                          <td>VIF #{vif.device}</td>
                          <td><pre>{vif.MAC}</pre></td>
                          <td>{vif.MTU}</td>
                          <td>{networkByVifs[vif.id].name_label}</td>
                          <td>
                            {vif.attached
                              ? <span className='label label-success'>
                                  {_('vifStatusConnected')}
                              </span>
                              : <span className='label label-default'>
                                  {_('vifStatusDisconnected')}
                              </span>
                            }
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {vm.addresses && !isEmpty(vm.addresses)
                    ? <span>
                      <h4>{_('vifIpAddresses')}</h4>
                      {map(vm.addresses, (address) => <span key={address} className='label label-info label-ip'>{address}</span>)}
                    </span>
                    : _('noIpRecord')
                  }
                </span>
                : <h4 className='text-xs-center'>{_('vifNoInterface')}</h4>
              }
            </Col>
          </Row>
        </TabPanel>
        <TabPanel>
            {isEmpty(vm.snapshots)
              ? <Row>
                <Col size={6} className='text-xs-center'>
                  <br/>
                  <h4>{_('noSnapshot')}</h4>
                  <p><em><i className='xo-icon-info'>&nbsp;</i>{_('tipLabel')} {_('tipCreateSnapshotLabel')}</em></p>
                </Col>
                <Col size={6} className='text-xs-center'>
                  <p><button type='button' className='btn btn-lg btn-secondary btn-huge'><i className='xo-icon-snapshot'></i></button></p>
                </Col>
              </Row>
              : [<Row>
                <Col size={12}>
                  <button className='btn btn-lg btn-primary btn-tab pull-xs-right'>{_('snapshotCreateButton')}</button>
                  <br/>
                  <table className='table'>
                    <thead className='thead-default'>
                      <tr>
                        <th>{_('snapshotDate')}</th>
                        <th>{_('snapshotName')}</th>
                        <th>{_('snapshotAction')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {map(snapshots, (snapshot) =>
                        <tr key={snapshot.id}>
                          <td><FormattedTime value={snapshot.snapshot_time * 1000} minute='numeric' hour='numeric' day='numeric' month='long' year='numeric'/> (<FormattedRelative value={snapshot.snapshot_time * 1000}/>)</td>
                          <td>{snapshot.name_label}</td>
                          <td><i className='xo-icon-export xo-icon-action-row'></i> <i className='xo-icon-snapshot-revert xo-icon-action-row'></i> <i className='xo-icon-snapshot-delete xo-icon-action-row'></i></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Col>
              </Row>]
            }
        </TabPanel>
        <TabPanel>
          <Row>
            <Col size={12}>
              <button className='btn btn-lg btn-danger btn-tab pull-xs-right'>{_('logRemoveAll')}</button>
            </Col>
          </Row>
        </TabPanel>
        <TabPanel>
          <Row>
            <Col size={12}>
              <dl className='dl-horizontal'>
                <dt className='col-md-3'>{_('uuid')}</dt>
                <dd className='col-md-9 copy-to-clipboard'>
                  {vm.uuid}&nbsp;
                  <CopyToClipboard text={vm.uuid}>
                    <button className='btn btn-sm btn-secondary btn-copy-to-clipboard'>
                      <i className='xo-icon-clipboard'></i>
                    </button>
                  </CopyToClipboard>
                </dd>

                <dt className='col-md-3'>{_('virtualizationMode')}</dt>
                <dd className='col-md-9'>
                  {vm.virtualizationMode === 'pv'
                    ? _('paraVirtualizedMode')
                    : _('hardwareVirtualizedMode')
                  }
                </dd>

                <dt className='col-md-3'>{_('cpuWeightLabel')}</dt>
                {vm.cpuWeight
                  ? <dd className='col-md-9'>{vm.cpuWeight}</dd>
                  : <dd className='col-md-9'>{_('defaultCpuWeight')}</dd>
                }

                {vm.PV_args
                  ? [
                    <dt className='col-md-3' key={0}>{_('pvArgsLabel')}</dt>,
                    <dd className='col-md-9' key={1}>{vm.PV_args}</dd>
                  ]
                  : null
                }

                <dt className='col-md-3'>{_('xenToolsStatus')}</dt>
                <dd className='col-md-9'>{_('xenToolsStatusValue', { status: normalizeXenToolsStatus(vm.xenTools) })}</dd>

                <dt className='col-md-3'>{_('osName')}</dt>
                <dd className='col-md-9'>{vm.os_version ? vm.os_version.name : _('unknownOsName')}</dd>

                <dt className='col-md-3'>{_('osKernel')}</dt>
                <dd className='col-md-9'>{vm.os_version ? vm.os_version.uname : _('unknownOsKernel')}</dd>

                <dt className='col-md-3'>{_('autoPowerOn')}</dt>
                <dd className='col-md-9'>{vm.auto_poweron ? _('enabledAutoPowerOn') : _('disabledAutoPowerOn')}</dd>

                <dt className='col-md-3'>{_('ha')}</dt>
                <dd className='col-md-9'>{vm.high_availability ? _('enabledHa') : _('disabledHa')}</dd>

                <dt className='col-md-3'>{_('originalTemplate')}</dt>
                <dd className='col-md-9'>{vm.other.base_template_name ? vm.other.base_template_name : _('unknownOriginalTemplate')}</dd>
              </dl>
            </Col>
          </Row>
        </TabPanel>
      </Tabs>
    </div>
  }
}
