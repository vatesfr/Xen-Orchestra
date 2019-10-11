import * as CM from 'complex-matcher'
import _ from 'intl'
import classNames from 'classnames'
import defined, { get } from '@xen-orchestra/defined'
import DropdownMenu from 'react-bootstrap-4/lib/DropdownMenu' // https://phabricator.babeljs.io/T6662 so Dropdown.Menu won't work like https://react-bootstrap.github.io/components.html#btn-dropdowns-custom
import DropdownToggle from 'react-bootstrap-4/lib/DropdownToggle' // https://phabricator.babeljs.io/T6662 so Dropdown.Toggle won't work https://react-bootstrap.github.io/components.html#btn-dropdowns-custom
import PropTypes from 'prop-types'
import React from 'react'
import Shortcuts from 'shortcuts'
import { Input as DebouncedInput } from 'debounce-input-decorator'
import { Portal } from 'react-overlays'
import { routerShape } from 'react-router/lib/PropTypes'
import { Set } from 'immutable'
import { Dropdown, MenuItem } from 'react-bootstrap-4/lib'
import { injectState, provideState } from 'reaclette'
import {
  ceil,
  filter,
  findIndex,
  forEach,
  get as getProperty,
  isEmpty,
  map,
  sortBy,
} from 'lodash'

import ActionRowButton from '../action-row-button'
import Button from '../button'
import ButtonGroup from '../button-group'
import Component from '../base-component'
import decorate from '../apply-decorators'
import Icon from '../icon'
import Pagination from '../pagination'
import SingleLineRow from '../single-line-row'
import Tooltip from '../tooltip'
import { BlockLink } from '../link'
import { Container, Col } from '../grid'
import {
  createCollectionWrapper,
  createCounter,
  createFilter,
  createPager,
  createSelector,
  createSort,
} from '../selectors'

import styles from './index.css'

// ===================================================================

class TableFilter extends Component {
  static propTypes = {
    filters: PropTypes.object,
    onChange: PropTypes.func.isRequired,
    value: PropTypes.string.isRequired,
  }

  _cleanFilter = () => this._setFilter('')

  _setFilter = filterValue => {
    const filter = this.refs.filter.getWrappedInstance()
    filter.value = filterValue
    filter.focus()
    this.props.onChange(filterValue)
  }

  _onChange = event => {
    this.props.onChange(event.target.value)
  }

  focus() {
    this.refs.filter.getWrappedInstance().focus()
  }

  render() {
    const { props } = this

    return (
      <div className='input-group'>
        {isEmpty(props.filters) ? (
          <span className='input-group-addon'>
            <Icon icon='search' />
          </span>
        ) : (
          <span className='input-group-btn'>
            <Dropdown id='filter'>
              <DropdownToggle bsStyle='info'>
                <Icon icon='search' />
              </DropdownToggle>
              <DropdownMenu>
                {map(props.filters, (filter, label) => (
                  <MenuItem key={label} onClick={() => this._setFilter(filter)}>
                    {_(label)}
                  </MenuItem>
                ))}
              </DropdownMenu>
            </Dropdown>
          </span>
        )}
        <DebouncedInput
          className='form-control'
          onChange={this._onChange}
          ref='filter'
          value={props.value}
        />
        <Tooltip content={_('filterSyntaxLinkTooltip')}>
          <a
            className='input-group-addon'
            href='https://xen-orchestra.com/docs/search.html#filter-syntax'
            target='_blank'
          >
            <Icon icon='info' />
          </a>
        </Tooltip>
        <span className='input-group-btn'>
          <Button onClick={this._cleanFilter}>
            <Icon icon='clear-search' />
          </Button>
        </span>
      </div>
    )
  }
}

// ===================================================================

class ColumnHead extends Component {
  static propTypes = {
    columnId: PropTypes.number.isRequired,
    name: PropTypes.node,
    sort: PropTypes.func,
    sortIcon: PropTypes.string,
  }

  _sort = () => {
    const { props } = this
    props.sort(props.columnId)
  }

  render() {
    const { name, sortIcon, textAlign } = this.props

    if (!this.props.sort) {
      return <th className={textAlign && `text-xs-${textAlign}`}>{name}</th>
    }

    const isSelected = sortIcon === 'asc' || sortIcon === 'desc'

    return (
      <th
        className={classNames(
          textAlign && `text-xs-${textAlign}`,
          styles.clickableColumn,
          isSelected && classNames('text-white', 'bg-info')
        )}
        onClick={this._sort}
      >
        {name}
        <span className='pull-right'>
          <Icon icon={sortIcon} />
        </span>
      </th>
    )
  }
}

