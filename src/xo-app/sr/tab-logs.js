import _ from 'messages'
import ActionRow from 'action-row-button'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import TabButton from 'tab-button'
import React, { Component } from 'react'
import { deleteMessage } from 'xo'
import { createPager } from 'selectors'
import { FormattedRelative, FormattedTime } from 'react-intl'
import { Container, Row, Col } from 'grid'

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

  _deleteAllLogs = () => map(this.props.logs, deleteMessage)
  _nextPage = () => this.setState({ page: this.state.page + 1 })
  _previousPage = () => this.setState({ page: this.state.page - 1 })

  render () {
    const logs = this.getLogs()

    return <Container>
      {isEmpty(logs)
        ? <Row>
          <Col mediumSize={6} className='text-xs-center'>
            <br />
            <h4>{_('noLogs')}</h4>
          </Col>
        </Row>
        : <div>
          <Row>
            <Col mediumSize={12} className='text-xs-right'>
              <button className='btn btn-lg btn-tab' onClick={this._previousPage}>
                &lt;
              </button>
              <button className='btn btn-lg btn-tab' onClick={this._nextPage}>
                &gt;
              </button>
              <TabButton
                btnStyle='danger'
                handler={this._deleteAllLogs}
                icon='delete'
                labelId='logRemoveAll'
              />
            </Col>
          </Row>
          <Row>
            <Col mediumSize={12}>
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
                        <ActionRow
                          btnStyle='danger'
                          handler={deleteMessage}
                          handlerParam={log}
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
    </Container>
  }
}
