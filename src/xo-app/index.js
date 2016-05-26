import Component from 'base-component'
import cookies from 'cookies-js'
import React from 'react'
import { IntlProvider } from 'messages'
import { Notification } from 'notification'
// import {
//   keyHandler
// } from 'react-key-handler'
import { routes } from 'utils'

import About from './about'
import Backup from './backup'
import Dashboard from './dashboard'
import Home from './home'
import Host from './host'
import Menu from './menu'
import Modal, { alert } from 'modal'
import New from './new'
import Pool from './pool'
import Remote from './remote'
import Settings from './settings'
import Sr from './sr'
import User from './user'
import Vm from './vm'

@routes('home', {
  about: About,
  backup: Backup,
  dashboard: Dashboard,
  home: Home,
  'hosts/:id': Host,
  new: New,
  'pools/:id': Pool,
  remote: Remote,
  settings: Settings,
  'srs/:id': Sr,
  user: User,
  'vms/:id': Vm
})
export default class XoApp extends Component {
  displayOpenSourceDisclaimer () {
    const previousDisclaimer = cookies.get('previousDisclaimer')
    const now = Math.floor(Date.now() / 1e3)
    const oneWeekAgo = now - 7 * 24 * 3600
    if (!previousDisclaimer || previousDisclaimer < oneWeekAgo) {
      alert('Xen Orchestra from the sources', <div>
        <p>You are using XO from the sources! That's great for a personal/non-profit usage.</p>
        <p>If you are a company, it's better to use it with <a href='https://xen-orchestra.com/#!/xoa'>XOA (turnkey appliance)</a> and our dedicated pro support!</p>
        <p>This version is <strong>not bundled with any support nor updates</strong>. Use it with caution for critical tasks.</p>
      </div>)
      cookies.set('previousDisclaimer', now)
    }
  }

  componentDidMount () {
    this.refs.bodyWrapper.style.minHeight = this.refs.menu.getWrappedInstance().height + 'px'
    this.displayOpenSourceDisclaimer()
  }

  render () {
    return <IntlProvider>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        minHeight: '100vh',
        /* FIXME: 'The size of `xo-main` matches the size of the window thanks to the',
         * flex growing feature.,
         * Therefore, when there is a scrollbar on the right side,,
         * `xo-main` is too large (since the scrollbar uses a few,
         * pixels) which makes an almost useless horizontal scrollbar appear.,
         */
        overflow: 'hidden'
      }}>
        <Menu ref='menu' />
        <div ref='bodyWrapper' style={{flex: '1', padding: '1em'}}>
          {this.props.children}
        </div>
        <Modal />
        <Notification />
      </div>
    </IntlProvider>
  }
}
