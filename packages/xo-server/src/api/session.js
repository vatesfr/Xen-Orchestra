import { deprecate } from 'util'

import { getUserPublicProperties } from '../utils'

// ===================================================================

export async function signIn(credentials) {
  const { session } = this

  const { user, expiration } = await this.authenticateUser(credentials, {
    ip: session.get('user_ip', undefined),
  })

  session.set('user_id', user.id)

  if (expiration === undefined) {
    session.unset('expiration')
  } else {
    session.set('expiration', expiration)
  }

  return getUserPublicProperties(user)
}

signIn.description = 'sign in'
signIn.permission = null // user does not need to be authenticated

// -------------------------------------------------------------------

export const signInWithPassword = deprecate(signIn, 'use session.signIn() instead')

signInWithPassword.params = {
  email: { type: 'string' },
  password: { type: 'string' },
}
signInWithPassword.permission = null // user does not need to be authenticated

// -------------------------------------------------------------------

export const signInWithToken = deprecate(signIn, 'use session.signIn() instead')

signInWithToken.params = {
  token: { type: 'string' },
}
signInWithToken.permission = null // user does not need to be authenticated

// -------------------------------------------------------------------

export function signOut() {
  this.session.unset('user_id')
}

signOut.description = 'sign out the user from the current session'

// -------------------------------------------------------------------

export async function getUser() {
  const userId = this.session.get('user_id')

  return userId === undefined ? null : getUserPublicProperties(await this.getUser(userId))
}

getUser.description = 'return the currently connected user'
getUser.permission = null // user does not need to be authenticated
