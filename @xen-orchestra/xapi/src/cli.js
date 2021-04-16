#!/usr/bin/env node

const { Xapi } = require('./')
require('xen-api/dist/cli')
  .default(opts => new Xapi({ ignoreNobakVdis: true, ...opts }))
  .catch(console.error.bind(console, 'FATAL'))
