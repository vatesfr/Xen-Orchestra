import createLogger from '@xen-orchestra/log'
import humanFormat from 'human-format'
import moment from 'moment-timezone'
import { forEach, groupBy, startCase } from 'lodash'
import pkg from '../package'

const logger = createLogger('xo:xo-server-backup-reports')

export const configurationSchema = {
  type: 'object',

  properties: {
    toMails: {
      type: 'array',
      title: 'mails',
      description: 'an array of recipients (mails)',

      items: {
        type: 'string',
      },
      minItems: 1,
    },
    toXmpp: {
      type: 'array',
      title: 'xmpp address',
      description: 'an array of recipients (xmpp)',

      items: {
        type: 'string',
      },
      minItems: 1,
    },
  },
}

export const testSchema = {
  type: 'object',

  properties: {
    runId: {
      type: 'string',
      description: `<a href="https://xen-orchestra.com/docs/backups.html#backups-execution" rel="noopener noreferrer" target="_blank">job's runId</a>`,
    },
  },

  additionalProperties: false,
  required: ['runId'],
}

// ===================================================================

const INDENT = '  '
const UNKNOWN_ITEM = 'Unknown'

const ICON_FAILURE = '🚨'
const ICON_INTERRUPTED = '⚠️'
const ICON_SKIPPED = '⏩'
const ICON_SUCCESS = '✔'
const ICON_WARNING = '⚠️'

const STATUS_ICON = {
  failure: ICON_FAILURE,
  interrupted: ICON_INTERRUPTED,
  skipped: ICON_SKIPPED,
  success: ICON_SUCCESS,
}

const DATE_FORMAT = 'dddd, MMMM Do YYYY, h:mm:ss a'
const createDateFormatter = timezone =>
  timezone !== undefined
    ? timestamp =>
        moment(timestamp)
          .tz(timezone)
          .format(DATE_FORMAT)
    : timestamp => moment(timestamp).format(DATE_FORMAT)

const formatDuration = milliseconds => moment.duration(milliseconds).humanize()

const formatMethod = method => startCase(method.slice(method.indexOf('.') + 1))

const formatSize = bytes =>
  humanFormat(bytes, {
    scale: 'binary',
    unit: 'B',
  })

const formatSpeed = (bytes, milliseconds) =>
  milliseconds > 0
    ? humanFormat((bytes * 1e3) / milliseconds, {
        scale: 'binary',
        unit: 'B/s',
      })
    : 'N/A'

const NO_VMS_MATCH_THIS_PATTERN = 'no VMs match this pattern'
const NO_SUCH_OBJECT_ERROR = 'no such object'
const UNHEALTHY_VDI_CHAIN_ERROR = 'unhealthy VDI chain'
const UNHEALTHY_VDI_CHAIN_MESSAGE =
  '[(unhealthy VDI chain) Job canceled to protect the VDI chain](https://xen-orchestra.com/docs/backup_troubleshooting.html#vdi-chain-protection)'

const isSkippedError = error =>
  error.message === UNHEALTHY_VDI_CHAIN_ERROR ||
  error.message === NO_SUCH_OBJECT_ERROR

// ===================================================================

const TITLE_BY_STATUS = {
  failure: n => `## ${n} Failure${n === 1 ? '' : 's'}`,
  interrupted: n => `## ${n} Interrupt${n === 1 ? '' : 's'}`,
  skipped: n => `## ${n} Skip${n === 1 ? '' : 's'}`,
  success: n => `## ${n} Success${n === 1 ? '' : 'es'}`,
}

const getTemporalDataMarkdown = (end, start, formatDate) => {
  const markdown = [`- **Start time**: ${formatDate(start)}`]
  if (end !== undefined) {
    markdown.push(`- **End time**: ${formatDate(end)}`)
    const duration = end - start
    if (duration >= 1) {
      markdown.push(`- **Duration**: ${formatDuration(duration)}`)
    }
  }
  return markdown
}

const getWarningsMarkdown = warnings =>
  warnings.map(({ message }) => `- **${ICON_WARNING} ${message}**`)

const getErrorMarkdown = task => {
  let message
  if (
    task.status === 'success' ||
    (message = task.result?.message ?? task.result?.code) === undefined
  ) {
    return
  }

  const label = task.status === 'skipped' ? 'Reason' : 'Error'
  return `- **${label}**: ${message}`
}

