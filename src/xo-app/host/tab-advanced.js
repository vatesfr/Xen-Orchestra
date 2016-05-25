import _ from 'messages'
import CopyToClipboard from 'react-copy-to-clipboard'
import Icon from 'icon'
import React from 'react'
import TabButton from 'tab-button'
import { Toggle } from 'form'
import { enableHost, disableHost, restartHost } from 'xo'
import { FormattedRelative } from 'react-intl'
import { Row, Col } from 'grid'

const forceReboot = host => restartHost(host, true)

export default ({
  host
}) => <div>
  <Row>
    <Col smallSize={12} className='text-xs-right'>
      {host.power_state === 'Running' &&
        <TabButton
          btnStyle='warning'
          handler={forceReboot}
          handlerParam={host}
          icon='host-force-reboot'
          labelId='forceRebootHostLabel'
        />
      }
      {host.enabled
        ? <TabButton
          btnStyle='warning'
          handler={disableHost}
          handlerParam={host}
          icon='host-disable'
          labelId='disableHostLabel'
        />
        : <TabButton
          btnStyle='success'
          handler={enableHost}
          handlerParam={host}
          icon='host-enable'
          labelId='enableHostLabel'
        />
      }
    </Col>
  </Row>
  <Row>
    <Col smallSize={12}>
      <h3>{_('xenSettingsLabel')}</h3>
      <table className='table'>
        <tbody>
          <tr>
            <th>{_('uuid')}</th>
            <td className='copy-to-clipboard'>
              {host.uuid}
              {' '}
              <CopyToClipboard text={host.uuid}>
                <button className='btn btn-sm btn-secondary btn-copy-to-clipboard'>
                  <Icon icon='clipboard' />
                </button>
              </CopyToClipboard>
            </td>
          </tr>
          <tr>
            <th>{_('hostAddress')}</th>
            <td>{host.address}</td>
          </tr>
          <tr>
            <th>{_('hostStatus')}</th>
            <td><Toggle defaultValue={host.enabled} onChange={value => value ? enableHost(host) : disableHost(host)} /></td>
          </tr>
          <tr>
            <th>{_('hostPowerOnMode')}</th>
            <td>
              <Toggle defaultValue={host.powerOnMode} disabled />
            </td>
          </tr>
          <tr>
            <th>{_('hostStartedSince')}</th>
            <td>{_('started', { ago: <FormattedRelative value={host.startTime * 1000} /> })}</td>
          </tr>
          <tr>
            <th>{_('hostStackStartedSince')}</th>
            <td>{_('started', { ago: <FormattedRelative value={host.agentStartTime * 1000} /> })}</td>
          </tr>
          <tr>
            <th>{_('hostXenServerVersion')}</th>
            <td>{host.license_params.sku_marketing_name} {host.version} ({host.license_params.sku_type})</td>
          </tr>
          <tr>
            <th>{_('hostBuildNumber')}</th>
            <td>{host.build}</td>
          </tr>
          <tr>
            <th>{_('hostIscsiName')}</th>
            <td>
              {host.iSCSI_name}
              {' '}
              <CopyToClipboard text={host.iSCSI_name}>
                <button className='btn btn-sm btn-secondary btn-copy-to-clipboard'>
                  <Icon icon='clipboard' />
                </button>
              </CopyToClipboard>
            </td>
          </tr>
        </tbody>
      </table>
      <br />
      <h3>{_('hardwareHostSettingsLabel')}</h3>
      <table className='table'>
        <tbody>
          <tr>
            <th>{_('hostCpusModel')}</th>
            <td>{host.CPUs.modelname}</td>
          </tr>
          <tr>
            <th>{_('hostCpusNumber')}</th>
            <td>{host.cpus.cores} ({host.cpus.sockets})</td>
          </tr>
          <tr>
            <th>{_('hostManufacturerinfo')}</th>
            <td>{host.bios_strings['system-manufacturer']} ({host.bios_strings['system-product-name']})</td>
          </tr>
          <tr>
            <th>{_('hostBiosinfo')}</th>
            <td>{host.bios_strings['bios-vendor']} ({host.bios_strings['bios-version']})</td>
          </tr>
        </tbody>
      </table>
      <br />
      <h3>{_('licenseHostSettingsLabel')}</h3>
      <table className='table'>
        <tbody>
          <tr>
            <th>{_('hostLicenseType')}</th>
            <td>{host.license_params.sku_type}</td>
          </tr>
          <tr>
            <th>{_('hostLicenseSocket')}</th>
            <td>{host.license_params.sockets}</td>
          </tr>
          <tr>
            <th>{_('hostLicenseExpiry')}</th>
            <td>
              {host.license_params.expiry}
            </td>
          </tr>
        </tbody>
      </table>
    </Col>
  </Row>
</div>