// ===================================================================

class Checkbox extends Component {
  static propTypes = {
    indeterminate: PropTypes.bool.isRequired,
  }

  componentDidUpdate() {
    const {
      props: { indeterminate },
      ref,
    } = this
    if (ref !== null) {
      ref.indeterminate = indeterminate
    }
  }

  _ref = ref => {
    this.ref = ref
    this.componentDidUpdate()
  }

  render() {
    const { indeterminate, ...props } = this.props
    props.ref = this._ref
    props.type = 'checkbox'
    return <input {...props} />
  }
}

// ===================================================================

const actionsShape = PropTypes.arrayOf(
  PropTypes.shape({
    // groupedActions: the function will be called with an array of the selected items in parameters
    // individualActions: the function will be called with the related item in parameters
    disabled: PropTypes.oneOfType([PropTypes.bool, PropTypes.func]),
    handler: PropTypes.func.isRequired,
    icon: PropTypes.string.isRequired,
    label: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
    level: PropTypes.oneOf(['primary', 'warning', 'danger']),
    redirectOnSuccess: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  })
)

const Action = decorate([
  provideState({
    computed: {
      disabled: ({ items }, { disabled, userData }) =>
        typeof disabled === 'function' ? disabled(items, userData) : disabled,
      handler: ({ items }, { handler, userData }) => () =>
        handler(items, userData),
      icon: ({ items }, { icon, userData }) =>
        typeof icon === 'function' ? icon(items, userData) : icon,
      items: (_, { items, grouped }) =>
        Array.isArray(items) || !grouped ? items : [items],
      label: ({ items }, { label, userData }) =>
        typeof label === 'function' ? label(items, userData) : label,
      level: ({ items }, { level, userData }) =>
        typeof level === 'function' ? level(items, userData) : level,
    },
  }),
  injectState,
  ({ state, redirectOnSuccess, userData }) => (
    <ActionRowButton
      btnStyle={state.level}
      disabled={state.disabled}
      handler={state.handler}
      icon={state.icon}
      redirectOnSuccess={redirectOnSuccess}
      tooltip={state.label}
    />
  ),
])

const LEVELS = [undefined, 'primary', 'warning', 'danger']
// page number and sort info are optional for backward compatibility
const URL_STATE_RE = /^(?:(\d+)(?:_(\d+)(_desc)?)?-)?(.*)$/

export default class SortedTable extends Component {
  static propTypes = {
    defaultColumn: PropTypes.number,
    defaultFilter: PropTypes.string,
    collection: PropTypes.oneOfType([PropTypes.array, PropTypes.object])
      .isRequired,
    columns: PropTypes.arrayOf(
      PropTypes.shape({
        default: PropTypes.bool,
        name: PropTypes.node,
        sortCriteria: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
        sortOrder: PropTypes.string,
        textAlign: PropTypes.string,

        // for the cell render, you can use component or itemRenderer or valuePath
        //
        // item and userData will be injected in the component as props
        // component: <Component />
        component: PropTypes.func,

        // itemRenderer: (item, userData) => <span />
        itemRenderer: PropTypes.func,

        // the path to the value, it's also the sort criteria default value
        // valuePath: 'a.b.c'
        valuePath: PropTypes.string,
      })
    ).isRequired,
    filterContainer: PropTypes.func,
    filters: PropTypes.object,
    actions: PropTypes.arrayOf(
      PropTypes.shape({
        // regroup individual actions and grouped actions
        disabled: PropTypes.oneOfType([PropTypes.bool, PropTypes.func]),
        handler: PropTypes.func.isRequired,
        icon: PropTypes.string.isRequired,
        individualDisabled: PropTypes.oneOfType([
          PropTypes.bool,
          PropTypes.func,
        ]),
        individualHandler: PropTypes.func,
        individualLabel: PropTypes.node,
        label: PropTypes.node.isRequired,
        level: PropTypes.oneOf(['primary', 'warning', 'danger']),
      })
    ),
    groupedActions: actionsShape,
    individualActions: actionsShape,
    itemsPerPage: PropTypes.number,
    onSelect: PropTypes.func,
    paginationContainer: PropTypes.func,
    rowAction: PropTypes.func,
    rowLink: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    rowTransform: PropTypes.func,
    // DOM node selector like body or .my-class
    // The shortcuts will be enabled when the node is focused
    shortcutsTarget: PropTypes.string,
    stateUrlParam: PropTypes.string,

    // @deprecated, use `data-${key}` instead
    userData: PropTypes.any,
  }