const getPoolMarkdown = (task, { formatDate }) => {
  const { pool, poolMaster = {} } = task.data

  const name = pool.name_label || poolMaster.name_label || UNKNOWN_ITEM
  const body = [
    `- **UUID**: ${pool.uuid}`,
    ...getTemporalDataMarkdown(task.end, task.start, formatDate),
  ]

  const error = getErrorMarkdown(task)
  if (error !== undefined) {
    body.push(error)
  }

  return {
    body,
    title: `[pool] ${name}`,
  }
}

const getXoMarkdown = (task, { formatDate, jobName }) => {
  const body = getTemporalDataMarkdown(task.end, task.start, formatDate)

  const error = getErrorMarkdown(task)
  if (error !== undefined) {
    body.push(error)
  }

  return { body, title: `[XO] ${jobName}` }
}

const getRemoteMarkdown = async (task, { formatDate, xo }) => {
  const id = task.data.id

  const name = await xo.getRemote(id).then(
    ({ name }) => name,
    error => {
      logger.warn(error)
      return UNKNOWN_ITEM
    }
  )
  const body = [
    `- **ID**: ${id}`,
    ...getTemporalDataMarkdown(task.end, task.start, formatDate),
  ]

  const error = getErrorMarkdown(task)
  if (error !== undefined) {
    body.push(error)
  }

  return {
    body,
    title: `[remote] ${name}`,
  }
}

const getMarkdown = async (task, props) => {
  const type = task.data?.type
  if (type === 'pool') {
    return getPoolMarkdown(task, props)
  }

  if (type === 'xo') {
    return getXoMarkdown(task, props)
  }

  if (type === 'remote') {
    return getRemoteMarkdown(task, props)
  }
}

const getSpaceByLevel = level => INDENT.repeat(level)

const arrayToMarkdown = (array, level) => {
  const space = getSpaceByLevel(level)
  return `${space}${array.join(`\n${space}`)}`
}

// ===================================================================

class BackupReportsXoPlugin {
  constructor(xo) {
    this._xo = xo
    this._report = this._wrapper.bind(this)
  }

  configure({ toMails, toXmpp }) {
    this._mailsReceivers = toMails
    this._xmppReceivers = toXmpp
  }

  load() {
    this._xo.on('job:terminated', this._report)
  }

  async test({ runId }) {
    const xo = this._xo

    const log = await xo.getBackupNgLogs(runId)
    if (log === undefined) {
      throw new Error(`no log found with runId=${JSON.stringify(runId)}`)
    }

    const job = await xo.getJob(log.jobId)
    return job.type === 'backup'
      ? this._backupNgListener(log, undefined, runId, true)
      : this._metadataBackupListener(log, undefined, runId, true)
  }

  unload() {
    this._xo.removeListener('job:terminated', this._report)
  }

  async _wrapper(status, job, schedule, runJobId) {
    const xo = this._xo

    try {
      if (job.type === 'backup' || job.type === 'metadataBackup') {
        const log = await xo.getBackupNgLogs(runJobId)
        if (log === undefined) {
          throw new Error(`no log found with runId=${JSON.stringify(runJobId)}`)
        }

        const reportWhen = log.data.reportWhen
        if (
          reportWhen === 'never' ||
          (reportWhen === 'failure' && log.status === 'success')
        ) {
          return
        }

        return job.type === 'backup'
          ? this._backupNgListener(log, schedule, runJobId)
          : this._metadataBackupListener(log, schedule, runJobId)
      }

      return this._listener(status, job, schedule, runJobId)
    } catch (error) {
      logger.warn(error)
    }
  }

