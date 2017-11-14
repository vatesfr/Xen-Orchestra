import { messages } from 'intl'
import DocumentTitle from 'react-document-title'
import React from 'react'
import { injectIntl } from 'react-intl'

import styles from './index.css'

const Page = ({
  children,
  collapsedHeader,
  formatTitle,
  header,
  intl,
  title,
}) => {
  const { formatMessage } = intl

  const content = (
    <div className={styles.container}>
      {!collapsedHeader && (
        <nav className={'page-header ' + styles.header}>{header}</nav>
      )}
      <div className={styles.content}>{children}</div>
    </div>
  )

  return title ? (
    <DocumentTitle title={formatTitle ? formatMessage(messages[title]) : title}>
      {content}
    </DocumentTitle>
  ) : (
    content
  )
}

Page.propTypes = {
  children: React.PropTypes.node,
  collapsedHeader: React.PropTypes.bool,
  formatTitle: React.PropTypes.bool,
  header: React.PropTypes.node,
  title: React.PropTypes.string,
}

export default injectIntl(Page)