  static defaultProps = {
    itemsPerPage: 10,
  }

  static contextTypes = {
    router: routerShape,
  }

  constructor(props, context) {
    super(props, context)

    this._getUserData =
      'userData' in props
        ? () => this.props.userData
        : createCollectionWrapper(() => {
            const { props } = this
            const userData = {}
            Object.keys(props).forEach(key => {
              if (key.startsWith('data-')) {
                userData[key.slice(5)] = props[key]
              }
            })
            return isEmpty(userData) ? undefined : userData
          })

    let selectedColumn = props.defaultColumn
    if (selectedColumn == null) {
      selectedColumn = findIndex(props.columns, 'default')

      if (selectedColumn === -1) {
        selectedColumn = 0
      }
    }

    const state = (this.state = {
      all: false, // whether all items are selected (accross pages)
      filter: defined(() => props.filters[props.defaultFilter], ''),
      page: 1,
      selectedColumn,
      sortOrder:
        props.columns[selectedColumn].sortOrder === 'desc' ? 'desc' : 'asc',
    })

    const urlState = get(
      () => context.router.location.query[props.stateUrlParam]
    )

    let matches
    if (
      urlState !== undefined &&
      (matches = URL_STATE_RE.exec(urlState)) !== null
    ) {
      state.filter = matches[4]
      const page = matches[1]
      if (page !== undefined) {
        state.page = +page
      }
      let selectedColumn = matches[2]
      if (
        selectedColumn !== undefined &&
        (selectedColumn = +selectedColumn) < props.columns.length
      ) {
        state.selectedColumn = selectedColumn
        state.sortOrder = matches[3] !== undefined ? 'desc' : 'asc'
      }
    }

    this._getSelectedColumn = () =>
      this.props.columns[this.state.selectedColumn]

    let getAllItems = () => this.props.collection
    if ('rowTransform' in props) {
      getAllItems = createSelector(
        getAllItems,
        this._getUserData,
        () => this.props.rowTransform,
        (items, userData, rowTransform) =>
          map(items, item => rowTransform(item, userData))
      )
    }
    this._getTotalNumberOfItems = createCounter(getAllItems)

    this._getItems = createSort(
      createFilter(
        getAllItems,
        createSelector(
          () => this.state.filter,
          filter => {
            try {
              return CM.parse(filter).createPredicate()
            } catch (_) {}
          }
        )
      ),
      createSelector(
        () => this._getSelectedColumn().valuePath,
        () => this._getSelectedColumn().sortCriteria,
        this._getUserData,
        (valuePath, sortCriteria = valuePath, userData) =>
          typeof sortCriteria === 'function'
            ? object => sortCriteria(object, userData)
            : sortCriteria
      ),
      () => this.state.sortOrder
    )

    this._getVisibleItems = createPager(
      this._getItems,
      () => this.state.page,
      () => this.props.itemsPerPage
    )

    state.selectedItemsIds = new Set()

    this._getSelectedItems = createSelector(
      () => this.state.all,
      () => this.state.selectedItemsIds,
      this._getItems,
      (all, selectedItemsIds, items) =>
        all ? items : filter(items, item => selectedItemsIds.has(item.id))
    )

    this._hasGroupedActions = createSelector(
      this._getGroupedActions,
      actions => !isEmpty(actions)
    )

    this._getShortcutsHandler = createSelector(
      this._getVisibleItems,
      this._hasGroupedActions,
      () => this.state.highlighted,
      () => this.props.rowLink,
      () => this.props.rowAction,
      this._getUserData,
      (
        visibleItems,
        hasGroupedActions,
        itemIndex,
        rowLink,
        rowAction,
        userData
      ) => (command, event) => {
        event.preventDefault()
        const item =
          itemIndex !== undefined ? visibleItems[itemIndex] : undefined

        switch (command) {
          case 'SEARCH':
            this.refs.filterInput.focus()
            break
          case 'NAV_DOWN':
            if (
              hasGroupedActions ||
              rowAction !== undefined ||
              rowLink !== undefined
            ) {
              this.setState({
                highlighted:
                  (itemIndex + visibleItems.length + 1) % visibleItems.length ||
                  0,
              })
            }
            break
          case 'NAV_UP':
            if (
              hasGroupedActions ||
              rowAction !== undefined ||
              rowLink !== undefined
            ) {
              this.setState({
                highlighted:
                  (itemIndex + visibleItems.length - 1) % visibleItems.length ||
                  0,
              })
            }
            break
          case 'SELECT':
            if (itemIndex !== undefined && hasGroupedActions) {
              this._selectItem(itemIndex)
            }
            break
          case 'ROW_ACTION':
            if (item !== undefined) {
              if (rowLink !== undefined) {
                this.context.router.push(
                  typeof rowLink === 'function'
                    ? rowLink(item, userData)
                    : rowLink
                )
              } else if (rowAction !== undefined) {
                rowAction(item, userData)
              }
            }
            break
        }
      }
    )
  }

