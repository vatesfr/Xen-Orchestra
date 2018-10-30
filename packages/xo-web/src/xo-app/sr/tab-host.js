import _ from 'intl'
import Link from 'link'
import React from 'react'
import SortedTable from 'sorted-table'
import StateButton from 'state-button'
import { Text } from 'editable'
import { noop } from 'utils'
import { confirm } from 'modal'
import { isEmpty, some } from 'lodash'
import { Container, Row, Col } from 'grid'
import { editHost, connectPbd, disconnectPbd, deletePbd, deletePbds } from 'xo'

const forgetHost = pbd =>
  confirm({
    title: _('forgetHostFromSrModalTitle'),
    body: _('forgetHostFromSrModalMessage'),
  }).then(() => deletePbd(pbd), noop)

const forgetHosts = pbds =>
  confirm({
    title: _('forgetHostsFromSrModalTitle', { nPbds: pbds.length }),
    body: _('forgetHostsFromSrModalMessage', { nPbds: pbds.length }),
  }).then(() => deletePbds(pbds), noop)

const HOST_COLUMNS = [
  {
    name: _('hostNameLabel'),
    itemRenderer: (pbd, hosts) => {
      const host = hosts[pbd.host]
      return (
        <Link to={`/hosts/${host.id}`}>
          <Text
            value={host.name_label}
            onChange={value => editHost(host, { name_label: value })}
            useLongClick
          />
        </Link>
      )
    },
    sortCriteria: (pbd, hosts) => hosts[pbd.host].name_label,
  },
  {
    name: _('hostDescription'),
    itemRenderer: (pbd, hosts) => {
      const host = hosts[pbd.host]
      return (
        <Text
          value={host.name_description}
          onChange={value => editHost(host, { name_description: value })}
        />
      )
    },
    sortCriteria: (pbd, hosts) => hosts[pbd.host].name_description,
  },
  {
    name: _('pbdStatus'),
    itemRenderer: pbd => (
      <StateButton
        disabledLabel={_('pbdStatusDisconnected')}
        disabledHandler={connectPbd}
        disabledTooltip={_('pbdConnect')}
        enabledLabel={_('pbdStatusConnected')}
        enabledHandler={disconnectPbd}
        enabledTooltip={_('pbdDisconnect')}
        handlerParam={pbd}
        state={pbd.attached}
      />
    ),
    sortCriteria: 'attached',
  },
]

const HOST_ACTIONS = [
  {
    disabled: pbds => some(pbds, 'attached'),
    handler: forgetHosts,
    icon: 'sr-forget',
    individualDisabled: pbd => pbd.attached,
    individualHandler: forgetHost,
    label: _('pbdForget'),
  },
]

export default ({ hosts, pbds }) => (
  <Container>
    <Row>
      <Col>
        {!isEmpty(hosts) ? (
          <SortedTable
            actions={HOST_ACTIONS}
            collection={pbds}
            userData={hosts}
            columns={HOST_COLUMNS}
          />
        ) : (
          <h4 className='text-xs-center'>{_('noHost')}</h4>
        )}
      </Col>
    </Row>
  </Container>
)