  async _metadataBackupListener(log, schedule, runJobId, test) {
    const xo = this._xo

    const formatDate = createDateFormatter(
      schedule?.timezone ??
        (await xo.getSchedule(log.scheduleId).then(
          schedule => schedule.timezone,
          error => {
            logger.warn(error)
          }
        ))
    )

    const tasksByStatus = groupBy(log.tasks, 'status')
    const n = log.tasks?.length ?? 0
    const nSuccesses = tasksByStatus.success?.length ?? 0

    if (!test && log.data.reportWhen === 'failure') {
      delete tasksByStatus.success
    }

    // header
    const markdown = [
      `##  Global status: ${log.status}`,
      '',
      `- **Job ID**: ${log.jobId}`,
      `- **Job name**: ${log.jobName}`,
      `- **Run ID**: ${runJobId}`,
      ...getTemporalDataMarkdown(log.end, log.start, formatDate),
      n !== 0 && `- **Successes**: ${nSuccesses} / ${n}`,
      log.warnings !== undefined &&
        getWarningsMarkdown(log.warnings).join('\n'),
      getErrorMarkdown(log),
    ]

    const nagiosText = []

    // body
    for (const status in tasksByStatus) {
      const tasks = tasksByStatus[status]

      // tasks header
      markdown.push('---', '', TITLE_BY_STATUS[status](tasks.length))

      // tasks body
      for (const task of tasks) {
        const taskMarkdown = await getMarkdown(task, {
          formatDate,
          jobName: log.jobName,
        })
        if (taskMarkdown === undefined) {
          continue
        }

        const { title, body } = taskMarkdown
        markdown.push(
          '',
          `### ${title}`,
          '',
          arrayToMarkdown(body, 1),
          task.warning !== undefined &&
            arrayToMarkdown(getWarningsMarkdown(task.warnings), 1)
        )

        if (task.status !== 'success') {
          nagiosText.push(`[${task.status}] ${title}`)
        }

        for (const subTask of task.tasks ?? []) {
          const taskMarkdown = await getMarkdown(subTask, { formatDate, xo })
          if (taskMarkdown === undefined) {
            continue
          }

          const icon = STATUS_ICON[subTask.status]
          const { title, body } = taskMarkdown
          markdown.push(
            `${getSpaceByLevel(2)}- **${title}** ${icon}`,
            arrayToMarkdown(body, 3),
            subTask.warnings !== undefined &&
              arrayToMarkdown(getWarningsMarkdown(subTask.warnings), 3)
          )
        }
      }
    }

    // footer
    markdown.push('---', '', `*${pkg.name} v${pkg.version}*`)

    return this._sendReport({
      subject: `[Xen Orchestra] ${log.status} − Metadata backup report for ${
        log.jobName
      } ${STATUS_ICON[log.status]}`,
      markdown: markdown.filter(_ => typeof _ === 'string').join('\n'),
      nagiosStatus: log.status === 'success' ? 0 : 2,
      nagiosMarkdown:
        log.status === 'success'
          ? `[Xen Orchestra] [Success] Metadata backup report for ${
              log.jobName
            }`
          : `[Xen Orchestra] [${log.status}] Metadata backup report for ${
              log.jobName
            } - ${nagiosText.join(' ')}`,
    })
  }