  componentDidMount() {
    this._checkUpdatePage()

    // Force one Portal refresh.
    // Because Portal cannot see the container reference at first rendering.
    if (this.props.paginationContainer) {
      this.forceUpdate()
    }
  }

  _sort = columnId => {
    const { state } = this
    let sortOrder

    if (state.selectedColumn === columnId) {
      sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc'
    } else {
      sortOrder =
        this.props.columns[columnId].sortOrder === 'desc' ? 'desc' : 'asc'
    }

    this._setVisibleState({
      selectedColumn: columnId,
      sortOrder,
    })
  }

  componentDidUpdate() {
    const { selectedItemsIds } = this.state

    // Unselect items that are no longer visible
    if (
      (this._visibleItemsRecomputations || 0) <
      (this._visibleItemsRecomputations = this._getVisibleItems.recomputations())
    ) {
      const newSelectedItems = selectedItemsIds.intersect(
        map(this._getVisibleItems(), 'id')
      )
      if (newSelectedItems.size < selectedItemsIds.size) {
        this.setState({ selectedItemsIds: newSelectedItems })
      }
    }

    this._checkUpdatePage()
  }

  _saveUrlState = () => {
    const { filter, page, selectedColumn, sortOrder } = this.state
    const { router } = this.context
    const { location } = router
    router.replace({
      ...location,
      query: {
        ...location.query,
        [this.props.stateUrlParam]: `${page}_${selectedColumn}${
          sortOrder === 'desc' ? '_desc' : ''
        }-${filter}`,
      },
    })
  }

  // update state in the state and update the URL param
  _setVisibleState(state) {
    this.setState(state, this.props.stateUrlParam && this._saveUrlState)
  }

  _setFilter = filter => {
    this._setVisibleState({
      filter,
      page: 1,
      highlighted: undefined,
    })
  }

  _checkUpdatePage() {
    const { page } = this.state
    if (page === 1) {
      return
    }

    const n = this._getItems().length
    const { itemsPerPage } = this.props
    if (n < itemsPerPage) {
      return this._setPage(1)
    }

    const last = ceil(n / itemsPerPage)
    if (page > last) {
      return this._setPage(last)
    }
  }

  _setPage(page) {
    this._setVisibleState({ page })
  }
  _setPage = this._setPage.bind(this)

  _selectAllVisibleItems = event => {
    const { checked } = event.target
    const { onSelect } = this.props
    if (onSelect !== undefined) {
      onSelect(checked ? map(this._getVisibleItems(), 'id') : [])
    }

    this.setState({
      all: false,
      selectedItemsIds: checked
        ? this.state.selectedItemsIds.union(map(this._getVisibleItems(), 'id'))
        : this.state.selectedItemsIds.clear(),
    })
  }

  // TODO: figure out why it's necessary
  _toggleNestedCheckboxGuard = false

  _toggleNestedCheckbox = event => {
    const child = event.target.firstElementChild
    if (child != null && child.tagName === 'INPUT') {
      if (this._toggleNestedCheckboxGuard) {
        return
      }
      this._toggleNestedCheckboxGuard = true
      child.dispatchEvent(new window.MouseEvent('click', event.nativeEvent))
      this._toggleNestedCheckboxGuard = false
    }
  }

  _selectAll = () => {
    const { onSelect } = this.props
    if (onSelect !== undefined) {
      onSelect(map(this._getItems(), 'id'))
    }
    this.setState({ all: true })
  }

