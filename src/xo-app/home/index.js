import * as ComplexMatcher from 'complex-matcher'
import _ from 'intl'
import ActionButton from 'action-button'
import ceil from 'lodash/ceil'
import CenterPanel from 'center-panel'
import Component from 'base-component'
import debounce from 'lodash/debounce'
import forEach from 'lodash/forEach'
import Icon from 'icon'
import invoke from 'invoke'
import keys from 'lodash/keys'
import isEmpty from 'lodash/isEmpty'
import isString from 'lodash/isString'
import Link from 'link'
import map from 'lodash/map'
import Page from '../page'
import React from 'react'
import SingleLineRow from 'single-line-row'
import size from 'lodash/size'
import { Card, CardHeader, CardBlock } from 'card'
import {
  copyVms,
  deleteVms,
  emergencyShutdownHosts,
  migrateVms,
  restartHosts,
  restartHostsAgents,
  restartVms,
  snapshotVms,
  startVms,
  stopHosts,
  stopVms
} from 'xo'
import { Container, Row, Col } from 'grid'
import {
  SelectHost,
  SelectPool,
  SelectTag
} from 'select-objects'
import {
  connectStore,
  noop
} from 'utils'
import {
  areObjectsFetched,
  createCounter,
  createFilter,
  createGetObjectsOfType,
  createPager,
  createSelector,
  createSort
} from 'selectors'
import {
  Button,
  DropdownButton,
  MenuItem,
  OverlayTrigger,
  Pagination,
  Popover
} from 'react-bootstrap-4/lib'

import styles from './index.css'
import HostItem from './host-item'
import PoolItem from './pool-item'
import VmItem from './vm-item'

const ITEMS_PER_PAGE = 20

const OPTIONS = {
  host: {
    defaultFilter: 'power_state:running ',
    filters: {
      homeFilterRunningHosts: 'power_state:running ',
      homeFilterTags: 'tags:'
    },
    mainActions: [
      { handler: stopHosts, icon: 'host-stop' },
      { handler: restartHostsAgents, icon: 'host-restart-agent' },
      { handler: emergencyShutdownHosts, icon: 'host-emergency-shutdown' },
      { handler: restartHosts, icon: 'host-reboot' }
    ],
    Item: HostItem,
    showPoolsSelector: true,
    sortOptions: [
      { labelId: 'homeSortByName', sortBy: 'name_label', sortOrder: 'asc' },
      { labelId: 'homeSortByPowerstate', sortBy: 'power_state', sortOrder: 'desc' },
      { labelId: 'homeSortByRAM', sortBy: 'memory.size', sortOrder: 'desc' },
      { labelId: 'homeSortByCpus', sortBy: 'CPUs.cpu_count', sortOrder: 'desc' }
    ]
  },
  VM: {
    defaultFilter: 'power_state:running ',
    filters: {
      homeFilterPendingVms: 'current_operations:"" ',
      homeFilterNonRunningVms: '!power_state:running ',
      homeFilterHvmGuests: 'virtualizationMode:hvm ',
      homeFilterRunningVms: 'power_state:running ',
      homeFilterTags: 'tags:'
    },
    mainActions: [
      { handler: stopVms, icon: 'vm-stop' },
      { handler: startVms, icon: 'vm-start' },
      { handler: restartVms, icon: 'vm-reboot' },
      { handler: migrateVms, icon: 'vm-migrate' },
      { handler: copyVms, icon: 'vm-copy' }
    ],
    otherActions: [{
      handler: restartVms,
      icon: 'vm-force-reboot',
      labelId: 'forceRebootVmLabel',
      params: true
    }, {
      handler: stopVms,
      icon: 'vm-force-shutdown',
      labelId: 'forceShutdownVmLabel',
      params: true
    }, {
      handler: snapshotVms,
      icon: 'vm-snapshot',
      labelId: 'snapshotVmLabel'
    }, {
      handler: deleteVms,
      icon: 'vm-delete',
      labelId: 'vmRemoveButton'
    }],
    Item: VmItem,
    showPoolsSelector: true,
    showHostsSelector: true,
    sortOptions: [
      { labelId: 'homeSortByName', sortBy: 'name_label', sortOrder: 'asc' },
      { labelId: 'homeSortByPowerstate', sortBy: 'power_state', sortOrder: 'desc' },
      { labelId: 'homeSortByRAM', sortBy: 'memory.size', sortOrder: 'desc' },
      { labelId: 'homeSortByCpus', sortBy: 'CPUs.number', sortOrder: 'desc' }
    ]
  },
  pool: {
    defaultFilter: '',
    filters: {
      homeFilterTags: 'tags:'
    },
    getActions: noop,
    Item: PoolItem,
    sortOptions: [
      { labelId: 'homeSortByName', sortBy: 'name_label', sortOrder: 'asc' }
    ]
  }
}