  async _backupNgListener(log, schedule, runJobId, test) {
    const xo = this._xo

    const { reportWhen, mode } = log.data || {}

    if (schedule === undefined) {
      schedule = await xo.getSchedule(log.scheduleId)
    }

    const jobName = (await xo.getJob(log.jobId, 'backup')).name
    const formatDate = createDateFormatter(schedule.timezone)

    const errorMarkdown = getErrorMarkdown(log)
    if (errorMarkdown !== undefined) {
      const markdown = [
        `##  Global status: ${log.status}`,
        '',
        `- **Job ID**: ${log.jobId}`,
        `- **Run ID**: ${runJobId}`,
        `- **mode**: ${mode}`,
        ...getTemporalDataMarkdown(log.end, log.start, formatDate),
        `- **Error**: ${errorMarkdown}`,
      ]
      if (log.warnings !== undefined) {
        markdown.push(...getWarningsMarkdown(log.warnings))
      }
      markdown.push('---', '', `*${pkg.name} v${pkg.version}*`)
      return this._sendReport({
        subject: `[Xen Orchestra] ${
          log.status
        } − Backup report for ${jobName} ${STATUS_ICON[log.status]}`,
        markdown: markdown.join('\n'),
        nagiosStatus: 2,
        nagiosMarkdown: `[Xen Orchestra] [${
          log.status
        }] Backup report for ${jobName} - Error : ${log.result.message}`,
      })
    }

    const failedVmsText = []
    const skippedVmsText = []
    const successfulVmsText = []
    const interruptedVmsText = []
    const nagiosText = []

    let globalMergeSize = 0
    let globalTransferSize = 0
    let nFailures = 0
    let nSkipped = 0
    let nInterrupted = 0
    for (const taskLog of log.tasks) {
      if (!test && taskLog.status === 'success' && reportWhen === 'failure') {
        continue
      }

      const vmId = taskLog.data.id
      let vm
      try {
        vm = xo.getObject(vmId)
      } catch (e) {}
      const text = [
        `### ${vm !== undefined ? vm.name_label : 'VM not found'}`,
        '',
        `- **UUID**: ${vm !== undefined ? vm.uuid : vmId}`,
        ...getTemporalDataMarkdown(taskLog.end, taskLog.start, formatDate),
      ]
      if (taskLog.warnings !== undefined) {
        text.push(...getWarningsMarkdown(taskLog.warnings))
      }

      const failedSubTasks = []
      const snapshotText = []
      const srsText = []
      const remotesText = []

      for (const subTaskLog of taskLog.tasks ?? []) {
        if (
          subTaskLog.message !== 'export' &&
          subTaskLog.message !== 'snapshot'
        ) {
          continue
        }

        const icon = STATUS_ICON[subTaskLog.status]
        const type = subTaskLog.data?.type
        const errorMarkdown = getErrorMarkdown(subTaskLog)

        if (subTaskLog.message === 'snapshot') {
          snapshotText.push(
            `- **Snapshot** ${icon}`,
            arrayToMarkdown(
              getTemporalDataMarkdown(
                subTaskLog.end,
                subTaskLog.start,
                formatDate
              ),
              1
            )
          )
        } else if (type === 'remote') {
          const id = subTaskLog.data.id
          const remote = await xo.getRemote(id).catch(error => {
            logger.warn(error)
          })
          const title = remote !== undefined ? remote.name : `Remote Not found`

          remotesText.push(
            `${getSpaceByLevel(1)}- **${title}** (${id}) ${icon}`,
            arrayToMarkdown(
              getTemporalDataMarkdown(
                subTaskLog.end,
                subTaskLog.start,
                formatDate
              ),
              2
            )
          )
          if (subTaskLog.warning !== undefined) {
            remotesText.push(
              arrayToMarkdown(getWarningsMarkdown(subTaskLog.warnings), 2)
            )
          }
          if (subTaskLog.status === 'failure') {
            failedSubTasks.push(remote !== undefined ? remote.name : id)
            if (errorMarkdown !== undefined) {
              remotesText.push('', `${getSpaceByLevel(2)}${errorMarkdown}`)
            }
          }
        } else {
          const id = subTaskLog.data.id
          let sr
          try {
            sr = xo.getObject(id)
          } catch (e) {}
          const [srName, srUuid] =
            sr !== undefined ? [sr.name_label, sr.uuid] : [`SR Not found`, id]
          srsText.push(
            `  - **${srName}** (${srUuid}) ${icon}`,
            arrayToMarkdown(
              getTemporalDataMarkdown(
                subTaskLog.end,
                subTaskLog.start,
                formatDate
              ),
              2
            )
          )
          if (subTaskLog.warnings !== undefined) {
            srsText.push(
              arrayToMarkdown(getWarningsMarkdown(subTaskLog.warnings), 2)
            )
          }
          if (subTaskLog.status === 'failure') {
            failedSubTasks.push(sr !== undefined ? sr.name_label : id)
            if (errorMarkdown !== undefined) {
              srsText.push('', `${getSpaceByLevel(2)}${errorMarkdown}`)
            }
          }
        }

        forEach(subTaskLog.tasks, operationLog => {
          if (
            operationLog.message !== 'merge' &&
            operationLog.message !== 'transfer'
          ) {
            return
          }

          const operationInfoText = []
          if (operationLog.warnings !== undefined) {
            operationInfoText.push(
              arrayToMarkdown(getWarningsMarkdown(operationLog.warnings), 3)
            )
          }

          const errorMarkdown = getErrorMarkdown(operationLog)
          if (errorMarkdown !== undefined) {
            operationInfoText.push(
              `${getSpaceByLevel(3)}- **Error**: ${errorMarkdown}`
            )
          } else {
            const size = operationLog.result.size
            if (operationLog.message === 'merge') {
              globalMergeSize += size
            } else {
              globalTransferSize += size
            }

            operationInfoText.push(
              `${getSpaceByLevel(3)}- **Size**: ${formatSize(size)}`,
              `${getSpaceByLevel(3)}- **Speed**: ${formatSpeed(
                size,
                operationLog.end - operationLog.start
              )}`
            )
          }
          const operationText = [
            `${getSpaceByLevel(2)}- **${operationLog.message}** ${
              STATUS_ICON[operationLog.status]
            }`,
            arrayToMarkdown(
              getTemporalDataMarkdown(
                operationLog.end,
                operationLog.start,
                formatDate
              ),
              3
            ),
            ...operationInfoText,
          ].join('\n')
          if (type === 'remote') {
            remotesText.push(operationText)
            remotesText.join('\n')
          } else if (type === 'SR') {
            srsText.push(operationText)
            srsText.join('\n')
          }
        })
      }

      if (srsText.length !== 0) {
        srsText.unshift(`- **SRs**`)
      }
      if (remotesText.length !== 0) {
        remotesText.unshift(`- **Remotes**`)
      }
      const subText = [...snapshotText, '', ...srsText, '', ...remotesText]
      if (taskLog.result !== undefined) {
        if (taskLog.status === 'skipped') {
          ++nSkipped
          skippedVmsText.push(
            ...text,
            `- **Reason**: ${
              taskLog.result.message === UNHEALTHY_VDI_CHAIN_ERROR
                ? UNHEALTHY_VDI_CHAIN_MESSAGE
                : taskLog.result.message
            }`,
            ''
          )
          nagiosText.push(
            `[(Skipped) ${vm !== undefined ? vm.name_label : 'undefined'} : ${
              taskLog.result.message
            } ]`
          )
        } else {
          ++nFailures
          failedVmsText.push(
            ...text,
            `- **Error**: ${taskLog.result.message}`,
            ''
          )

          nagiosText.push(
            `[(Failed) ${vm !== undefined ? vm.name_label : 'undefined'} : ${
              taskLog.result.message
            } ]`
          )
        }
      } else {
        if (taskLog.status === 'failure') {
          ++nFailures
          failedVmsText.push(...text, '', '', ...subText, '')
          nagiosText.push(
            `[${
              vm !== undefined ? vm.name_label : 'undefined'
            }: (failed)[${failedSubTasks.toString()}]]`
          )
        } else if (taskLog.status === 'interrupted') {
          ++nInterrupted
          interruptedVmsText.push(...text, '', '', ...subText, '')
          nagiosText.push(
            `[(Interrupted) ${vm !== undefined ? vm.name_label : 'undefined'}]`
          )
        } else {
          successfulVmsText.push(...text, '', '', ...subText, '')
        }
      }
    }

    const nVms = log.tasks.length
    const nSuccesses = nVms - nFailures - nSkipped - nInterrupted
    let markdown = [
      `##  Global status: ${log.status}`,
      '',
      `- **Job ID**: ${log.jobId}`,
      `- **Run ID**: ${runJobId}`,
      `- **mode**: ${mode}`,
      ...getTemporalDataMarkdown(log.end, log.start, formatDate),
      `- **Successes**: ${nSuccesses} / ${nVms}`,
    ]

    if (globalTransferSize !== 0) {
      markdown.push(`- **Transfer size**: ${formatSize(globalTransferSize)}`)
    }
    if (globalMergeSize !== 0) {
      markdown.push(`- **Merge size**: ${formatSize(globalMergeSize)}`)
    }

    if (log.warnings !== undefined) {
      markdown.push(getWarningsMarkdown(log.warnings))
    }

    markdown.push('')

    if (nFailures !== 0) {
      markdown.push(
        '---',
        '',
        `## ${nFailures} Failure${nFailures === 1 ? '' : 's'}`,
        '',
        ...failedVmsText
      )
    }

    if (nSkipped !== 0) {
      markdown.push('---', '', `## ${nSkipped} Skipped`, '', ...skippedVmsText)
    }

    if (nInterrupted !== 0) {
      markdown.push(
        '---',
        '',
        `## ${nInterrupted} Interrupted`,
        '',
        ...interruptedVmsText
      )
    }

    if (nSuccesses !== 0 && (test || reportWhen !== 'failure')) {
      markdown.push(
        '---',
        '',
        `## ${nSuccesses} Success${nSuccesses === 1 ? '' : 'es'}`,
        '',
        ...successfulVmsText
      )
    }

    markdown.push('---', '', `*${pkg.name} v${pkg.version}*`)
    markdown = markdown.join('\n')
    return this._sendReport({
      markdown,
      subject: `[Xen Orchestra] ${log.status} − Backup report for ${jobName} ${
        STATUS_ICON[log.status]
      }`,
      nagiosStatus: log.status === 'success' ? 0 : 2,
      nagiosMarkdown:
        log.status === 'success'
          ? `[Xen Orchestra] [Success] Backup report for ${jobName}`
          : `[Xen Orchestra] [${
              nFailures !== 0 ? 'Failure' : 'Skipped'
            }] Backup report for ${jobName} - VMs : ${nagiosText.join(' ')}`,
    })
  }

