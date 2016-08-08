import _ from 'intl'
import ceil from 'lodash/ceil'
import debounce from 'lodash/debounce'
import isEmpty from 'lodash/isEmpty'
import isFunction from 'lodash/isFunction'
import map from 'lodash/map'
import React from 'react'
import { Dropdown, MenuItem, Pagination } from 'react-bootstrap-4/lib'
import DropdownMenu from 'react-bootstrap-4/lib/DropdownMenu' // https://phabricator.babeljs.io/T6662 so Dropdown.Menu won't work like https://react-bootstrap.github.io/components.html#btn-dropdowns-custom
import DropdownToggle from 'react-bootstrap-4/lib/DropdownToggle' // https://phabricator.babeljs.io/T6662 so Dropdown.Toggle won't work https://react-bootstrap.github.io/components.html#btn-dropdowns-custom
import { Portal } from 'react-overlays'

import Component from '../base-component'
import Icon from '../icon'
import propTypes from '../prop-types'
import SingleLineRow from '../single-line-row'
import { BlockLink } from '../link'
import { Container, Col } from '../grid'
import { create as createMatcher } from '../complex-matcher'
import {
  createCounter,
  createFilter,
  createPager,
  createSelector,
  createSort
} from '../selectors'

import styles from './index.css'

// ===================================================================

@propTypes({
  filters: propTypes.object,
  nFilteredItems: propTypes.number.isRequired,
  nItems: propTypes.number.isRequired,
  onChange: propTypes.func.isRequired
})
class TableFilter extends Component {
  _cleanFilter = () => this._setFilter('')

  _setFilter = filterValue => {
    const { filter } = this.refs
    filter.value = filterValue
    filter.focus()
    this.props.onChange(filterValue)
  }

  _onChange = event => {
    this.props.onChange(event.target.value)
  }

  render () {
    const { props } = this

    return (
      <div className='input-group'>
        <span className='input-group-addon'>{props.nFilteredItems} / {props.nItems}</span>
        {isEmpty(props.filters)
          ? <span className='input-group-addon'><Icon icon='search' /></span>
          : <div className='input-group-btn'>
            <Dropdown id='filter'>
              <DropdownToggle bsStyle='info'>
                <Icon icon='search' />
              </DropdownToggle>
              <DropdownMenu>
                {map(props.filters, (filter, label) =>
                  <MenuItem key={label} onClick={() => this._setFilter(filter)}>
                    {_(label)}
                  </MenuItem>
                )}
              </DropdownMenu>
            </Dropdown>
          </div>}
        <input
          type='text'
          ref='filter'
          onChange={this._onChange}
          className='form-control'
        />
        <div className='input-group-btn'>
          <button className='btn btn-secondary' onClick={this._cleanFilter}>
            <Icon icon='clear-search' />
          </button>
        </div>
      </div>
    )
  }
}

// ===================================================================

@propTypes({
  columnId: propTypes.number.isRequired,
  name: propTypes.any.isRequired,
  sort: propTypes.func,
  sortIcon: propTypes.string
})
class ColumnHead extends Component {
  _sort = () => {
    const { props } = this
    props.sort(props.columnId)
  }

  render () {
    const { name, sortIcon } = this.props

    if (!this.props.sort) {
      return <th>{name}</th>
    }

    let className = styles.clickableColumn

    if (sortIcon === 'asc' || sortIcon === 'desc') {
      className += ' bg-info'
    }

    return (
      <th
        className={className}
        onClick={this._sort}
      >
        {name}
        <span className='pull-xs-right'>
          <Icon icon={sortIcon} />
        </span>
      </th>
    )
  }
}

// ===================================================================

const DEFAULT_ITEMS_PER_PAGE = 10