  _selectItem(current, selected, range = false) {
    const { onSelect } = this.props
    const { all, selectedItemsIds } = this.state
    const visibleItems = this._getVisibleItems()
    const item = visibleItems[current]
    let _selectedItemsIds

    if (all) {
      _selectedItemsIds = new Set().withMutations(selectedItemsIds => {
        forEach(visibleItems, item => {
          selectedItemsIds.add(item.id)
        })
        selectedItemsIds.delete(item.id)
      })
    } else {
      const method = (selected === undefined
      ? !selectedItemsIds.has(item.id)
      : selected)
        ? 'add'
        : 'delete'

      let previous
      _selectedItemsIds =
        range && (previous = this._previous) !== undefined
          ? selectedItemsIds.withMutations(selectedItemsIds => {
              let i = previous
              let end = current
              if (previous > current) {
                i = current
                end = previous
              }
              for (; i <= end; ++i) {
                selectedItemsIds[method](visibleItems[i].id)
              }
            })
          : selectedItemsIds[method](item.id)
      this._previous = current
    }

    if (onSelect !== undefined) {
      onSelect(_selectedItemsIds.toArray())
    }

    this.setState({
      all: false,
      selectedItemsIds: _selectedItemsIds,
    })
  }

  _onSelectItemCheckbox = event => {
    const { target } = event
    this._selectItem(+target.name, target.checked, event.nativeEvent.shiftKey)
  }

  _getGroupedActions = createSelector(
    () => this.props.groupedActions,
    () => this.props.actions,
    (groupedActions, actions) =>
      sortBy(
        groupedActions !== undefined && actions !== undefined
          ? groupedActions.concat(actions)
          : groupedActions || actions,
        action => LEVELS.indexOf(action.level)
      )
  )

  _getIndividualActions = createSelector(
    () => this.props.individualActions,
    () => this.props.actions,
    (individualActions, actions) => {
      const normalizedActions = map(actions, a => ({
        disabled:
          a.individualDisabled !== undefined
            ? a.individualDisabled
            : a.disabled,
        grouped: a.individualHandler === undefined,
        handler:
          a.individualHandler !== undefined ? a.individualHandler : a.handler,
        icon: a.icon,
        label: a.individualLabel !== undefined ? a.individualLabel : a.label,
        level: a.level,
      }))

      return sortBy(
        individualActions !== undefined && actions !== undefined
          ? individualActions.concat(normalizedActions)
          : individualActions || normalizedActions,
        action => LEVELS.indexOf(action.level)
      )
    }
  )

  _renderItem = (item, i) => {
    const { props, state } = this
    const { actions, individualActions, onSelect, rowAction, rowLink } = props
    const userData = this._getUserData()

    const hasGroupedActions = this._hasGroupedActions()
    const hasIndividualActions =
      !isEmpty(individualActions) || !isEmpty(actions)

    const columns = map(
      props.columns,
      ({ component: Component, itemRenderer, valuePath, textAlign }, key) => (
        <td className={textAlign && `text-xs-${textAlign}`} key={key}>
          {Component !== undefined ? (
            <Component item={item} userData={userData} />
          ) : valuePath !== undefined ? (
            getProperty(item, valuePath)
          ) : (
            itemRenderer(item, userData)
          )}
        </td>
      )
    )

    const { id = i } = item

    const selectionColumn = (hasGroupedActions || onSelect !== undefined) && (
      <td className='text-xs-center' onClick={this._toggleNestedCheckbox}>
        <input
          checked={state.all || state.selectedItemsIds.has(id)}
          name={i} // position in visible items
          onChange={this._onSelectItemCheckbox}
          type='checkbox'
        />
      </td>
    )
    const actionsColumn = hasIndividualActions && (
      <td>
        <div className='pull-right'>
          <ButtonGroup>
            {map(this._getIndividualActions(), (props, key) => (
              <Action {...props} items={item} key={key} userData={userData} />
            ))}
          </ButtonGroup>
        </div>
      </td>
    )

    return rowLink != null ? (
      <BlockLink
        className={state.highlighted === i ? styles.highlight : undefined}
        key={id}
        tagName='tr'
        to={typeof rowLink === 'function' ? rowLink(item, userData) : rowLink}
      >
        {selectionColumn}
        {columns}
        {actionsColumn}
      </BlockLink>
    ) : (
      <tr
        className={classNames(
          rowAction && styles.clickableRow,
          state.highlighted === i && styles.highlight
        )}
        key={id}
        onClick={rowAction && (() => rowAction(item, userData))}
      >
        {selectionColumn}
        {columns}
        {actionsColumn}
      </tr>
    )
  }

