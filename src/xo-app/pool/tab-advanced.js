import _ from 'messages'
import CopyToClipboard from 'react-copy-to-clipboard'
import Icon from 'icon'
import React from 'react'
import { Container, Row, Col } from 'grid'

export default ({
  pool
}) => <Container>
  <Row>
    <Col mediumSize={12}>
      <h3>{_('xenSettingsLabel')}</h3>
      <table className='table'>
        <tbody>
          <tr>
            <th>{_('uuid')}</th>
            <td className='copy-to-clipboard'>
              {pool.uuid}
              {' '}
              <CopyToClipboard text={pool.uuid}>
                <button className='btn btn-sm btn-secondary btn-copy-to-clipboard'>
                  <Icon icon='clipboard' />
                </button>
              </CopyToClipboard>
            </td>
          </tr>
          <tr>
            <th>{_('poolHaStatus')}</th>
            <td>
              {pool.HA_enabled
                ? _('poolHaEnabled')
                : _('poolHaDisabled')
              }
            </td>
          </tr>
        </tbody>
      </table>
    </Col>
  </Row>
</Container>
