import _ from 'intl'
import ActionButton from 'action-button'
import ActionRowButton from 'action-row-button'
import Component from 'base-component'
import forEach from 'lodash/forEach'
import HTML5Backend from 'react-dnd-html5-backend'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import IsoDevice from 'iso-device'
import map from 'lodash/map'
import React from 'react'
import TabButton from 'tab-button'
import { ButtonGroup } from 'react-bootstrap-4/lib'
import { Container, Row, Col } from 'grid'
import { DragDropContext, DragSource, DropTarget } from 'react-dnd'
import { Link } from 'react-router'
import { noop, propTypes } from 'utils'
import { SelectSr, SelectVdi } from 'select-objects'
import { SizeInput, Toggle } from 'form'
import { XoSelect, Size, Text } from 'editable'
import some from 'lodash/some'
import { createSelector } from 'selectors'

import {
  attachDiskToVm,
  createDisk,
  deleteVbd,
  deleteVdi,
  disconnectVbd,
  editVdi,
  isSrWritable,
  migrateVdi,
  setBootableVbd,
  setVmBootOrder
} from 'xo'

const parseBootOrder = bootOrder => {
  const bootOptions = {
    c: 'Hard-Drive',
    d: 'DVD-Drive',
    n: 'Network'
  }
  const order = []
  if (bootOrder) {
    for (const id of bootOrder) {
      if (id in bootOptions) {
        order.push({id, text: bootOptions[id], active: true})
        delete bootOptions[id]
      }
    }
  }
  forEach(bootOptions, (text, id) => { order.push({id, text, active: false}) })
  return order
}

@propTypes({
  onClose: propTypes.func,
  vm: propTypes.object.isRequired
})
class NewDisk extends Component {
  constructor (props) {
    super(props)
    this.state = {
      sr: undefined
    }
  }

  _createDisk = () => {
    const { vm, onClose = noop } = this.props
    const {name, size, bootable, readOnly} = this.refs
    const { sr } = this.state
    return createDisk(name.value, size.value, sr)
      .then(diskId => {
        const mode = readOnly.value ? 'RO' : 'RW'
        return attachDiskToVm(diskId, vm, {
          bootable: bootable.value,
          mode
        })
          .then(onClose)
      })
  }

  _selectSr = sr => this.setState({sr})

  // FIXME: duplicate code
  _getSrPredicate = createSelector(
    () => {
      const { vm } = this.props
      return vm && vm.$pool
    },
    poolId => sr => sr.$pool === poolId && isSrWritable(sr)
  )

  render () {
    return <form id='newDiskForm'>
      <div className='form-group'>
        <SelectSr predicate={this._getSrPredicate()} onChange={this._selectSr} required />
      </div>
      <fieldset className='form-inline'>
        <div className='form-group'>
          <input type='text' ref='name' placeholder='Disk Name' className='form-control' required />
        </div>
        {' '}
        <div className='form-group'>
          <SizeInput ref='size' placeholder='Size' required />
        </div>
        {' '}
        <div className='form-group'>
          Bootable <Toggle ref='bootable' /> Readonly <Toggle ref='readOnly' />
        </div>
        <span className='pull-right'>
          <ActionButton form='newDiskForm' icon='add' btnStyle='primary' handler={this._createDisk}>Create</ActionButton>
        </span>
      </fieldset>
    </form>
  }
}

@propTypes({
  onClose: propTypes.func,
  vbds: propTypes.array.isRequired,
  vm: propTypes.object.isRequired
})
class AttachDisk extends Component {
  _getVdiPredicate = createSelector(
    () => {
      const { vm } = this.props
      return vm && vm.$pool
    },
    poolId => vdi => vdi.$pool === poolId
  )

  // FIXME: duplicate code
  _getSrPredicate = createSelector(
    () => {
      const { vm } = this.props
      return vm && vm.$pool
    },
    poolId => sr => sr.$pool === poolId && isSrWritable(sr)
  )

  _selectVdi = vdi => this.setState({vdi})

  _addVdi = () => {
    const { vm, vbds, onClose = noop } = this.props
    const { vdi } = this.state
    const { bootable, readOnly } = this.refs
    const _isFreeForWriting = vdi => some(vdi.$VBDs, id => {
      const vbd = vbds[id]
      return !vbd || !vbd.attached || vbd.read_only
    })
    const mode = readOnly.value || !_isFreeForWriting(vdi) ? 'RO' : 'RW'
    return attachDiskToVm(vdi, vm, {
      bootable: bootable.value,
      mode
    })
      .then(onClose)
  }