const TYPES = {
  VM: _('homeTypeVm'),
  host: _('homeTypeHost'),
  pool: _('homeTypePool')
}

const DEFAULT_TYPE = 'VM'

@connectStore(() => {
  const noServersConnected = invoke(
    createGetObjectsOfType('host'),
    hosts => state => isEmpty(hosts(state))
  )
  const type = (_, props) => props.location.query.t || DEFAULT_TYPE

  return {
    areObjectsFetched,
    items: createGetObjectsOfType(type),
    noServersConnected,
    type
  }
})
export default class Home extends Component {
  static contextTypes = {
    router: React.PropTypes.object
  }

  get page () {
    return this.state.page
  }
  set page (activePage) {
    this.setState({ activePage })
  }

  componentWillMount () {
    this._initFilter(this.props)
  }

  componentWillReceiveProps (props) {
    this._initFilter(props)
  }

  _getNumberOfItems = createCounter(() => this.props.items)

  _getType () {
    return this.props.type
  }

  _setType (type) {
    const { pathname, query } = this.props.location
    this.context.router.push({
      pathname,
      query: { ...query, t: type, s: undefined }
    })
  }

  _initFilter (props) {
    const filter = this._getFilter(props)

    // If filter is null, set a default filter.
    if (filter == null) {
      const defaultFilter = OPTIONS[props.type].defaultFilter
      if (defaultFilter != null) {
        this._setFilter(defaultFilter, props)
      }
      return
    }

    // If the filter is already set, do nothing.
    if (filter === this.props.filter) {
      return
    }

    const parsed = ComplexMatcher.parse(filter)
    const properties = parsed::ComplexMatcher.getPropertyClausesStrings()

    this.setState({
      selectedHosts: properties.$container,
      selectedPools: properties.$pool,
      selectedTags: properties.tags
    })

    const { filterInput } = this.refs
    if (filterInput && filterInput.value !== filter) {
      filterInput.value = filter
      filterInput.focus()
    }
  }

  // Optionally can take the props to be able to use it in
  // componentWillReceiveProps().
  _getFilter (props = this.props) {
    return props.location.query.s
  }

  _getParsedFilter = createSelector(
    props => this._getFilter(),
    filter => ComplexMatcher.parse(filter)
  )

  _getFilterFunction = createSelector(
    this._getParsedFilter,
    filter => filter && (value => filter::ComplexMatcher.execute(value))
  )

  // Optionally can take the props to be able to use it in
  // componentWillReceiveProps().
  _setFilter (filter, props = this.props) {
    if (!isString(filter)) {
      filter = filter::ComplexMatcher.toString()
    }

    const { pathname, query } = props.location
    this.context.router.push({
      pathname,
      query: { ...query, s: filter }
    })
  }

  _clearFilter = () => this._setFilter('')

  _onFilterChange = invoke(() => {
    const setFilter = debounce(filter => {
      this._setFilter(filter)
    }, 500)

    return event => setFilter(event.target.value)
  })

  _getFilteredItems = createSort(
    createFilter(
      () => this.props.items,
      this._getFilterFunction
    ),
    () => this.state.sortBy || 'name_label',
    () => this.state.sortOrder
  )

  _getVisibleItems = createPager(
    this._getFilteredItems,
    () => this.state.activePage || 1
  )

