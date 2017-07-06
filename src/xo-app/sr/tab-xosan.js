import _ from 'intl'
import Component from 'base-component'
import Link from 'link'
import React from 'react'
import ActionButton from 'action-button'
import { Container, Row, Col } from 'grid'
import { SelectSr } from 'select-objects'
import Tooltip from 'tooltip'
import {
  map
} from 'lodash'
import {
  createGetObjectsOfType,
  createSelector
} from 'selectors'
import {
  formatSize,
  connectStore
} from 'utils'
import {
  getVolumeInfo,
  replaceXosanBrick
} from 'xo'

@connectStore(() => ({
  vms: createGetObjectsOfType('VM'),
  srs: createGetObjectsOfType('SR')
}))
export default class TabXosan extends Component {
  async componentDidMount () {
    await this._refreshInfo()
  }

  async _refreshAspect (infoType, statusVariable) {
    const val = {}
    val[statusVariable] = null
    this.setState(val)
    val[statusVariable] = await getVolumeInfo(this.props.sr.id, infoType)
    this.setState(val)
  }

  async _refreshInfo () {
    this.setState({xosanConfig: JSON.parse(this.props.sr.other_config['xo:xosan_config'])})
    await Promise.all([::this._refreshAspect('heal', 'volumeHeal'), ::this._refreshAspect('status', 'volumeStatus'),
      ::this._refreshAspect('info', 'volumeInfo'), ::this._refreshAspect('statusDetail', 'volumeStatusDetail')])
  }

  async _replaceBrick ({brick, newSr}) {
    await replaceXosanBrick(this.props.sr.id, brick, newSr.id)
    const newState = {}
    this.state.xosanConfig.nodes.forEach((node, i) => {
      newState[`sr-${i}`] = null
    })
    this.setState(newState)
    await this._refreshInfo()
  }

  _getSrPredicate = createSelector(
    (underlyingSr) => this.props.sr.$pool,
    (underlyingSr) => underlyingSr,
    (poolId, underlyingSr) => sr => sr.SR_type === 'lvm' && sr.$pool === poolId && underlyingSr !== sr.id
  )

