import React, {
  Component
} from 'react'
// import {
//   keyHandler
// } from 'react-key-handler'
import {
  connectStore,
  propTypes,
  routes
} from 'utils'
import { Button } from 'react-bootstrap-4/lib'
import { Row, Col } from 'grid'
import Icon from 'icon'

import About from './about'
import Home from './home'
import SignIn from './sign-in'
import Vm from './vm'

import Menu from './menu'
import Navbar from './navbar'

@routes(Home, [
  {
    path: 'about',
    component: About
  },
  {
    ...Vm.route,
    path: 'vms/:id'
  }
])
@connectStore([
  'user'
])
@propTypes({
  children: propTypes.node.isRequired
})
export default class XoApp extends Component {
  componentWillMount () {
    this.setState({collapsed: false})
  }
  render () {
    const {
      children,
      user,
      signIn,
      selectLang
    } = this.props

    return <div><Navbar selectLang={(lang) => selectLang(lang)} />
      <div className='container-fluid'>
        <Row>
          {this.state.collapsed ? null : <Menu />}
          <Col smallSize={12}>
            {/* 3em: room for the navbar - 10em: room for the left side menu */}
            <div className='main' style={{marginTop: '60px', marginLeft: !this.state.collapsed && '10em'}}>
              <Button style={{marginLeft: '0px', borderRadius: '0px'}} bsStyle='secondary' onClick={() => this.setState({...this.state, collapsed: !this.state.collapsed})}>
                <Icon icon='menu-collapse' />
              </Button>
              {
                user == null
                  ? <SignIn onSubmit={signIn} />
                  : children
              }
            </div>
          </Col>
        </Row>
      </div>
    </div>
  }
}
