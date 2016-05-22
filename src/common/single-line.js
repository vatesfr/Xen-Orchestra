import React, { cloneElement } from 'react'
import { propTypes } from 'utils'

const SINGLE_LINE_STYLE = { display: 'flex' }
const COL_STYLE = { margin: 'auto' }

const SingleLine = propTypes({
  className: propTypes.string
})(({
  children,
  className
}) => <div
  className={`${className || ''} row`}
  style={SINGLE_LINE_STYLE}
>
  {React.Children.map(children, child => cloneElement(child, { style: COL_STYLE }))}
</div>)
export { SingleLine as default }
