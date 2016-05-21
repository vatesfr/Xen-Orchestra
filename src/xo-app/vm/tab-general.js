import _ from 'messages'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import React from 'react'
import Tags from 'tags'
import { addTag, removeTag } from 'xo'
import { FormattedRelative } from 'react-intl'
import { Row, Col } from 'grid'
import {
  BlockLink,
  formatSize,
  osFamily
} from 'utils'
import {
  CpuSparkLines,
  MemorySparkLines,
  VifSparkLines,
  XvdSparkLines
} from 'xo-sparklines'

export default ({
  statsOverview,
  vm,
  vmTotalDiskSpace
}) => <div>
  {/* TODO: use CSS style */}
  <br />
  <Row className='text-xs-center'>
    <Col mediumSize={3}>
      <h2>{vm.CPUs.number}x <Icon icon='cpu' size='lg' /></h2>
      <BlockLink to={`/vms/${vm.id}/stats`}>{statsOverview && <CpuSparkLines data={statsOverview} />}</BlockLink>
    </Col>
    <Col mediumSize={3}>
      <h2>{formatSize(vm.memory.size)} <Icon icon='memory' size='lg' /></h2>
      <BlockLink to={`/vms/${vm.id}/stats`}>{statsOverview && <MemorySparkLines data={statsOverview} />}</BlockLink>
    </Col>
    <Col mediumSize={3}>
      <BlockLink to={`/vms/${vm.id}/network`}><h2>{vm.VIFs.length}x <Icon icon='network' size='lg' /></h2></BlockLink>
      <BlockLink to={`/vms/${vm.id}/stats`}>{statsOverview && <VifSparkLines data={statsOverview} />}</BlockLink>
    </Col>
    <Col mediumSize={3}>
      <BlockLink to={`/vms/${vm.id}/disks`}><h2>{formatSize(vmTotalDiskSpace)} <Icon icon='disk' size='lg' /></h2></BlockLink>
      <BlockLink to={`/vms/${vm.id}/stats`}>{statsOverview && <XvdSparkLines data={statsOverview} />}</BlockLink>
    </Col>
  </Row>
  {/* TODO: use CSS style */}
  <br />
  <Row className='text-xs-center'>
    <Col smallSize={3}>
      {vm.power_state === 'Running'
        ? <div>
          <p className='text-xs-center'>{_('started', { ago: <FormattedRelative value={vm.startTime * 1000} /> })}</p>
        </div>
        : <p className='text-xs-center'>{_('vmNotRunning')}</p>
      }
    </Col>
    <Col smallSize={3}>
      <p>
        {vm.virtualizationMode === 'pv'
          ? _('paraVirtualizedMode')
          : _('hardwareVirtualizedMode')
        }
      </p>
    </Col>
    <Col smallSize={3}>
      <BlockLink to={`/vms/${vm.id}/network`}>
        <p className='copy-to-clipboard'>
          {vm.addresses['0/ip']
            ? vm.addresses['0/ip']
            : _('noIpv4Record')
          }
        </p>
      </BlockLink>
    </Col>
    <Col smallSize={3}>
      {/* TODO: tooltip and better icon usage */}
      <BlockLink to={`/vms/${vm.id}/advanced`}><h1><Icon icon={vm.os_version && vm.os_version.distro && osFamily(vm.os_version.distro)} /></h1></BlockLink>
    </Col>
  </Row>
  {!vm.xenTools && vm.power_state === 'Running' &&
    <Row className='text-xs-center'>
      <Col smallSize={12}><em>{_('noToolsDetected')}.</em></Col>
    </Row>
  }
  {/* TODO: use CSS style */}
  <br />
  <Row>
    <Col smallSize={12}>
      <h2 className='text-xs-center'>
        <Tags labels={vm.tags} onDelete={tag => removeTag(vm.id, tag)} onAdd={tag => addTag(vm.id, tag)} />
      </h2>
    </Col>
  </Row>
  {isEmpty(vm.current_operations)
    ? null
    : <Row className='text-xs-center'>
      <Col smallSize={12}>
        <h4>{_('vmCurrentStatus')}{' '}{map(vm.current_operations)[0]}</h4>
      </Col>
    </Row>
  }
</div>