  render () {
    const { vdi } = this.state
    return <form id='attachDiskForm'>
      <div className='form-group'>
        <SelectVdi
          predicate={this._getVdiPredicate()}
          srPredicate={this._getSrPredicate()}
          onChange={this._selectVdi}
        />
      </div>
      {vdi && <fieldset className='form-inline'>
        <div className='form-group'>
          Bootable <Toggle ref='bootable' /> Readonly <Toggle ref='readOnly' />
        </div>
        <span className='pull-right'>
          <ActionButton icon='add' form='attachDiskForm' btnStyle='primary' handler={this._addVdi}>Create</ActionButton>
        </span>
      </fieldset>
      }
    </form>
  }
}

const orderItemSource = {
  beginDrag: props => ({
    id: props.id,
    index: props.index
  })
}

const orderItemTarget = {
  hover: (props, monitor, component) => {
    const dragIndex = monitor.getItem().index
    const hoverIndex = props.index

    if (dragIndex === hoverIndex) {
      return
    }

    props.move(dragIndex, hoverIndex)
    monitor.getItem().index = hoverIndex
  }
}

@DropTarget('orderItem', orderItemTarget, connect => ({
  connectDropTarget: connect.dropTarget()
}))
@DragSource('orderItem', orderItemSource, (connect, monitor) => ({
  connectDragSource: connect.dragSource(),
  isDragging: monitor.isDragging()
}))
@propTypes({
  connectDragSource: propTypes.func.isRequired,
  connectDropTarget: propTypes.func.isRequired,
  index: propTypes.number.isRequired,
  isDragging: propTypes.bool.isRequired,
  id: propTypes.any.isRequired,
  item: propTypes.object.isRequired,
  move: propTypes.func.isRequired
})
class OrderItem extends Component {
  _toggle = checked => {
    const { item } = this.props
    item.active = checked
    this.forceUpdate()
  }

  render () {
    const { item, connectDragSource, connectDropTarget } = this.props
    return connectDragSource(connectDropTarget(
      <li className='list-group-item'>
        <Icon icon='grab' />
        {' '}
        <Icon icon='grab' />
        {' '}
        {item.text}
        <span className='pull-right'>
          <Toggle value={item.active} onChange={this._toggle} />
        </span>
      </li>
    ))
  }
}

@propTypes({
  onClose: propTypes.func,
  vm: propTypes.object.isRequired
})
@DragDropContext(HTML5Backend)
class BootOrder extends Component {
  constructor (props) {
    super(props)
    const { vm } = props
    const order = parseBootOrder(vm.boot && vm.boot.order)
    this.state = {order}
  }

  _moveOrderItem = (dragIndex, hoverIndex) => {
    const order = this.state.order.slice()
    const dragItem = order.splice(dragIndex, 1)
    if (dragItem.length) {
      order.splice(hoverIndex, 0, dragItem.pop())
      this.setState({order})
    }
  }

  _reset = () => {
    const { vm } = this.props
    const order = parseBootOrder(vm.boot && vm.boot.order)
    this.setState({order})
  }

  _save = () => {
    const { vm, onClose = noop } = this.props
    const { order: newOrder } = this.state
    let order = ''
    forEach(newOrder, item => { item.active && (order += item.id) })
    return setVmBootOrder(vm, order)
      .then(onClose)
  }

  render () {
    const { order } = this.state

    return <form>
      <ul>
        {map(order, (item, index) => <OrderItem
          key={index}
          index={index}
          id={item.id}
          item={item}
          move={this._moveOrderItem}
        />)}
      </ul>
      <fieldset className='form-inline'>
        <span className='pull-right'>
          <ActionButton icon='save' btnStyle='primary' handler={this._save}>Save</ActionButton>
          {' '}
          <ActionButton icon='reset' handler={this._reset}>Reset</ActionButton>
        </span>
      </fieldset>
    </form>
  }
}

export default class TabDisks extends Component {
  constructor (props) {
    super(props)
    this.state = {
      attachDisk: false,
      bootOrder: false,
      newDisk: false
    }
  }

  _toggleNewDisk = () => this.setState({
    newDisk: !this.state.newDisk,
    attachDisk: false,
    bootOrder: false
  })

  _toggleAttachDisk = () => this.setState({
    attachDisk: !this.state.attachDisk,
    bootOrder: false,
    newDisk: false
  })