  render () {
    const {volumeHeal, volumeInfo, volumeStatus, xosanConfig, volumeStatusDetail} = this.state
    const { vms, srs } = this.props
    if (!xosanConfig) {
      return <Container />
    }
    const brickByName = {}
    xosanConfig['nodes'].forEach(node => {
      brickByName[node.brickName] = {config: node, uuid: '-'}
    })
    const brickByUuid = {}
    const strippedVolumeInfo = volumeInfo && volumeInfo['commandStatus'] ? volumeInfo['result'] : null
    if (strippedVolumeInfo) {
      strippedVolumeInfo['bricks'].forEach(brick => {
        brickByName[brick.name] = brickByName[brick.name] || {}
        brickByName[brick.name]['info'] = brick
        brickByName[brick.name]['uuid'] = brick.hostUuid
        brickByUuid[brick.hostUuid] = brickByUuid[brick.hostUuid] || brickByName[brick.name]
      })
    }
    if (volumeHeal && volumeHeal['commandStatus']) {
      volumeHeal['result']['bricks'].forEach(brick => {
        brickByName[brick.name] = brickByName[brick.name] || {}
        brickByName[brick.name]['heal'] = brick
        brickByName[brick.name]['uuid'] = brick.hostUuid
        brickByUuid[brick.hostUuid] = brickByUuid[brick.hostUuid] || brickByName[brick.name]
      })
    }
    if (volumeStatus && volumeStatus['commandStatus']) {
      for (let key in brickByUuid) {
        brickByUuid[key]['status'] = volumeStatus.result.nodes[key]
      }
    }
    if (volumeStatusDetail && volumeStatusDetail['commandStatus']) {
      for (let key in brickByUuid) {
        if (key in volumeStatusDetail.result.nodes) {
          brickByUuid[key]['statusDetail'] = volumeStatusDetail.result.nodes[key][0]
        }
      }
    }
    const orderedBrickList = map(Object.keys(brickByName), name => brickByName[name])
    return <Container>
      {map(orderedBrickList, (node, i) =>
        <div key={node.config.brickName}>
          <h3>Brick {node.config.brickName}</h3>
          <div style={{ marginLeft: '15px' }}>
            <Row><Col size={2}>Virtual Machine: </Col><Col size={4}><Link
              to={`/vms/${node.config.vm.id}`}>{vms[node.config.vm.id].name_label}</Link></Col></Row>
            <Row><Col size={2}>Underlying Storage: </Col><Col size={4}><Link
              to={`/srs/${node.config.underlyingSr}`}>{srs[node.config.underlyingSr].name_label}</Link></Col></Row>
            <Row><Col size={2}>Move Brick: </Col>
              <Col size={3}><SelectSr predicate={this._getSrPredicate(node.config.underlyingSr)}
                onChange={this.linkState(`sr-${i}`)} value={this.state[`sr-${i}`]} /></Col>
              <Col size={3}>
                <ActionButton
                  btnStyle='success'
                  icon='refresh'
                  handler={::this._replaceBrick}
                  handlerParam={{ brick: node.config.brickName, newSr: this.state[`sr-${i}`] }}
                >Replace</ActionButton>
              </Col></Row>
            <Row><Col size={2} title='gluster UUID'>Brick UUID: </Col><Col size={4}>{node.uuid}</Col></Row>
            <Row>
              <Col size={2}>Status: </Col><Col size={4}>{node['heal'] ? node['heal'].status : 'unknown'}</Col>
            </Row>
            <Row><Col size={2}>Arbiter: </Col><Col size={4}>{node.config.arbiter ? 'True' : 'False' }</Col></Row>
            {node['statusDetail'] && <div>
              <Row><Col size={2}>Used Space: </Col><Col size={4}>
                <Tooltip content={_('spaceLeftTooltip', {
                  used: String(Math.round(100 - (parseInt(node['statusDetail']['sizeFree']) / parseInt(node['statusDetail']['sizeTotal'])) * 100)),
                  free: formatSize(parseInt(node['statusDetail']['sizeFree']))
                })}>
                  <progress className='progress' max='100'
                    value={100 - (parseInt(node['statusDetail']['sizeFree']) / parseInt(node['statusDetail']['sizeTotal'])) * 100}
                  />
                </Tooltip></Col></Row>
              <Row><Col size={2}>Used Inodes: </Col><Col size={4}>
                <Tooltip content={_('spaceLeftTooltip', {
                  used: String(Math.round(100 - (parseInt(node['statusDetail']['inodesFree']) / parseInt(node['statusDetail']['inodesTotal'])) * 100)),
                  free: String(parseInt(node['statusDetail']['inodesFree']))
                })}>
                  <progress className='progress' max='100' value={100 - (parseInt(node['statusDetail']['inodesFree']) / parseInt(node['statusDetail']['inodesTotal'])) * 100}
                  /></Tooltip></Col></Row>
              <Row><Col size={2}>blockSize: </Col><Col size={4}>{ node['statusDetail']['blockSize']}</Col></Row>
              <Row><Col size={2}>device: </Col><Col size={4}>{ node['statusDetail']['device']}</Col></Row>
              <Row><Col size={2}>fsName: </Col><Col size={4}>{ node['statusDetail']['fsName']}</Col></Row>
              <Row><Col size={2}>mntOptions: </Col><Col size={4}>{ node['statusDetail']['mntOptions']}</Col></Row>
              <Row><Col size={2}>path: </Col><Col size={4}>{ node['statusDetail']['path']}</Col></Row>
            </div>}

            {node['status'] && node['status'].length !== 0 && <table style={{border: 'solid black 1px'}}>
              <thead>
                <tr style={{border: 'solid black 1px'}}>
                  <th style={{border: 'solid black 1px'}}>Job</th>
                  <th style={{border: 'solid black 1px'}}>Path</th>
                  <th style={{border: 'solid black 1px'}}>Status</th>
                  <th style={{border: 'solid black 1px'}}>PID</th>
                  <th style={{border: 'solid black 1px'}}>Port</th>
                </tr>
              </thead>
              <tbody>
                {map(node['status'], (job, j) => <tr key={`${node.uuid}-${job.pid}`} style={{border: 'solid black 1px'}}>
                  <td style={{border: 'solid black 1px'}}>{job.hostname}</td>
                  <td style={{border: 'solid black 1px'}}>{job.path}</td>
                  <td style={{border: 'solid black 1px'}}>{job.status}</td>
                  <td style={{border: 'solid black 1px'}}>{job.pid}</td>
                  <td style={{border: 'solid black 1px'}}>{job.port}</td>
                </tr>)}
              </tbody>
            </table>}
            {node['heal'] && node['heal']['file'] && node['heal']['file'].length !== 0 && <div>
              <h4>Files needing healing</h4>
              {map(node['heal']['file'], file =>
                <Row key={file['gfid']}><Col size={5}>{file['_']}</Col ><Col size={4}>{file['gfid']}</Col></Row>)}
            </div>}
          </div>
        </div>
      )}
      <h2>Volume</h2>
      {strippedVolumeInfo && <div>
        <Row key='name'>
          <Col size={3}><strong>Name</strong></Col>
          <Col size={4}>{strippedVolumeInfo['name']}</Col>
        </Row>
        <Row key='statusStr'>
          <Col size={3}><strong>Status</strong></Col>
          <Col size={4}>{strippedVolumeInfo['statusStr']}</Col>
        </Row>
        <Row key='typeStr'>
          <Col size={3}><strong>Type</strong></Col>
          <Col size={4}>{strippedVolumeInfo['typeStr']}</Col>
        </Row>
        <Row key='brickCount'>
          <Col size={3}><strong>Brick Count</strong></Col>
          <Col size={4}>{strippedVolumeInfo['brickCount']}</Col>
        </Row>
        <Row key='stripeCount'>
          <Col size={3}><strong>Stripe Count</strong></Col>
          <Col size={4}>{strippedVolumeInfo['stripeCount']}</Col>
        </Row>
        <Row key='replicaCount'>
          <Col size={3}><strong>Replica Count</strong></Col>
          <Col size={4}>{strippedVolumeInfo['replicaCount']}</Col>
        </Row>
        <Row key='arbiterCount'>
          <Col size={3}><strong>Arbiter Count</strong></Col>
          <Col size={4}>{strippedVolumeInfo['arbiterCount']}</Col>
        </Row>
        <Row key='disperseCount'>
          <Col size={3}><strong>Disperse Count</strong></Col>
          <Col size={4}>{strippedVolumeInfo['disperseCount']}</Col>
        </Row>
        <Row key='redundancyCount'>
          <Col size={3}><strong>Redundancy Count</strong></Col>
          <Col size={4}>{strippedVolumeInfo['redundancyCount']}</Col>
        </Row>
        <h3>Volume Options</h3>
        {map(strippedVolumeInfo.options, option =>
          <Row key={option.name}>
            <Col size={3}><strong>{option.name}</strong></Col>
            <Col size={4}>{option.value}</Col>
          </Row>
        )}
      </div>}
    </Container>
  }
}
