import classNames from 'classnames'
import React from 'react'
import ReactDOM from 'react-dom'

import Component from '../base-component'
import getPosition from './get-position'
import propTypes from '../prop-types'

import styles from './index.css'

// ===================================================================

let instance

export class TooltipViewer extends Component {
  constructor () {
    super()

    if (instance) {
      throw new Error('Tooltip viewer is a singleton!')
    }
    instance = this
    this.state.place = 'top'
  }

  render () {
    const {
      className,
      content,
      place,
      show,
      style
    } = this.state

    return (
      <div
        className={classNames(show ? styles.tooltipEnabled : styles.tooltipDisabled, className)}
        style={{
          marginTop: (place === 'top' && '-10px') || (place === 'bottom' && '10px'),
          marginLeft: (place === 'left' && '-10px') || (place === 'right' && '10px'),
          ...style
        }}
      >
        {content}
      </div>
    )
  }
}

// ===================================================================

@propTypes({
  children: propTypes.any.isRequired,
  className: propTypes.string,
  content: propTypes.any.isRequired,
  style: propTypes.object,
  tagName: propTypes.string
})
export default class Tooltip extends Component {
  componentDidMount () {
    this._addListeners()
  }

  componentWillUnmount () {
    this._removeListeners()
  }

  componentWillReceiveProps (props) {
    if (props.children !== this.props.children) {
      this._removeListeners()
    }
  }

  componentDidUpdate (prevProps) {
    if (prevProps.children !== this.props.children) {
      this._addListeners()
    }
  }

  _addListeners () {
    const node = this._node = ReactDOM.findDOMNode(this)

    node.addEventListener('mouseenter', this._showTooltip)
    node.addEventListener('mouseleave', this._hideTooltip)
    node.addEventListener('mousemove', this._updateTooltip)
  }

  _removeListeners () {
    const node = this._node

    if (!node) {
      return
    }

    node.removeEventListener('mouseenter', this._showTooltip)
    node.removeEventListener('mouseleave', this._hideTooltip)
    node.removeEventListener('mousemove', this._updateTooltip)

    this._node = null
  }

  _showTooltip = () => {
    const { props } = this

    instance.setState({
      className: props.className,
      content: props.content,
      show: true,
      style: props.style
    })
  }

  _hideTooltip = () => {
    instance.setState({ show: false })
  }

  _updateTooltip = event => {
    const node = ReactDOM.findDOMNode(instance)
    const result = getPosition(event, event.currentTarget, node, instance.state.place, 'float', {})

    if (result.isNewState) {
      return instance.setState(result.newState, () => this._updateTooltip(event))
    }

    const { position } = result
    node.style.left = `${position.left}px`
    node.style.top = `${position.top}px`
  }

  render () {
    return this.props.children
  }
}
