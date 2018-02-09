// FIXME: too low level, should be removed.

async function delete_ ({ vbd }) {
  await this.getXapi(vbd).deleteVbd(vbd)
}

delete_.params = {
  id: { type: 'string' },
}

delete_.resolve = {
  vbd: ['id', 'VBD', 'administrate'],
}

export { delete_ as delete }

// -------------------------------------------------------------------

export async function disconnect ({ vbd }) {
  const xapi = this.getXapi(vbd)
  await xapi.disconnectVbd(vbd._xapiRef)
}

disconnect.params = {
  id: { type: 'string' },
}

disconnect.resolve = {
  vbd: ['id', 'VBD', 'administrate'],
}

// -------------------------------------------------------------------

export async function connect ({ vbd }) {
  const xapi = this.getXapi(vbd)
  await xapi.connectVbd(vbd._xapiRef)
}

connect.params = {
  id: { type: 'string' },
}

connect.resolve = {
  vbd: ['id', 'VBD', 'administrate'],
}

// -------------------------------------------------------------------

export async function set ({ position, vbd }) {
  if (position !== undefined) {
    const xapi = this.getXapi(vbd)
    await xapi.call('VBD.set_userdevice', vbd._xapiRef, String(position))
  }
}

set.params = {
  // Identifier of the VBD to update.
  id: { type: 'string' },

  position: { type: ['string', 'number'], optional: true },
}

set.resolve = {
  vbd: ['id', 'VBD', 'administrate'],
}

// -------------------------------------------------------------------

export async function setBootable ({ vbd, bootable }) {
  const xapi = this.getXapi(vbd)

  await xapi.call('VBD.set_bootable', vbd._xapiRef, bootable)
}

setBootable.params = {
  vbd: { type: 'string' },
  bootable: { type: 'boolean' },
}

setBootable.resolve = {
  vbd: ['vbd', 'VBD', 'administrate'],
}