  _expandAll = () => this.setState({ expandAll: !this.state.expandAll })

  _onPageSelection = (_, event) => { this.page = event.eventKey }

  _tick = isCriteria => <Icon icon={isCriteria ? 'success' : undefined} fixedWidth />

  _updateSelectedPools = pools => {
    const filter = this._getParsedFilter()

    this._setFilter(pools.length
      ? filter::ComplexMatcher.setPropertyClause(
        '$pool',
        ComplexMatcher.createOr(map(pools, pool =>
          ComplexMatcher.createString(pool.id)
        ))
      )
      : filter::ComplexMatcher.removePropertyClause('$pool')
    )
  }
  _updateSelectedHosts = hosts => {
    const filter = this._getParsedFilter()

    this._setFilter(hosts.length
      ? filter::ComplexMatcher.setPropertyClause(
        '$container',
        ComplexMatcher.createOr(map(hosts, host =>
          ComplexMatcher.createString(host.id)
        ))
      )
      : filter::ComplexMatcher.removePropertyClause('$container')
    )
  }
  _updateSelectedTags = tags => {
    const filter = this._getParsedFilter()

    this._setFilter(tags.length
      ? filter::ComplexMatcher.setPropertyClause(
        'tags',
        ComplexMatcher.createOr(map(tags, tag =>
          ComplexMatcher.createString(tag.id)
        ))
      )
      : filter::ComplexMatcher.removePropertyClause('tags')
    )
  }

  // Checkboxes
  _selectedItems = {}
  _updateMasterCheckbox () {
    const masterCheckbox = this.refs.masterCheckbox
    if (!masterCheckbox) {
      return
    }
    const noneChecked = isEmpty(this._selectedItems)
    masterCheckbox.checked = !noneChecked
    masterCheckbox.indeterminate = !noneChecked && size(this._selectedItems) !== this._getFilteredItems().length
    this.setState({ displayActions: !noneChecked })
  }
  _selectItem = (id, checked) => {
    const shouldBeChecked = checked === undefined ? !this._selectedItems[id] : checked
    shouldBeChecked ? this._selectedItems[id] = true : delete this._selectedItems[id]
    this.forceUpdate()
    this._updateMasterCheckbox()
  }
  _selectAllItems = (checked) => {
    const shouldBeChecked = checked === undefined ? !size(this._selectedItems) : checked
    this._selectedItems = {}
    forEach(this._getFilteredItems(), item => {
      shouldBeChecked && (this._selectedItems[item.id] = true)
    })
    this.forceUpdate()
    this._updateMasterCheckbox()
  }

  _renderHeader () {
    const { filters } = OPTIONS[this.props.type]

    return <Container>
      <Row className={styles.itemRowHeader}>
        <Col mediumSize={3}>
          <DropdownButton id='typeMenu' bsStyle='info' title={TYPES[this.props.type]}>
            <MenuItem onClick={() => this._setType('VM')}>
              VM
            </MenuItem>
            <MenuItem onClick={() => this._setType('host')}>
              Host
            </MenuItem>
            <MenuItem onClick={() => this._setType('pool')}>
              Pool
            </MenuItem>
          </DropdownButton>
        </Col>
        <Col mediumSize={6}>
          <div className='input-group'>
            {!isEmpty(filters) && <div className='input-group-btn'>
              <DropdownButton id='filter' bsStyle='info' title={_('homeFilters')}>
                {map(filters, (filter, label) =>
                  <MenuItem key={label} onClick={() => this._setFilter(filter)}>
                    {_(label)}
                  </MenuItem>
                )}
              </DropdownButton>
            </div>}
            <input
              autoFocus
              className='form-control'
              defaultValue={this._getFilter()}
              onChange={this._onFilterChange}
              ref='filterInput'
              type='text'
            />
            <div className='input-group-btn'>
              <button
                className='btn btn-secondary'
                onClick={this._clearFilter}>
                <Icon icon='clear-search' />
              </button>
            </div>
          </div>
        </Col>
        <Col mediumSize={3} className='text-xs-right'>
          <Link
            className='btn btn-success'
            to='/vms/new'>
            <Icon icon='vm-new' /> {_('homeNewVm')}
          </Link>
        </Col>
      </Row>
    </Container>
  }

