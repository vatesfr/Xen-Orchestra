const { formatFilenameDate } = require('../_filenameDate')
const { getOldEntries } = require('../_getOldEntries')
const { getVmBackupDir } = require('../_getVmBackupDir')
const { isValidXva } = require('../isValidXva')
const { Task } = require('../Task')

const { MixinBackupWriter } = require('./_MixinBackupWriter')
const { AbstractFullWriter } = require('./_AbstractFullWriter')

exports.FullBackupWriter = class FullBackupWriter extends MixinBackupWriter(AbstractFullWriter) {
  constructor(props) {
    super(props)

    this.run = Task.wrapFn(
      {
        name: 'export',
        data: {
          id: props.remoteId,
          type: 'remote',

          // necessary?
          isFull: true,
        },
      },
      this.run
    )
  }

  async run({ timestamp, sizeContainer, stream }) {
    const backup = this._backup
    const settings = this._settings

    const { job, scheduleId, vm } = backup

    const adapter = this._adapter
    const handler = adapter.handler
    const backupDir = getVmBackupDir(vm.uuid)

    // TODO: clean VM backup directory

    const oldBackups = getOldEntries(
      settings.exportRetention - 1,
      await adapter.listVmBackups(vm.uuid, _ => _.mode === 'full' && _.scheduleId === scheduleId)
    )
    const deleteOldBackups = () => adapter.deleteFullVmBackups(oldBackups)

    const basename = formatFilenameDate(timestamp)

    const dataBasename = basename + '.xva'
    const dataFilename = backupDir + '/' + dataBasename

    const metadataFilename = `${backupDir}/${basename}.json`
    const metadata = {
      jobId: job.id,
      mode: job.mode,
      scheduleId,
      timestamp,
      version: '2.0.0',
      vm,
      vmSnapshot: this._backup.exportedVm,
      xva: './' + dataBasename,
    }

    const { deleteFirst } = settings
    if (deleteFirst) {
      await deleteOldBackups()
    }

    await Task.run({ name: 'transfer' }, async () => {
      await adapter.outputStream(dataFilename, stream, {
        validator: tmpPath => {
          if (handler._getFilePath !== undefined) {
            return isValidXva(handler._getFilePath('/' + tmpPath))
          }
        },
      })
      return { size: sizeContainer.size }
    })
    metadata.size = sizeContainer.size
    await handler.outputFile(metadataFilename, JSON.stringify(metadata), {
      dirMode: backup.config.dirMode,
    })

    if (!deleteFirst) {
      await deleteOldBackups()
    }

    // TODO: run cleanup?
  }
}
