import _ from 'intl'
import Component from 'base-component'
import Ellipsis, { EllipsisContainer } from 'ellipsis'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import Link, { BlockLink } from 'link'
import map from 'lodash/map'
import React from 'react'
import SingleLineRow from 'single-line-row'
import Tags from 'tags'
import Tooltip from 'tooltip'
import { Row, Col } from 'grid'
import { Text } from 'editable'
import {
  addTag,
  editHost,
  removeTag,
  startHost,
  stopHost
} from 'xo'
import {
  connectStore,
  formatSize,
  osFamily
} from 'utils'
import {
  createGetObject
} from 'selectors'

import styles from './index.css'

@connectStore({
  container: createGetObject((_, props) => props.item.$pool)
})
export default class HostItem extends Component {
  get _isRunning () {
    const host = this.props.item
    return host && host.power_state === 'Running'
  }

  _addTag = tag => addTag(this.props.item.id, tag)
  _removeTag = tag => removeTag(this.props.item.id, tag)
  _setNameDescription = nameDescription => editHost(this.props.item, { name_description: nameDescription })
  _setNameLabel = nameLabel => editHost(this.props.item, { name_label: nameLabel })
  _start = () => startHost(this.props.item)
  _stop = () => stopHost(this.props.item)
  _toggleExpanded = () => this.setState({ expanded: !this.state.expanded })
  _onSelect = () => this.props.onSelect(this.props.item.id)

  render () {
    const { item: host, container, expandAll, selected } = this.props
    return <div className={styles.item}>
      <BlockLink to={`/hosts/${host.id}`}>
        <SingleLineRow>
          <Col smallSize={10} mediumSize={9} largeSize={3}>
            <EllipsisContainer>
              <input type='checkbox' checked={selected} onChange={this._onSelect} value={host.id} />
              &nbsp;&nbsp;
              <Tooltip
                content={isEmpty(host.current_operations)
                  ? _(`powerState${host.power_state}`)
                  : <div>{_(`powerState${host.power_state}`)}{' ('}{map(host.current_operations)[0]}{')'}</div>
                }
              >
                {isEmpty(host.current_operations)
                  ? <Icon icon={`${host.power_state.toLowerCase()}`} />
                  : <Icon icon='busy' />
                }
              </Tooltip>
              &nbsp;&nbsp;
              <Ellipsis>
                <Text value={host.name_label} onChange={this._setNameLabel} useLongClick />
              </Ellipsis>
            </EllipsisContainer>
          </Col>
          <Col mediumSize={4} className='hidden-md-down'>
            <EllipsisContainer>
              <span className={styles.itemActionButons}>
                {this._isRunning
                  ? <span>
                    <Tooltip content={_('stopHostLabel')}>
                      <a onClick={this._stop}>
                        <Icon icon='host-stop' size='1' />
                      </a>
                    </Tooltip>
                  </span>
                  : <span>
                    <Tooltip content={_('startHostLabel')}>
                      <a onClick={this._start}>
                        <Icon icon='host-start' size='1' />
                      </a>
                    </Tooltip>
                  </span>
                }
              </span>
              <Icon className='text-info' icon={host.os_version && osFamily(host.os_version.distro)} fixedWidth />
              {' '}
              <Ellipsis>
                <Text value={host.name_description} onChange={this._setNameDescription} useLongClick />
              </Ellipsis>
            </EllipsisContainer>
          </Col>
          <Col largeSize={2} className='hidden-lg-down'>
            <span>
              {host.cpus.cores}x <Icon icon='cpu' />
              {' '}
              {formatSize(host.memory.size)}
            </span>
          </Col>
          <Col largeSize={2} className='hidden-lg-down'>
            <span className='tag tag-info tag-ip'>{host.address}</span>
          </Col>
          {container && <Col mediumSize={2} className='hidden-sm-down'>
            <Link to={`/${container.type}s/${container.id}`}>{container.name_label}</Link>
          </Col>}
          <Col mediumSize={1} offset={container ? undefined : 2} className={styles.itemExpandRow}>
            <a className={styles.itemExpandButton}
              onClick={this._toggleExpanded}>
              <Icon icon='nav' fixedWidth />&nbsp;&nbsp;&nbsp;
            </a>
          </Col>
        </SingleLineRow>
      </BlockLink>
      {(this.state.expanded || expandAll) &&
        <Row>
          <Col mediumSize={4} className={styles.itemExpanded}>
            <span>
              {host.cpus.cores}x <Icon icon='cpu' />
              {' '}&nbsp;{' '}
              {formatSize(host.memory.size)} <Icon icon='memory' />
            </span>
          </Col>
          <Col mediumSize={4} className={styles.itemExpanded}>
            <span className='tag tag-info tag-ip'>{host.address}</span>
          </Col>
          <Col mediumSize={4}>
            <span style={{fontSize: '1.4em'}}>
              <Tags labels={host.tags} onDelete={this._removeTag} onAdd={this._addTag} />
            </span>
          </Col>
        </Row>
      }
    </div>
  }
}