  render () {
    const { props } = this
    const { user } = this.props
    const isAdmin = user && user.permission === 'admin'

    if (!props.areObjectsFetched) {
      return <CenterPanel>
        <h2><img src='assets/loading.svg' /></h2>
      </CenterPanel>
    }

    if (props.noServersConnected && isAdmin) {
      return <CenterPanel>
        <Card shadow>
          <CardHeader>{_('homeWelcome')}</CardHeader>
          <CardBlock>
            <Link to='/settings/servers'>
              <Icon icon='pool' size={4} />
              <h4>{_('homeAddServer')}</h4>
            </Link>
            <p className='text-muted'>{_('homeWelcomeText')}</p>
            <br /><br />
            <h3>{_('homeHelp')}</h3>
            <Row>
              <Col mediumSize={6}>
                <a href='https://xen-orchestra.com/docs/' target='_blank' className='btn btn-link'>
                  <Icon icon='menu-about' size={4} />
                  <h4>{_('homeOnlineDoc')}</h4>
                </a>
              </Col>
              <Col mediumSize={6}>
                <a href='https://xen-orchestra.com/#!/member/support' target='_blank' className='btn btn-link'>
                  <Icon icon='menu-settings-users' size={4} />
                  <h4>{_('homeProSupport')}</h4>
                </a>
              </Col>
            </Row>
          </CardBlock>
        </Card>
      </CenterPanel>
    }

    const nItems = this._getNumberOfItems()
    if (!nItems) {
      return <CenterPanel>
        <Card shadow>
          <CardHeader>{_('homeNoVms')}</CardHeader>
          <CardBlock>
            <Row>
              <Col>
                <Link to='/vms/new'>
                  <Icon icon='vm' size={4} />
                  <h4>{_('homeNewVm')}</h4>
                </Link>
                <p className='text-muted'>{_('homeNewVmMessage')}</p>
              </Col>
            </Row>
            <h2>{_('homeNoVmsOr')}</h2>
            <Row>
              <Col mediumSize={6}>
                <Link to='/import'>
                  <Icon icon='menu-new-import' size={4} />
                  <h4>{_('homeImportVm')}</h4>
                </Link>
                <p className='text-muted'>{_('homeImportVmMessage')}</p>
              </Col>
              <Col mediumSize={6}>
                <Link to='/backup/restore'>
                  <Icon icon='backup' size={4} />
                  <h4>{_('homeRestoreBackup')}</h4>
                </Link>
                <p className='text-muted'>{_('homeRestoreBackupMessage')}</p>
              </Col>
            </Row>
          </CardBlock>
        </Card>
      </CenterPanel>
    }

    const filteredItems = this._getFilteredItems()
    const visibleItems = this._getVisibleItems()
    const { activePage, sortBy } = this.state
    const items = {
      'VM': VmItem,
      'host': HostItem,
      'pool': PoolItem
    }
    const { type } = props
    const Item = items[type] || items[DEFAULT_TYPE]
    const options = OPTIONS[type]
    const { mainActions, otherActions } = options
    const selectedItemsIds = keys(this._selectedItems)

    return <Page header={this._renderHeader()}>
      <div>
        <div className={styles.itemContainer}>
          <SingleLineRow className={styles.itemContainerHeader}>
            <Col smallsize={11} mediumSize={3}>
              <input type='checkbox' onChange={() => this._selectAllItems()} ref='masterCheckbox' />
              {' '}
              <span className='text-muted'>
                {size(this._selectedItems)
                 ? _('homeSelectedItems', {
                   icon: <Icon icon={type.toLowerCase()} />,
                   selected: size(this._selectedItems),
                   total: nItems
                 })
                 : _('homeDisplayedItems', {
                   displayed: filteredItems.length,
                   icon: <Icon icon={type.toLowerCase()} />,
                   total: nItems
                 })
                }
              </span>
            </Col>
            <Col mediumSize={8} className='text-xs-right hidden-sm-down'>
            {this.state.displayActions
              ? (
              <div>
                {mainActions && (
                  <div className='btn-group'>
                    {map(mainActions, (action, key) => (
                      <ActionButton
                        btnStyle='secondary'
                        key={key}
                        {...action}
                        handlerParam={selectedItemsIds}
                      />
                    ))}
                  </div>
                )}
                {otherActions && (
                  <DropdownButton bsStyle='secondary' id='advanced' title={_('homeMore')}>
                    {map(otherActions, (action, key) => (
                      <MenuItem key={key} onClick={() => { action.handler(selectedItemsIds, action.params) }}>
                        <Icon icon={action.icon} fixedWidth /> {_(action.labelId)}
                      </MenuItem>
                    ))}
                  </DropdownButton>
                )}
              </div>
              ) : <div>
                {options.showPoolsSelector && (
                  <OverlayTrigger
                    trigger='click'
                    rootClose
                    placement='bottom'
                    overlay={
                      <Popover className={styles.selectObject} id='poolPopover'>
                        <SelectPool
                          autoFocus
                          multi
                          onChange={this._updateSelectedPools}
                          value={this.state.selectedPools}
                        />
                      </Popover>
                    }
                  >
                    <Button className='btn-link'><Icon icon='pool' /> {_('homeAllPools')}</Button>
                  </OverlayTrigger>
                )}
                {' '}
                {options.showHostsSelector && (
                  <OverlayTrigger
                    trigger='click'
                    rootClose
                    placement='bottom'
                    overlay={
                      <Popover className={styles.selectObject} id='HostPopover'>
                        <SelectHost
                          autoFocus
                          multi
                          onChange={this._updateSelectedHosts}
                          value={this.state.selectedHosts}
                        />
                      </Popover>
                    }
                  >
                    <Button className='btn-link'><Icon icon='host' /> {_('homeAllHosts')}</Button>
                  </OverlayTrigger>
                )}
                {' '}
                <OverlayTrigger
                  autoFocus
                  trigger='click'
                  rootClose
                  placement='bottom'
                  overlay={
                    <Popover className={styles.selectObject} id='tagPopover'>
                      <SelectTag
                        autoFocus
                        multi
                        objects={props.items}
                        onChange={this._updateSelectedTags}
                        value={this.state.selectedTags}
                      />
                    </Popover>
                  }
                >
                  <Button className='btn-link'><Icon icon='tags' /> {_('homeAllTags')}</Button>
                </OverlayTrigger>
                {' '}
                <DropdownButton bsStyle='link' id='sort' title={_('homeSortBy')}>
                  {map(options.sortOptions, ({ labelId, sortBy: _sortBy, sortOrder }) => (
                    <MenuItem onClick={() => this.setState({ sortBy: _sortBy, sortOrder })}>
                      {this._tick(_sortBy === sortBy)}
                      {_sortBy === sortBy
                        ? <strong>{_(labelId)}</strong>
                        : _(labelId)
                      }
                    </MenuItem>
                  ))}
                </DropdownButton>
              </div>
            }
            </Col>
            <Col smallsize={1} mediumSize={1} className='text-xs-right'>
              <button className='btn btn-secondary'
                onClick={this._expandAll}>
                <Icon icon='nav' />
              </button>
            </Col>
          </SingleLineRow>
          {map(visibleItems, item =>
            <Item
              expandAll={this.state.expandAll}
              item={item}
              key={item.id}
              onSelect={this._selectItem}
              selected={this._selectedItems[item.id]}
            />
          )}
        </div>
        {filteredItems.length > ITEMS_PER_PAGE && <Row>
          <div style={{display: 'flex', width: '100%'}}>
            <div style={{margin: 'auto'}}>
              <Pagination
                first
                last
                prev
                next
                ellipsis
                boundaryLinks
                maxButtons={5}
                items={ceil(filteredItems.length / ITEMS_PER_PAGE)}
                activePage={activePage}
                onSelect={this._onPageSelection} />
            </div>
          </div>
        </Row>}
      </div>
    </Page>
  }
}