  _toggleBootOrder = () => this.setState({
    bootOrder: !this.state.bootOrder,
    attachDisk: false,
    newDisk: false
  })

  render () {
    const {
      srs,
      vbds,
      vdis,
      vm
    } = this.props

    const {
      attachDisk,
      bootOrder,
      newDisk
    } = this.state

    return <Container>
      <Row>
        <Col className='text-xs-right'>
          <TabButton
            btnStyle={newDisk ? 'info' : 'primary'}
            handler={this._toggleNewDisk}
            icon='add'
            labelId='vbdCreateDeviceButton'
          />
          <TabButton
            btnStyle={attachDisk ? 'info' : 'primary'}
            handler={this._toggleAttachDisk}
            icon='disk'
            labelId='vdiAttachDeviceButton'
          />
          <TabButton
            btnStyle={bootOrder ? 'info' : 'primary'}
            handler={this._toggleBootOrder} // TODO: boot order
            icon='sort'
            labelId='vdiBootOrder'
          />
        </Col>
      </Row>
      <Row>
        <Col>
          {newDisk && <div><NewDisk vm={vm} onClose={this._toggleNewDisk} /><hr /></div>}
          {attachDisk && <div><AttachDisk vm={vm} vbds={vbds} onClose={this._toggleAttachDisk} /><hr /></div>}
          {bootOrder && <div><BootOrder vm={vm} onClose={this._toggleBootOrder} /><hr /></div>}
        </Col>
      </Row>
      <Row>
        <Col>
          {!isEmpty(vbds)
            ? <table className='table'>
              <thead className='thead-default'>
                <tr>
                  <th>{_('vdiNameLabel')}</th>
                  <th>{_('vdiNameDescription')}</th>
                  <th>{_('vdiSize')}</th>
                  <th>{_('vdiSr')}</th>
                  <th>{_('vdbBootableStatus')}</th>
                  <th>{_('vdbStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {map(vbds, vbd => {
                  const vdi = vdis[vbd.VDI]
                  if (vbd.is_cd_drive || !vdi) {
                    return
                  }

                  const sr = srs[vdi.$SR]

                  return <tr key={vbd.id}>
                    <td>
                      <Text value={vdi.name_label} onChange={value => editVdi(vdi, { name_label: value })} />
                    </td>
                    <td>
                      <Text value={vdi.name_description} onChange={value => editVdi(vdi, { name_description: value })} />
                    </td>
                    <td><Size value={vdi.size} onChange={size => editVdi(vdi, { size })} /></td>
                    <td> {sr &&
                      <XoSelect
                        onChange={sr => migrateVdi(vdi, sr)}
                        xoType='SR'
                        predicate={sr => sr.$pool === vm.$pool && isSrWritable(sr)}
                        labelProp='name_label'
                        value={sr}
                        useLongClick
                      >
                        <Link to={`/srs/${sr.id}`}>{sr.name_label}</Link>
                      </XoSelect>
                    }
                    </td>
                    <td>
                      <Toggle
                        value={vbd.bootable}
                        onChange={bootable => setBootableVbd(vbd, bootable)}
                      />
                    </td>
                    <td>
                      {vbd.attached
                        ? <span>
                          <span className='tag tag-success'>
                              {_('vbdStatusConnected')}
                          </span>
                          <ButtonGroup className='pull-xs-right'>
                            <ActionRowButton
                              btnStyle='default'
                              icon='disconnect'
                              handler={disconnectVbd}
                              handlerParam={vbd}
                            />
                          </ButtonGroup>
                        </span>
                        : <span>
                          <span className='tag tag-default'>
                              {_('vbdStatusDisconnected')}
                          </span>
                          <ButtonGroup className='pull-xs-right'>
                            <ActionRowButton
                              btnStyle='default'
                              icon='vdi-forget'
                              handler={deleteVbd}
                              handlerParam={vbd}
                            />
                            <ActionRowButton
                              btnStyle='default'
                              icon='vdi-remove'
                              handler={deleteVdi}
                              handlerParam={vdi}
                            />
                          </ButtonGroup>
                        </span>
                      }
                    </td>
                  </tr>
                })}
              </tbody>
            </table>
            : <h4 className='text-xs-center'>{_('vbdNoVbd')}</h4>
          }
        </Col>
      </Row>
      <Row>
        <Col mediumSize={5}>
          <IsoDevice vm={vm} />
        </Col>
      </Row>
    </Container>
  }
}