@propTypes({
  defaultColumn: propTypes.number,
  collection: propTypes.oneOfType([
    propTypes.array,
    propTypes.object
  ]).isRequired,
  columns: propTypes.arrayOf(propTypes.shape({
    name: propTypes.node.isRequired,
    itemRenderer: propTypes.func.isRequired,
    sortCriteria: propTypes.oneOfType([
      propTypes.func,
      propTypes.string
    ]),
    sortOrder: propTypes.string
  })).isRequired,
  filterContainer: propTypes.func,
  filters: propTypes.object,
  itemsPerPage: propTypes.number,
  paginationContainer: propTypes.func,
  rowLink: propTypes.oneOfType([
    propTypes.func,
    propTypes.string
  ]),
  userData: propTypes.any
})
export default class SortedTable extends Component {
  constructor (props) {
    super(props)

    this.state = {
      selectedColumn: props.defaultColumn || 0,
      itemsPerPage: props.itemsPerPage || DEFAULT_ITEMS_PER_PAGE
    }

    this._getSelectedColumn = () =>
      this.props.columns[this.state.selectedColumn]

    this._getTotalNumberOfItems = createCounter(
      () => this.props.collection
    )

    this._getAllItems = createSort(
      createFilter(
        () => this.props.collection,
        createSelector(
          () => this.state.filter || '',
          createMatcher
        )
      ),
      createSelector(
        () => this._getSelectedColumn().sortCriteria,
        () => this.props.userData,
        (sortCriteria, userData) =>
          (typeof sortCriteria === 'function')
            ? object => sortCriteria(object, userData)
            : sortCriteria
      ),
      () => this.state.sortOrder
    )

    this.state.activePage = 1

    this._getVisibleItems = createPager(
      this._getAllItems,
      () => this.state.activePage,
      this.state.itemsPerPage
    )
  }

  componentWillMount () {
    this.setState({
      sortOrder: this.props.columns[this.state.selectedColumn].sortOrder === 'desc' ? 'desc' : 'asc'
    })
  }

  componentDidMount () {
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
      sortOrder = state.sortOrder === 'desc'
        ? 'asc'
        : 'desc'
    } else {
      sortOrder = this.props.columns[columnId].sortOrder === 'desc'
        ? 'desc'
        : 'asc'
    }

    this.setState({
      selectedColumn: columnId,
      sortOrder
    })
  }

  _onPageSelection = (_, event) => this.setState({
    activePage: event.eventKey
  })

  _onFilterChange = debounce(filter => {
    this.setState({
      filter,
      activePage: 1
    })
  }, 500)

  render () {
    const { props, state } = this
    const {
      paginationContainer,
      filterContainer,
      filters,
      rowLink,
      userData
    } = props

    const nFilteredItems = this._getAllItems().length

    const paginationInstance = (
      <Pagination
        first
        last
        prev
        next
        ellipsis
        boundaryLinks
        maxButtons={10}
        items={ceil(nFilteredItems / state.itemsPerPage)}
        activePage={this.state.activePage}
        onSelect={this._onPageSelection}
      />
    )

    const filterInstance = (
      <TableFilter
        filters={filters}
        nFilteredItems={nFilteredItems}
        nItems={this._getTotalNumberOfItems()}
        onChange={this._onFilterChange}
      />
    )

    return (
      <div>
        <table className='table'>
          <thead className='thead-default'>
            <tr>
              {map(props.columns, (column, key) => (
                <ColumnHead
                  columnId={key}
                  key={key}
                  name={column.name}
                  sort={column.sortCriteria && this._sort}
                  sortIcon={state.selectedColumn === key ? state.sortOrder : 'sort'}
               />
              ))}
            </tr>
          </thead>
          <tbody>
            {map(this._getVisibleItems(), (item, i) => {
              const columns = map(props.columns, (column, key) => (
                <td key={key}>
                  {column.itemRenderer(item, userData)}
                </td>
              ))

              const { id = i } = item

              return rowLink
                ? <BlockLink
                  key={id}
                  tagName='tr'
                  to={isFunction(rowLink) ? rowLink(item, userData) : rowLink}
                >{columns}</BlockLink>
                : <tr key={id}>{columns}</tr>
            })}
          </tbody>
        </table>
        {(!paginationContainer || !filterContainer) && (
          <Container>
            <SingleLineRow>
              <Col mediumSize={8}>
                {paginationContainer
                  ? (
                  // Rebuild container function to refresh Portal component.
                  <Portal container={() => paginationContainer()}>
                    {paginationInstance}
                  </Portal>
                  ) : paginationInstance
                }
              </Col>
              <Col mediumSize={4}>
                {filterContainer
                  ? (
                  <Portal container={() => filterContainer()}>
                    {filterInstance}
                  </Portal>
                  ) : filterInstance
                }
              </Col>
            </SingleLineRow>
          </Container>
        )}
      </div>
    )
  }
}
