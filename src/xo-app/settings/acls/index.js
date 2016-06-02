import ActionButton from 'action-button'
import forEach from 'lodash/forEach'
import isEmpty from 'lodash/isEmpty'
import keyBy from 'lodash/keyBy'
import map from 'lodash/map'
import orderBy from 'lodash/orderBy'
import React, { Component } from 'react'
import { error } from 'notification'
import { renderXoItemFromId } from 'render-xo-item'
import { SelectHighLevelObjects, SelectRole, SelectSubject } from 'select-objects'

import {
  addAcl,
  removeAcl,
  subscribeAcls,
  subscribeGroups,
  subscribeUsers
} from 'xo'

class SubjectDisplay extends Component {
  constructor (props) {
    super(props)
    this.state = {
      groups: {},
      users: {}
    }
  }

  componentWillMount () {
    const unsubscribeUsers = subscribeUsers(users => {
      users = keyBy(users, 'id')
      this.setState({
        users
      })
    })

    const unsubscribeGroups = subscribeGroups(groups => {
      groups = keyBy(groups, 'id')
      this.setState({
        groups
      })
    })

    this.componentWillUnmount = () => {
      unsubscribeGroups()
      unsubscribeUsers()
    }
  }
  render () {
    const { id } = this.props
    const {
      groups,
      users
    } = this.state
    return <span>{id && (users[id] && users[id].email) || (groups[id] && groups[id].name)}</span>
  }
}

export default class Acls extends Component {
  constructor (props) {
    super(props)
    this.state = {
      subjects: [],
      objects: [],
      role: undefined
    }
  }

  componentWillMount () {
    const unsubscribeAcls = subscribeAcls(acls => this.setState({acls: orderBy(acls, ['subject', 'object'])}))

    this.componentWillUnmount = () => {
      unsubscribeAcls()
    }
  }

  _handleSelectObjects = objects => this.setState({objects})
  _handleSelectRole = role => this.setState({role})
  _handleSelectSubject = subjects => this.setState({subjects})

  _handleRoleChange = (role, subject, object, action) => removeAcl({subject, object, action}).then(() => addAcl({subject, object, action: role.id}))

  _addAcl = async () => {
    const {
      subjects,
      objects,
      role
    } = this.state
    try {
      const promises = []
      forEach(subjects, subject => promises.push(...map(objects, object => addAcl({subject: subject.id, object: object.id, action: role.id}))))
      await Promise.all(promises)
    } catch (err) {
      error('Add ACL(s)', err.message || String(err))
    }
  }

  _removeAcl = async ({subject, object, action}) => removeAcl({subject, object, action}).catch(err => error('Remove ACL', err.message || String(err)))

  render () {
    const {
      acls,
      objects,
      role,
      subjects
    } = this.state

    return <div>
      <form>
        <div className='form-group'>
          <SelectSubject multi onChange={this._handleSelectSubject} />
        </div>
        <div className='form-group'>
          <SelectHighLevelObjects multi onChange={this._handleSelectObjects} />
        </div>
        <div className='form-group'>
          <SelectRole onChange={this._handleSelectRole} />
        </div>
        <ActionButton icon='add' btnStyle='success' handler={this._addAcl} disabled={isEmpty(subjects) || !role || isEmpty(objects)}>Create</ActionButton>
      </form>
      <br />
      <table className='table'>
        <thead>
          <tr>
            <th>User/Group</th>
            <th>Object</th>
            <th>Role</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {isEmpty(acls) &&
            <tr><td><em>No Acls found</em></td></tr>
          }
          {map(acls, (acl, index) =>
            <tr key={index}>
              <td><SubjectDisplay id={acl.subject} /></td>
              <td>{renderXoItemFromId(acl.object)}</td>
              <td>{acl.action}</td>
              <td><SelectRole onChange={role => this._handleRoleChange(role, acl.subject, acl.object, acl.action)} placeholder='Change Role' /></td>
              <td><ActionButton icon='delete' btnStyle='danger' handler={this._removeAcl} handlerParam={{subject: acl.subject, object: acl.object, action: acl.action}} /></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  }
}
