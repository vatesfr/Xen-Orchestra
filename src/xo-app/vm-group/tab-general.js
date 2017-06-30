import _ from 'intl'
import forEach from 'lodash/forEach'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import reduce from 'lodash/reduce'
import React from 'react'
import size from 'lodash/size'
import { connectStore, formatSize } from 'utils'
import { Container, Row, Col } from 'grid'
import { getObject } from 'selectors'

export default connectStore(() => {
  const getMemoryTotal = (state, props) => {
    const vdiIds = new Set()
    forEach(props.vms, vm => forEach(vm.$VBDs, vbdId => vdiIds.add(getObject(state, vbdId).VDI)))
    return reduce(Array.from(vdiIds), (sum, vdiId) => {
      const vdi = getObject(state, vdiId)
      return vdi !== undefined
        ? sum + vdi.size
        : sum
    }, 0)
  }

  const getMemoryDynamicTotal = props => reduce(props.vms, (sum, vm) => vm.memory.dynamic[1] + sum, 0)

  const getNbCPU = props => reduce(props.vms, (sum, vm) => vm.CPUs.number + sum, 0)

  return (state, props) => ({
    memoryTotal: getMemoryTotal(state, props),
    memoryDynamical: getMemoryDynamicTotal(props),
    nbCPU: getNbCPU(props)
  })
})(({ vms, memoryTotal, memoryDynamical, nbCPU, vmGroup }) => {
  return (
    <Container>
      <br />
      <div>
        <Row className='text-xs-center'>
          <Col mediumSize={3}>
            <h2>{size(vms)}x <Icon icon='vm' size='lg' /></h2>
          </Col>
          <Col mediumSize={3}>
            <h2>{nbCPU}x <Icon icon='cpu' size='lg' /></h2>
          </Col>
          <Col mediumSize={3}>
            <h2 className='form-inline'>
              {formatSize(memoryDynamical)}
              &nbsp;<span><Icon icon='memory' size='lg' /></span>
            </h2>
          </Col>
          <Col mediumSize={3}>
            <h2>{formatSize(memoryTotal)} <Icon icon='disk' size='lg' /></h2>
          </Col>
        </Row>
        {isEmpty(vmGroup.current_operations)
          ? null
          : <Row className='text-xs-center'>
            <Col>
              <h4>{_('vmGroupCurrentStatus')}{' '}{map(vmGroup.current_operations)[0]}</h4>
            </Col>
          </Row>
        }
      </div>
    </Container>
  )
})
