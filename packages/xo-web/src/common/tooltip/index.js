import classNames from 'classnames'
import isString from 'lodash/isString'
import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'

import Component from '../base-component'
import getPosition from './get-position'

import styles from './index.css'

// ===================================================================

let instance

export class TooltipViewer extends Component {
  constructor() {
    super()

    this.state.place = 'top'
  }

  componentDidMount() {
    if (instance) {
      throw new Error('Tooltip viewer is a singleton!')
    }
    instance = this
  }

  componentWillUnmount() {
    instance = undefined
  }

  render() {
    const { className, content, place, show, style } = this.state

    return (
      <div
        className={classNames(
          show && content !== undefined
            ? styles.tooltipEnabled
            : styles.tooltipDisabled,
          className
        )}
        style={{
          marginTop:
            (place === 'top' && '-10px') || (place === 'bottom' && '10px'),
          marginLeft:
            (place === 'left' && '-10px') || (place === 'right' && '10px'),
          ...style,
        }}
      >
        {content}
      </div>
    )
  }
}

// ===================================================================

// Wrap disabled HTML element before wrapping it with Tooltip
// <Tooltip>
//   <div>
//     <MyComponent disabled />
//   </div>
// </Tooltip>
export default class Tooltip extends Component {
  static propTypes = {
    children: PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
    className: PropTypes.string,
    content: PropTypes.node,
    style: PropTypes.object,
    tagName: PropTypes.string,
  }

  componentDidMount() {
    this._addListeners()
  }

  componentWillUnmount() {
    this._removeListeners()
  }

  componentWillReceiveProps(props) {
    if (props.children !== this.props.children) {
      this._removeListeners()
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.children !== this.props.children) {
      this._addListeners()
    }
  }

  _addListeners() {
    const node = (this._node = ReactDOM.findDOMNode(this))

    node.addEventListener('mouseenter', this._showTooltip)
    node.addEventListener('mouseleave', this._hideTooltip)
    node.addEventListener('mousemove', this._updateTooltip)
  }

  _removeListeners() {
    const node = this._node
    this._hideTooltip()

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
      style: props.style,
    })
  }

  _hideTooltip = () => {
    instance.setState({ show: false })
  }

  _updateTooltip = event => {
    const node = ReactDOM.findDOMNode(instance)
    const result = getPosition(
      event,
      event.currentTarget,
      node,
      instance.state.place,
      'solid',
      {}
    )

    if (result.isNewState) {
      return instance.setState(result.newState, () =>
        this._updateTooltip(event)
      )
    }

    const { position } = result
    node.style.left = `${position.left}px`
    node.style.top = `${position.top}px`
  }

  render() {
    const { children } = this.props

    if (!children) {
      return <span />
    }

    if (isString(children)) {
      return <span>{children}</span>
    }

    return children
  }
}
