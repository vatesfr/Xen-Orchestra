import React from 'react'
import { injectIntl } from 'react-intl'
import {
  includes,
  isEmpty,
  keys,
  map
} from 'lodash'

import _, { messages } from 'intl'
import ActionRowButton from 'action-row-button'
import ButtonGroup from 'button-group'
import Component from 'base-component'
import CenterPanel from 'center-panel'
import Icon from 'icon'
import Link from 'link'
import SingleLineRow from 'single-line-row'
import { SelectPool } from 'select-objects'
import {
  Card,
  CardBlock,
  CardHeader
} from 'card'
import {
  connectStore,
  resolveId,
  resolveIds
} from 'utils'
import {
  Col,
  Container,
  Row
} from 'grid'
import {
  createGetObject,
  createGetObjectsOfType,
  createSelector
} from 'selectors'
import {
  cancelTask,
  destroyTask
} from 'xo'

import Page from '../page'

const HEADER = <Container>
  <Row>
    <Col mediumSize={12}>
      <h2><Icon icon='task' /> {_('taskMenu')}</h2>
    </Col>
  </Row>
</Container>

const TASK_ITEM_STYLE = {
  // Remove all margin, otherwise it breaks vertical alignment.
  margin: 0
}

export const TaskItem = connectStore(() => ({
  host: createGetObject((_, props) => props.task.$host)
}))(({ task, host }) => <SingleLineRow className='mb-1'>
  <Col mediumSize={6}>
    {task.name_label} ({task.name_description && `${task.name_description} `}on {host
      ? <Link to={`/hosts/${host.id}`}>{host.name_label}</Link>
      : `unknown host − ${task.$host}`
    })
    {' ' + Math.round(task.progress * 100)}%
  </Col>
  <Col mediumSize={4}>
    <progress style={TASK_ITEM_STYLE} className='progress' value={task.progress * 100} max='100' />
  </Col>
  <Col mediumSize={2}>
    <ButtonGroup>
      <ActionRowButton
        handler={cancelTask}
        handlerParam={task}
        icon='task-cancel'
      />
      <ActionRowButton
        handler={destroyTask}
        handlerParam={task}
        icon='task-destroy'
      />
    </ButtonGroup>
  </Col>
</SingleLineRow>)

@connectStore(() => {
  const getTasks = createGetObjectsOfType('task')

  const getNPendingTasks = getTasks.count(
    [ task => task.status === 'pending' ]
  )

  const getPendingTasksByPool = getTasks.filter(
    [ task => task.status === 'pending' ]
  ).sort().groupBy('$pool')

  const getPools = createGetObjectsOfType('pool').pick(
    createSelector(
      getPendingTasksByPool,
      pendingTasksByPool => keys(pendingTasksByPool)
    )
  ).sort()

  return {
    nTasks: getNPendingTasks,
    pendingTasksByPool: getPendingTasksByPool,
    pools: getPools
  }
})
@injectIntl
export default class Tasks extends Component {
  _showPoolTasks = pool => isEmpty(this.state.pools) || includes(resolveIds(this.state.pools), resolveId(pool))

  render () {
    const { props, state } = this
    const {
      intl,
      nTasks,
      pendingTasksByPool
    } = props

    if (isEmpty(pendingTasksByPool)) {
      return <Page header={HEADER} title='taskPage' formatTitle>
        <CenterPanel>
          <Card>
            <CardHeader>{_('noTasks')}</CardHeader>
            <CardBlock>
              <Row>
                <Col>
                  <p className='text-muted'>{_('xsTasks')}</p>
                </Col>
              </Row>
            </CardBlock>
          </Card>
        </CenterPanel>
      </Page>
    }

    const { formatMessage } = intl
    return <Page header={HEADER} title={`(${nTasks}) ${formatMessage(messages.taskPage)}`}>
      <Container>
        <Row>
          <SelectPool
            multi
            value={state.pools}
            onChange={this.linkState('pools')}
          /> <br />
        </Row>
        {map(props.pools, pool => this._showPoolTasks(pool) && <Row>
          <Card>
            <CardHeader key={pool.id}><Link to={`/pools/${pool.id}`}>{pool.name_label}</Link></CardHeader>
            <CardBlock>
              {map(pendingTasksByPool[pool.id], task =>
                <TaskItem key={task.id} task={task} />
              )}
            </CardBlock>
          </Card>
        </Row>)}
      </Container>
    </Page>
  }
}
