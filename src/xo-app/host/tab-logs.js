import _ from 'messages'
import ActionRowButton from 'action-row-button'
import Component from 'base-component'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import TabButton from 'tab-button'
import React from 'react'
import { deleteMessage } from 'xo'
import { createPager } from 'selectors'
import { FormattedRelative, FormattedTime } from 'react-intl'
import { Row, Col } from 'grid'

export default class TabLogs extends Component {
  constructor () {
    super()

    this.getLogs = createPager(
      () => this.props.logs,
      () => this.state.page,
      10
    )

    this.state = {
      page: 1
    }
  }

  _clearLogs = () => map(this.getLogs(), log => deleteMessage(log))
  _nextPage = () => {
    this.setState({
      page: this.state.page + 1
    })
  }
  _previousPage = () => {
    this.setState({
      page: this.state.page - 1
    })
  }

  render () {
    const logs = this.getLogs()

    if (isEmpty(logs)) {
      return <Row>
        <Col smallSize={6} className='text-xs-center'>
          <br />
          <h4>{_('noLogs')}</h4>
        </Col>
      </Row>
    }

    return <div>
      <Row>
        <Col smallSize={12} className='text-xs-right'>
          <button className='btn btn-lg btn-tab' onClick={this._previousPage}>
            &lt;
          </button>
          <button className='btn btn-lg btn-tab' onClick={this._nextPage}>
            &gt;
          </button>
          <TabButton
            btnStyle='danger'
            handler={this._clearLogs}
            icon='delete'
            labelId='logRemoveAll'
          />
        </Col>
      </Row>
      <Row>
        <Col smallSize={12}>
          <table className='table'>
            <thead className='thead-default'>
              <tr>
                <th>{_('logDate')}</th>
                <th>{_('logName')}</th>
                <th>{_('logContent')}</th>
                <th>{_('logAction')}</th>
              </tr>
            </thead>
            <tbody>
              {map(logs, log =>
                <tr key={log.id}>
                  <td><FormattedTime value={log.time * 1000} minute='numeric' hour='numeric' day='numeric' month='long' year='numeric' /> (<FormattedRelative value={log.time * 1000} />)</td>
                  <td>{log.name}</td>
                  <td>{log.body}</td>
                  <td>
                    <ActionRowButton
                      btnStyle='danger'
                      handler={() => deleteMessage(log)}
                      icon='delete'
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Col>
      </Row>
    </div>
  }
}