  render() {
    const { props, state } = this
    const {
      actions,
      filterContainer,
      individualActions,
      itemsPerPage,
      onSelect,
      paginationContainer,
      shortcutsTarget,
    } = props
    const { all } = state
    const groupedActions = this._getGroupedActions()

    const nAllItems = this._getTotalNumberOfItems()
    const nItems = this._getItems().length
    const nSelectedItems = state.selectedItemsIds.size
    const nVisibleItems = this._getVisibleItems().length

    const hasGroupedActions = this._hasGroupedActions()
    const hasIndividualActions =
      !isEmpty(individualActions) || !isEmpty(actions)

    const nColumns = props.columns.length + (hasIndividualActions ? 2 : 1)

    const displayPagination =
      paginationContainer === undefined && itemsPerPage < nAllItems

    const paginationInstance = displayPagination && (
      <Pagination
        pages={ceil(nItems / itemsPerPage)}
        onChange={this._setPage}
        value={state.page}
      />
    )

    const filterInstance = (
      <TableFilter
        filters={props.filters}
        onChange={this._setFilter}
        ref='filterInput'
        value={state.filter}
      />
    )

    const userData = this._getUserData()

    return (
      <div>
        {shortcutsTarget !== undefined && (
          <Shortcuts
            handler={this._getShortcutsHandler()}
            isolate
            name='SortedTable'
            targetNodeSelector={shortcutsTarget}
          />
        )}
        <table className='table'>
          <thead className='thead-default'>
            <tr>
              <th colSpan={nColumns}>
                {nItems === nAllItems
                  ? _('sortedTableNumberOfItems', { nTotal: nItems })
                  : _('sortedTableNumberOfFilteredItems', {
                      nFiltered: nItems,
                      nTotal: nAllItems,
                    })}
                {all ? (
                  <span>
                    {' '}
                    -{' '}
                    <span className='text-danger'>
                      {_('sortedTableAllItemsSelected')}
                    </span>
                  </span>
                ) : (
                  nSelectedItems !== 0 && (
                    <span>
                      {' '}
                      -{' '}
                      {_('sortedTableNumberOfSelectedItems', {
                        nSelected: nSelectedItems,
                      })}
                      {nSelectedItems === nVisibleItems &&
                        nSelectedItems < nItems && (
                          <Button
                            btnStyle='info'
                            className='ml-1'
                            onClick={this._selectAll}
                            size='small'
                          >
                            {_('sortedTableSelectAllItems')}
                          </Button>
                        )}
                    </span>
                  )
                )}
                {(nSelectedItems !== 0 || all) && (
                  <div className='pull-right'>
                    <ButtonGroup>
                      {map(groupedActions, (props, key) => (
                        <Action
                          {...props}
                          key={key}
                          items={this._getSelectedItems()}
                          userData={userData}
                        />
                      ))}
                    </ButtonGroup>
                  </div>
                )}
              </th>
            </tr>
            <tr>
              {(hasGroupedActions || onSelect !== undefined) && (
                <th
                  className='text-xs-center'
                  onClick={this._toggleNestedCheckbox}
                >
                  <Checkbox
                    onChange={this._selectAllVisibleItems}
                    checked={all || nSelectedItems !== 0}
                    indeterminate={
                      !all &&
                      nSelectedItems !== 0 &&
                      nSelectedItems !== nVisibleItems
                    }
                  />
                </th>
              )}
              {map(props.columns, (column, key) => (
                <ColumnHead
                  textAlign={column.textAlign}
                  columnId={key}
                  key={key}
                  name={column.name}
                  sort={
                    (column.sortCriteria !== undefined ||
                      column.valuePath !== undefined) &&
                    this._sort
                  }
                  sortIcon={
                    state.selectedColumn === key ? state.sortOrder : 'sort'
                  }
                />
              ))}
              {hasIndividualActions && <th />}
            </tr>
          </thead>
          <tbody>
            {nVisibleItems !== 0 ? (
              map(this._getVisibleItems(), this._renderItem)
            ) : (
              <tr>
                <td className='text-info text-xs-center' colSpan={nColumns}>
                  {_('sortedTableNoItems')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Container>
          <SingleLineRow>
            <Col mediumSize={8}>
              {displayPagination &&
                (paginationContainer !== undefined ? (
                  // Rebuild container function to refresh Portal component.
                  <Portal container={() => paginationContainer()}>
                    {paginationInstance}
                  </Portal>
                ) : (
                  paginationInstance
                ))}
            </Col>
            <Col mediumSize={4}>
              {filterContainer ? (
                <Portal container={() => filterContainer()}>
                  {filterInstance}
                </Portal>
              ) : (
                filterInstance
              )}
            </Col>
          </SingleLineRow>
        </Container>
      </div>
    )
  }
}