  _sendReport({ markdown, subject, nagiosStatus, nagiosMarkdown }) {
    const xo = this._xo
    return Promise.all([
      xo.sendEmail !== undefined &&
        xo.sendEmail({
          to: this._mailsReceivers,
          subject,
          markdown,
        }),
      xo.sendToXmppClient !== undefined &&
        xo.sendToXmppClient({
          to: this._xmppReceivers,
          message: markdown,
        }),
      xo.sendSlackMessage !== undefined &&
        xo.sendSlackMessage({
          message: markdown,
        }),
      xo.sendPassiveCheck !== undefined &&
        xo.sendPassiveCheck({
          status: nagiosStatus,
          message: nagiosMarkdown,
        }),
    ])
  }

  _listener(status) {
    const { calls, timezone, error } = status
    const formatDate = createDateFormatter(timezone)

    if (status.error !== undefined) {
      const [globalStatus, icon] =
        error.message === NO_VMS_MATCH_THIS_PATTERN
          ? ['Skipped', ICON_SKIPPED]
          : ['Failure', ICON_FAILURE]

      let markdown = [
        `##  Global status: ${globalStatus}`,
        '',
        `- **Start time**: ${formatDate(status.start)}`,
        `- **End time**: ${formatDate(status.end)}`,
        `- **Duration**: ${formatDuration(status.end - status.start)}`,
        `- **Error**: ${error.message}`,
        '---',
        '',
        `*${pkg.name} v${pkg.version}*`,
      ]

      markdown = markdown.join('\n')
      return this._sendReport({
        subject: `[Xen Orchestra] ${globalStatus} ${icon}`,
        markdown,
        nagiosStatus: 2,
        nagiosMarkdown: `[Xen Orchestra] [${globalStatus}] Error : ${
          error.message
        }`,
      })
    }

    const callIds = Object.keys(calls)

    const nCalls = callIds.length
    if (nCalls === 0) {
      return
    }

    const oneCall = calls[callIds[0]]

    const { _reportWhen: reportWhen = 'failure' } = oneCall.params
    if (reportWhen === 'never') {
      return
    }

    const { method } = oneCall
    if (
      method !== 'vm.deltaCopy' &&
      method !== 'vm.rollingBackup' &&
      method !== 'vm.rollingDeltaBackup' &&
      method !== 'vm.rollingDrCopy' &&
      method !== 'vm.rollingSnapshot'
    ) {
      return
    }

    const reportOnFailure = reportWhen === 'fail' || reportWhen === 'failure' // xo-web < 5 // xo-web >= 5

    let globalMergeSize = 0
    let globalTransferSize = 0
    let nFailures = 0
    let nSkipped = 0

    const failedBackupsText = []
    const nagiosText = []
    const skippedBackupsText = []
    const successfulBackupText = []

    forEach(calls, call => {
      const { id = call.params.vm } = call.params

      let vm
      try {
        vm = this._xo.getObject(id)
      } catch (e) {}

      const { end, start } = call
      const duration = end - start
      const text = [
        `### ${vm !== undefined ? vm.name_label : 'VM not found'}`,
        '',
        `- **UUID**: ${vm !== undefined ? vm.uuid : id}`,
        `- **Start time**: ${formatDate(start)}`,
        `- **End time**: ${formatDate(end)}`,
        `- **Duration**: ${formatDuration(duration)}`,
      ]

      const { error } = call
      if (error !== undefined) {
        const { message } = error

        if (isSkippedError(error)) {
          ++nSkipped
          skippedBackupsText.push(
            ...text,
            `- **Reason**: ${
              message === UNHEALTHY_VDI_CHAIN_ERROR
                ? UNHEALTHY_VDI_CHAIN_MESSAGE
                : message
            }`,
            ''
          )

          nagiosText.push(
            `[(Skipped) ${
              vm !== undefined ? vm.name_label : 'undefined'
            } : ${message} ]`
          )
        } else {
          ++nFailures
          failedBackupsText.push(...text, `- **Error**: ${message}`, '')

          nagiosText.push(
            `[(Failed) ${
              vm !== undefined ? vm.name_label : 'undefined'
            } : ${message} ]`
          )
        }
      } else if (!reportOnFailure) {
        const { returnedValue } = call
        if (returnedValue != null) {
          const { mergeSize, transferSize } = returnedValue
          if (transferSize !== undefined) {
            globalTransferSize += transferSize
            text.push(
              `- **Transfer size**: ${formatSize(transferSize)}`,
              `- **Transfer speed**: ${formatSpeed(
                transferSize,
                returnedValue.transferDuration
              )}`
            )
          }
          if (mergeSize !== undefined) {
            globalMergeSize += mergeSize
            text.push(
              `- **Merge size**: ${formatSize(mergeSize)}`,
              `- **Merge speed**: ${formatSpeed(
                mergeSize,
                returnedValue.mergeDuration
              )}`
            )
          }
        }

        successfulBackupText.push(...text, '')
      }
    })

    const globalSuccess = nFailures === 0 && nSkipped === 0
    if (reportOnFailure && globalSuccess) {
      return
    }

    const { tag } = oneCall.params
    const duration = status.end - status.start
    const nSuccesses = nCalls - nFailures - nSkipped
    const globalStatus = globalSuccess
      ? `Success`
      : nFailures !== 0
      ? `Failure`
      : `Skipped`

    let markdown = [
      `##  Global status: ${globalStatus}`,
      '',
      `- **Type**: ${formatMethod(method)}`,
      `- **Start time**: ${formatDate(status.start)}`,
      `- **End time**: ${formatDate(status.end)}`,
      `- **Duration**: ${formatDuration(duration)}`,
      `- **Successes**: ${nSuccesses} / ${nCalls}`,
    ]
    if (globalTransferSize !== 0) {
      markdown.push(`- **Transfer size**: ${formatSize(globalTransferSize)}`)
    }
    if (globalMergeSize !== 0) {
      markdown.push(`- **Merge size**: ${formatSize(globalMergeSize)}`)
    }
    markdown.push('')

    if (nFailures !== 0) {
      markdown.push(
        '---',
        '',
        `## ${nFailures} Failure${nFailures === 1 ? '' : 's'}`,
        '',
        ...failedBackupsText
      )
    }

    if (nSkipped !== 0) {
      markdown.push(
        '---',
        '',
        `## ${nSkipped} Skipped`,
        '',
        ...skippedBackupsText
      )
    }

    if (nSuccesses !== 0 && !reportOnFailure) {
      markdown.push(
        '---',
        '',
        `## ${nSuccesses} Success${nSuccesses === 1 ? '' : 'es'}`,
        '',
        ...successfulBackupText
      )
    }

    markdown.push('---', '', `*${pkg.name} v${pkg.version}*`)

    markdown = markdown.join('\n')

    return this._sendReport({
      markdown,
      subject: `[Xen Orchestra] ${globalStatus} − Backup report for ${tag} ${
        globalSuccess
          ? ICON_SUCCESS
          : nFailures !== 0
          ? ICON_FAILURE
          : ICON_SKIPPED
      }`,
      nagiosStatus: globalSuccess ? 0 : 2,
      nagiosMarkdown: globalSuccess
        ? `[Xen Orchestra] [Success] Backup report for ${tag}`
        : `[Xen Orchestra] [${
            nFailures !== 0 ? 'Failure' : 'Skipped'
          }] Backup report for ${tag} - VMs : ${nagiosText.join(' ')}`,
    })
  }
}

// ===================================================================

export default ({ xo }) => new BackupReportsXoPlugin(xo)
