// @flow

// $FlowFixMe
import defer from 'golike-defer'
import { type Pattern, createPredicate } from 'value-matcher'
import { type Readable, PassThrough } from 'stream'
import { basename, dirname } from 'path'
import { isEmpty, last, mapValues, noop, values } from 'lodash'
import { timeout as pTimeout } from 'promise-toolbox'

import { type Executor, type Job } from '../jobs'
import { type Schedule } from '../scheduling'

import type RemoteHandler from '../../remote-handlers/abstract'
import createSizeStream from '../../size-stream'
import {
  type DeltaVmExport,
  type DeltaVmImport,
  type Vm,
  type Xapi,
} from '../../xapi'
import {
  asyncMap,
  resolveRelativeFromFile,
  safeDateFormat,
  serializeError,
} from '../../utils'
import mergeVhd, {
  chainVhd,
  createReadStream as createVhdReadStream,
  readVhdMetadata,
} from '../../vhd-merge'

type Mode = 'full' | 'delta'

type Settings = {|
  deleteFirst?: boolean,
  exportRetention?: number,
  snapshotRetention?: number,
  vmTimeout?: number,
|}

type SimpleIdPattern = {|
  id: string | {| __or: string[] |},
|}

export type BackupJob = {|
  ...$Exact<Job>,
  compression?: 'native',
  mode: Mode,
  remotes?: SimpleIdPattern,
  settings: $Dict<Settings>,
  srs?: SimpleIdPattern,
  type: 'backup',
  vms: Pattern,
|}

type BackupResult = {|
  mergeDuration: number,
  mergeSize: number,
  transferDuration: number,
  transferSize: number,
|}

type MetadataBase = {|
  _filename?: string,
  jobId: string,
  scheduleId: string,
  timestamp: number,
  version: '2.0.0',
  vm: Object,
  vmSnapshot: Object,
|}
type MetadataDelta = {|
  ...MetadataBase,
  mode: 'delta',
  vdis: $PropertyType<DeltaVmExport, 'vdis'>,
  vbds: $PropertyType<DeltaVmExport, 'vbds'>,
  vhds: { [vdiId: string]: string },
  vifs: $PropertyType<DeltaVmExport, 'vifs'>,
|}
type MetadataFull = {|
  ...MetadataBase,
  mode: 'full',
  xva: string,
|}
type Metadata = MetadataDelta | MetadataFull

const compareSnapshotTime = (a: Vm, b: Vm): number =>
  a.snapshot_time < b.snapshot_time ? -1 : 1

const compareTimestamp = (a: Metadata, b: Metadata): number =>
  a.timestamp - b.timestamp

// returns all entries but the last (retention - 1)-th
//
// the “-1” is because this code is usually run with entries computed before the
// new entry is created
const getOldEntries = <T>(retention: number, entries?: T[]): T[] =>
  entries === undefined
    ? []
    : --retention > 0 ? entries.slice(0, -retention) : entries

const defaultSettings: Settings = {
  deleteFirst: false,
  exportRetention: 0,
  snapshotRetention: 0,
  vmTimeout: 0,
}
const getSetting = (
  settings: $Dict<Settings>,
  name: $Keys<Settings>,
  ...keys: string[]
): any => {
  for (let i = 0, n = keys.length; i < n; ++i) {
    const objectSettings = settings[keys[i]]
    if (objectSettings !== undefined) {
      const setting = objectSettings[name]
      if (setting !== undefined) {
        return setting
      }
    }
  }
  return defaultSettings[name]
}

const BACKUP_DIR = 'xo-vm-backups'
const getVmBackupDir = (uuid: string) => `${BACKUP_DIR}/${uuid}`

const isMetadataFile = (filename: string) => filename.endsWith('.json')
const isVhd = (filename: string) => filename.endsWith('.vhd')

const listReplicatedVms = (
  xapi: Xapi,
  scheduleId: string,
  srId: string
): Vm[] => {
  const { all } = xapi.objects
  const vms = {}
  for (const key in all) {
    const object = all[key]
    if (
      object.$type === 'vm' &&
      object.other_config['xo:backup:schedule'] === scheduleId &&
      object.other_config['xo:backup:sr'] === srId
    ) {
      vms[object.$id] = object
    }
  }

  // the replicated VMs have been created from a snapshot, therefore we can use
  // `snapshot_time` as the creation time
  return values(vms).sort(compareSnapshotTime)
}

const importers: $Dict<
  (
    handler: RemoteHandler,
    metadataFilename: string,
    metadata: Metadata,
    xapi: Xapi,
    sr: { $id: string }
  ) => Promise<string>,
  Mode
> = {
  async delta (handler, metadataFilename, metadata, xapi, sr) {
    metadata = ((metadata: any): MetadataDelta)
    const { vdis, vhds, vm } = metadata

    const streams = {}
    await asyncMap(vdis, async (vdi, id) => {
      streams[`${id}.vhd`] = await createVhdReadStream(
        handler,
        resolveRelativeFromFile(metadataFilename, vhds[id])
      )
    })

    const delta: DeltaVmImport = {
      streams,
      vbds: metadata.vbds,
      vdis,
      version: '1.0.0',
      vifs: metadata.vifs,
      vm: {
        ...vm,
        name_label: `${vm.name_label} (${safeDateFormat(metadata.timestamp)})`,
        tags: [...vm.tags, 'restored from backup'],
      },
    }

    const { vm: newVm } = await xapi.importDeltaVm(delta, {
      detectBase: false,
      disableStartAfterImport: false,
      srId: sr,
      // TODO: support mapVdisSrs
    })
    return newVm.$id
  },
  async full (handler, metadataFilename, metadata, xapi, sr) {
    metadata = ((metadata: any): MetadataFull)

    const xva = await handler.createReadStream(
      resolveRelativeFromFile(metadataFilename, metadata.xva),
      {
        checksum: true,
        ignoreMissingChecksum: true, // provide an easy way to opt-out
      }
    )
    const vm = await xapi.importVm(xva, { srId: sr.$id })
    await Promise.all([
      xapi.addTag(vm.$id, 'restored from backup'),
      xapi.editVm(vm.$id, {
        name_label: `${metadata.vm.name_label} (${safeDateFormat(
          metadata.timestamp
        )})`,
      }),
    ])
    return vm.$id
  },
}

const parseVmBackupId = (id: string) => {
  const i = id.indexOf('/')
  return {
    metadataFilename: id.slice(i + 1),
    remoteId: id.slice(0, i),
  }
}

const unboxIds = (pattern?: SimpleIdPattern): string[] => {
  if (pattern === undefined) {
    return []
  }
  const { id } = pattern
  return typeof id === 'string' ? [id] : id.__or
}

// similar to Promise.all() but do not gather results
async function waitAll<T> (
  promises: Promise<T>[],
  onRejection: Function
): Promise<void> {
  promises = promises.map(promise => {
    promise = promise.catch(onRejection)
    promise.catch(noop) // prevent unhandled rejection warning
    return promise
  })
  for (const promise of promises) {
    await promise
  }
}

// write a stream to a file using a temporary file
//
// TODO: merge into RemoteHandlerAbstract
const writeStream = async (
  input: Readable | Promise<Readable>,
  handler: RemoteHandler,
  path: string,
  { checksum = true }: { checksum?: boolean } = {}
): Promise<void> => {
  input = await input
  const tmpPath = `${dirname(path)}/.${basename(path)}`
  const output = await handler.createOutputStream(tmpPath, { checksum })
  try {
    input.pipe(output)
    await output.checksumWritten
    // $FlowFixMe
    await input.task
    await handler.rename(tmpPath, path, { checksum })
  } catch (error) {
    await handler.unlink(tmpPath, { checksum })
    throw error
  }
}

// File structure on remotes:
//
// <remote>
// └─ xo-vm-backups
//   ├─ index.json // TODO
//   └─ <VM UUID>
//      ├─ index.json // TODO
//      ├─ vdis
//      │  └─ <job UUID>
//      │     └─ <VDI UUID>
//      │        ├─ index.json // TODO
//      │        └─ <YYYYMMDD>T<HHmmss>.vhd
//      ├─ <YYYYMMDD>T<HHmmss>.json // backup metadata
//      ├─ <YYYYMMDD>T<HHmmss>.xva
//      └─ <YYYYMMDD>T<HHmmss>.xva.checksum
//
// Attributes of created VMs:
//
// - name: `${original name} (${safeDateFormat(backup timestamp)})`
// - tag:
//    - copy in delta mode: `Continuous Replication`
//    - copy in full mode: `Disaster Recovery`
//    - imported from backup: `restored from backup`
export default class BackupNg {
  _app: {
    createJob: ($Diff<BackupJob, {| id: string |}>) => Promise<BackupJob>,
    createSchedule: ($Diff<Schedule, {| id: string |}>) => Promise<Schedule>,
    deleteSchedule: (id: string) => Promise<void>,
    getAllSchedules: () => Promise<Schedule[]>,
    getRemoteHandler: (id: string) => Promise<RemoteHandler>,
    getXapi: (id: string) => Xapi,
    getJob: (id: string, 'backup') => Promise<BackupJob>,
    updateJob: ($Shape<BackupJob>) => Promise<BackupJob>,
    removeJob: (id: string) => Promise<void>,
  }

  constructor (app: any) {
    this._app = app

    app.on('start', () => {
      const executor: Executor = async ({
        cancelToken,
        job: job_,
        logger,
        runJobId,
        schedule,
      }) => {
        if (schedule === undefined) {
          throw new Error('backup job cannot run without a schedule')
        }

        const job: BackupJob = (job_: any)
        const vms: $Dict<Vm> = app.getObjects({
          filter: createPredicate({
            type: 'VM',
            ...job.vms,
          }),
        })
        if (isEmpty(vms)) {
          throw new Error('no VMs match this pattern')
        }
        const jobId = job.id
        const scheduleId = schedule.id
        const status: Object = {
          calls: {},
          runJobId,
          start: Date.now(),
          timezone: schedule.timezone,
        }
        const { calls } = status
        await asyncMap(vms, async vm => {
          const { uuid } = vm
          const method = 'backup-ng'
          const params = {
            id: uuid,
            tag: job.name,
          }

          const name = vm.name_label
          const runCallId = logger.notice(
            `Starting backup of ${name}. (${jobId})`,
            {
              event: 'jobCall.start',
              method,
              params,
              runJobId,
            }
          )
          const call: Object = (calls[runCallId] = {
            method,
            params,
            start: Date.now(),
          })
          const vmCancel = cancelToken.fork()
          try {
            // $FlowFixMe injected $defer param
            let p = this._backupVm(vmCancel.token, uuid, job, schedule)
            const vmTimeout: number = getSetting(
              job.settings,
              'vmTimeout',
              uuid,
              scheduleId
            )
            if (vmTimeout !== 0) {
              p = pTimeout.call(p, vmTimeout)
            }
            const returnedValue = await p
            logger.notice(
              `Backuping ${name} (${runCallId}) is a success. (${jobId})`,
              {
                event: 'jobCall.end',
                runJobId,
                runCallId,
                returnedValue,
              }
            )

            call.returnedValue = returnedValue
            call.end = Date.now()
          } catch (error) {
            vmCancel.cancel()
            logger.notice(
              `Backuping ${name} (${runCallId}) has failed. (${jobId})`,
              {
                event: 'jobCall.end',
                runJobId,
                runCallId,
                error: Array.isArray(error)
                  ? error.map(serializeError)
                  : serializeError(error),
              }
            )

            call.error = error
            call.end = Date.now()
          }
        })
        status.end = Date.now()
        return status
      }
      app.registerJobExecutor('backup', executor)
    })
  }

  async createBackupNgJob (
    props: $Diff<BackupJob, {| id: string |}>,
    schedules?: $Dict<$Diff<Schedule, {| id: string |}>>
  ): Promise<BackupJob> {
    const app = this._app
    props.type = 'backup'
    const job: BackupJob = await app.createJob(props)

    if (schedules !== undefined) {
      const { id, settings } = job
      const tmpIds = Object.keys(schedules)
      await asyncMap(tmpIds, async (tmpId: string) => {
        // $FlowFixMe don't know what is the problem (JFT)
        const schedule = schedules[tmpId]
        schedule.jobId = id
        settings[(await app.createSchedule(schedule)).id] = settings[tmpId]
        delete settings[tmpId]
      })
      await app.updateJob({ id, settings })
    }

    return job
  }

  async deleteBackupNgJob (id: string): Promise<void> {
    const app = this._app
    const [schedules] = await Promise.all([
      app.getAllSchedules(),
      app.getJob(id, 'backup'),
    ])
    await Promise.all([
      app.removeJob(id),
      asyncMap(schedules, schedule => {
        if (schedule.id === id) {
          app.deleteSchedule(schedule.id)
        }
      }),
    ])
  }

  async deleteVmBackupNg (id: string): Promise<void> {
    const app = this._app
    const { metadataFilename, remoteId } = parseVmBackupId(id)
    const handler = await app.getRemoteHandler(remoteId)
    const metadata: Metadata = JSON.parse(
      String(await handler.readFile(metadataFilename))
    )
    metadata._filename = metadataFilename

    if (metadata.mode === 'delta') {
      await this._deleteDeltaVmBackups(handler, [metadata])
    } else if (metadata.mode === 'full') {
      await this._deleteFullVmBackups(handler, [metadata])
    } else {
      throw new Error(`no deleter for backup mode ${metadata.mode}`)
    }
  }

  async importVmBackupNg (id: string, srId: string): Promise<string> {
    const app = this._app
    const { metadataFilename, remoteId } = parseVmBackupId(id)
    const handler = await app.getRemoteHandler(remoteId)
    const metadata: Metadata = JSON.parse(
      String(await handler.readFile(metadataFilename))
    )

    const importer = importers[metadata.mode]
    if (importer === undefined) {
      throw new Error(`no importer for backup mode ${metadata.mode}`)
    }

    const xapi = app.getXapi(srId)

    return importer(
      handler,
      metadataFilename,
      metadata,
      xapi,
      xapi.getObject(srId)
    )
  }

  async listVmBackupsNg (remotes: string[]) {
    const backupsByVmByRemote: $Dict<$Dict<Metadata[]>> = {}

    const app = this._app
    await Promise.all(
      remotes.map(async remoteId => {
        const handler = await app.getRemoteHandler(remoteId)

        const entries = (await handler.list(BACKUP_DIR).catch(error => {
          if (error == null || error.code !== 'ENOENT') {
            throw error
          }
          return []
        })).filter(name => name !== 'index.json')

        const backupsByVm = (backupsByVmByRemote[remoteId] = {})
        await Promise.all(
          entries.map(async vmId => {
            // $FlowFixMe don't know what is the problem (JFT)
            const backups = await this._listVmBackups(handler, vmId)

            if (backups.length === 0) {
              return
            }

            // inject an id usable by importVmBackupNg()
            backups.forEach(backup => {
              backup.id = `${remoteId}/${backup._filename}`
            })

            backupsByVm[vmId] = backups
          })
        )
      })
    )

    return backupsByVmByRemote
  }

  // High:
  // - [ ] clones of replicated VMs should not be garbage collected
  //     - if storing uuids in source VM, how to detect them if the source is
  //       lost?
  // - [ ] validate VHDs after exports and before imports, how?
  // - [ ] in case of merge failure
  //       1. delete (or isolate) the tainted VHD
  //       2. next run should be a full
  // - [ ] add a lock on the job/VDI during merge which should prevent other merges and restoration
  // - [ ] import for delta
  //
  // Low:
  // - [ ] check merge/transfert duration/size are what we want for delta
  // - [ ] jobs should be cancelable
  // - [ ] possibility to (re-)run a single VM in a backup?
  // - [ ] display queued VMs
  // - [ ] snapshots and files of an old job should be detected and removed
  // - [ ] delta import should support mapVdisSrs
  // - [ ] size of the path? (base64url(Buffer.from(uuid.split('-').join(''), 'hex')))
  // - [ ] do not create snapshot if unhealthy vdi chain
  // - [ ] fix backup reports
  // - [ ] what does mean the vmTimeout with the new concurrency? a VM can take
  //       a very long time to finish if there are other VMs before…
  //
  // Triage:
  // - [ ] logs
  //
  // Done:
  //
  // - [x] files (.tmp) should be renamed at the end of job
  // - [x] detect full remote
  // - [x] can the snapshot and export retention be different? → Yes
  // - [x] deleteFirst per target
  // - [x] timeout per VM
  // - [x] backups should be deletable from the API
  // - [x] adding and removing VDIs should behave
  // - [x] isolate VHD chains by job
  @defer
  async _backupVm (
    $defer: any,
    $cancelToken: any,
    vmId: string,
    job: BackupJob,
    schedule: Schedule
  ): Promise<BackupResult> {
    const app = this._app
    const xapi = app.getXapi(vmId)
    const vm: Vm = (xapi.getObject(vmId): any)

    const { id: jobId, settings } = job
    const { id: scheduleId } = schedule

    const exportRetention: number = getSetting(
      settings,
      'exportRetention',
      scheduleId
    )
    const snapshotRetention: number = getSetting(
      settings,
      'snapshotRetention',
      scheduleId
    )

    if (exportRetention === 0) {
      if (snapshotRetention === 0) {
        throw new Error('export and snapshots retentions cannot both be 0')
      }
    }

    const snapshots = vm.$snapshots
      .filter(_ => _.other_config['xo:backup:job'] === jobId)
      .sort(compareSnapshotTime)
    $defer(() =>
      asyncMap(
        getOldEntries(
          snapshotRetention,
          snapshots.filter(
            _ => _.other_config['xo:backup:schedule'] === scheduleId
          )
        ),
        _ => xapi.deleteVm(_)
      )
    )

    let snapshot: Vm = (await xapi._snapshotVm(
      $cancelToken,
      vm,
      `[XO Backup ${job.name}] ${vm.name_label}`
    ): any)
    $defer.onFailure.call(xapi, '_deleteVm', snapshot)
    await xapi._updateObjectMapProperty(snapshot, 'other_config', {
      'xo:backup:job': jobId,
      'xo:backup:schedule': scheduleId,
    })
    snapshot = ((await xapi.barrier(snapshot.$ref): any): Vm)

    if (exportRetention === 0) {
      return {
        mergeDuration: 0,
        mergeSize: 0,
        transferDuration: 0,
        transferSize: 0,
      }
    }

    const remotes = unboxIds(job.remotes)
    const srs = unboxIds(job.srs)
    if (remotes.length === 0 && srs.length === 0) {
      throw new Error('export retention must be 0 without remotes and SRs')
    }

    const now = Date.now()
    const vmDir = getVmBackupDir(vm.uuid)

    const basename = safeDateFormat(now)

    const metadataFilename = `${vmDir}/${basename}.json`

    if (job.mode === 'full') {
      // TODO: do not create the snapshot if there are no snapshotRetention and
      // the VM is not running
      if (snapshotRetention === 0) {
        $defer.call(xapi, 'deleteVm', snapshot)
      }

      let xva: any = await xapi.exportVm($cancelToken, snapshot, {
        compress: job.compression === 'native',
      })
      const exportTask = xva.task
      xva = xva.pipe(createSizeStream())

      const dataBasename = `${basename}.xva`

      const metadata: MetadataFull = {
        jobId,
        mode: 'full',
        scheduleId,
        timestamp: now,
        version: '2.0.0',
        vm,
        vmSnapshot: snapshot,
        xva: `./${dataBasename}`,
      }
      const dataFilename = `${vmDir}/${dataBasename}`

      const jsonMetadata = JSON.stringify(metadata)

      const errors = []
      await waitAll(
        [
          ...remotes.map(
            defer(async ($defer, remoteId) => {
              const fork = xva.pipe(new PassThrough())

              const handler = await app.getRemoteHandler(remoteId)

              const oldBackups: MetadataFull[] = (getOldEntries(
                exportRetention,
                await this._listVmBackups(
                  handler,
                  vm,
                  _ => _.mode === 'full' && _.scheduleId === scheduleId
                )
              ): any)

              const deleteFirst = getSetting(settings, 'deleteFirst', remoteId)
              if (deleteFirst) {
                await this._deleteFullVmBackups(handler, oldBackups)
              }

              await writeStream(fork, handler, dataFilename)

              await handler.outputFile(metadataFilename, jsonMetadata)

              if (!deleteFirst) {
                await this._deleteFullVmBackups(handler, oldBackups)
              }
            })
          ),
          ...srs.map(
            defer(async ($defer, srId) => {
              const fork = xva.pipe(new PassThrough())
              fork.task = exportTask

              const xapi = app.getXapi(srId)
              const sr = xapi.getObject(srId)

              const oldVms = getOldEntries(
                exportRetention,
                listReplicatedVms(xapi, scheduleId, srId)
              )

              const deleteFirst = getSetting(settings, 'deleteFirst', srId)
              if (deleteFirst) {
                await this._deleteVms(xapi, oldVms)
              }

              const vm = await xapi.barrier(
                await xapi._importVm($cancelToken, fork, sr, vm =>
                  xapi._setObjectProperties(vm, {
                    nameLabel: `${metadata.vm.name_label} (${safeDateFormat(
                      metadata.timestamp
                    )})`,
                  })
                )
              )

              await Promise.all([
                xapi.addTag(vm.$ref, 'Disaster Recovery'),
                xapi._updateObjectMapProperty(vm, 'blocked_operations', {
                  start:
                    'Start operation for this vm is blocked, clone it if you want to use it.',
                }),
                xapi._updateObjectMapProperty(vm, 'other_config', {
                  'xo:backup:sr': srId,
                }),
              ])

              if (!deleteFirst) {
                await this._deleteVms(xapi, oldVms)
              }
            })
          ),
        ],
        error => {
          console.warn(error)
          errors.push(error)
        }
      )
      if (errors.length !== 0) {
        throw errors
      }

      return {
        mergeDuration: 0,
        mergeSize: 0,
        transferDuration: Date.now() - now,
        transferSize: xva.size,
      }
    } else if (job.mode === 'delta') {
      const baseSnapshot = last(snapshots)
      if (baseSnapshot !== undefined) {
        console.log(baseSnapshot.$id) // TODO: remove
        // check current state
        // await Promise.all([asyncMap(remotes, remoteId => {})])
      }

      const deltaExport = await xapi.exportDeltaVm(
        $cancelToken,
        snapshot,
        baseSnapshot
      )

      const metadata: MetadataDelta = {
        jobId,
        mode: 'delta',
        scheduleId,
        timestamp: now,
        vbds: deltaExport.vbds,
        vdis: deltaExport.vdis,
        version: '2.0.0',
        vifs: deltaExport.vifs,
        vhds: mapValues(
          deltaExport.vdis,
          vdi =>
            `vdis/${jobId}/${
              (xapi.getObject(vdi.snapshot_of): Object).uuid
            }/${basename}.vhd`
        ),
        vm,
        vmSnapshot: snapshot,
      }

      const jsonMetadata = JSON.stringify(metadata)

      // create a fork of the delta export
      const forkExport = (() => {
        // replace the stream factories by fork factories
        const streams: any = mapValues(deltaExport.streams, lazyStream => {
          let forks = []
          return () => {
            if (forks === undefined) {
              throw new Error(
                'cannot fork the stream after it has been created'
              )
            }
            if (forks.length === 0) {
              lazyStream().then(
                stream => {
                  // $FlowFixMe
                  forks.forEach(({ resolve }) => {
                    const fork: any = stream.pipe(new PassThrough())
                    fork.task = stream.task
                    resolve(fork)
                  })
                  forks = undefined
                },
                error => {
                  // $FlowFixMe
                  forks.forEach(({ reject }) => {
                    reject(error)
                  })
                  forks = undefined
                }
              )
            }
            return new Promise((resolve, reject) => {
              // $FlowFixMe
              forks.push({ reject, resolve })
            })
          }
        })
        return () => {
          return {
            __proto__: deltaExport,
            streams,
          }
        }
      })()

      const mergeStart = 0
      const mergeEnd = 0
      let transferStart = 0
      let transferEnd = 0
      const errors = []
      await waitAll(
        [
          ...remotes.map(
            defer(async ($defer, remoteId) => {
              const fork = forkExport()

              const handler = await app.getRemoteHandler(remoteId)

              const oldBackups: MetadataDelta[] = (getOldEntries(
                exportRetention,
                await this._listVmBackups(
                  handler,
                  vm,
                  _ => _.mode === 'delta' && _.scheduleId === scheduleId
                )
              ): any)

              const deleteFirst = getSetting(settings, 'deleteFirst', remoteId)
              if (deleteFirst) {
                this._deleteDeltaVmBackups(handler, oldBackups)
              }

              await asyncMap(
                fork.vdis,
                defer(async ($defer, vdi, id) => {
                  const path = `${vmDir}/${metadata.vhds[id]}`

                  const isDelta = 'xo:base_delta' in vdi.other_config
                  let parentPath
                  if (isDelta) {
                    const vdiDir = dirname(path)
                    const parent = (await handler.list(vdiDir))
                      .filter(isVhd)
                      .sort()
                      .pop()
                    parentPath = `${vdiDir}/${parent}`
                  }

                  await writeStream(
                    fork.streams[`${id}.vhd`](),
                    handler,
                    path,
                    {
                      // no checksum for VHDs, because they will be invalidated by
                      // merges and chainings
                      checksum: false,
                    }
                  )
                  $defer.onFailure.call(handler, 'unlink', path)

                  if (isDelta) {
                    await chainVhd(handler, parentPath, handler, path)
                  }
                })
              )

              await handler.outputFile(metadataFilename, jsonMetadata)

              if (!deleteFirst) {
                this._deleteDeltaVmBackups(handler, oldBackups)
              }
            })
          ),
          ...srs.map(
            defer(async ($defer, srId) => {
              const fork = forkExport()

              const xapi = app.getXapi(srId)
              const sr = xapi.getObject(srId)

              const oldVms = getOldEntries(
                exportRetention,
                listReplicatedVms(xapi, scheduleId, srId)
              )

              const deleteFirst = getSetting(settings, 'deleteFirst', srId)
              if (deleteFirst) {
                await this._deleteVms(xapi, oldVms)
              }

              transferStart = Math.min(transferStart, Date.now())

              const { vm } = await xapi.importDeltaVm(fork, {
                disableStartAfterImport: false, // we'll take care of that
                name_label: `${metadata.vm.name_label} (${safeDateFormat(
                  metadata.timestamp
                )})`,
                srId: sr.$id,
              })

              transferEnd = Math.max(transferEnd, Date.now())

              await Promise.all([
                xapi.addTag(vm.$ref, 'Continuous Replication'),
                xapi._updateObjectMapProperty(vm, 'blocked_operations', {
                  start:
                    'Start operation for this vm is blocked, clone it if you want to use it.',
                }),
                xapi._updateObjectMapProperty(vm, 'other_config', {
                  'xo:backup:sr': srId,
                }),
              ])

              if (!deleteFirst) {
                await this._deleteVms(xapi, oldVms)
              }
            })
          ),
        ],
        error => {
          console.warn(error)
          errors.push(error)
        }
      )
      if (errors.length !== 0) {
        throw errors
      }

      return {
        mergeDuration: mergeEnd - mergeStart,
        mergeSize: 0,
        transferDuration: transferEnd - transferStart,
        transferSize: 0,
      }
    } else {
      throw new Error(`no exporter for backup mode ${job.mode}`)
    }
  }

  async _deleteDeltaVmBackups (
    handler: RemoteHandler,
    backups: MetadataDelta[]
  ): Promise<void> {
    // TODO: remove VHD as well
    await asyncMap(backups, async backup => {
      const filename = ((backup._filename: any): string)

      return Promise.all([
        handler.unlink(filename),
        asyncMap(backup.vhds, _ =>
          // $FlowFixMe injected $defer param
          this._deleteVhd(handler, resolveRelativeFromFile(filename, _))
        ),
      ])
    })
  }

  async _deleteFullVmBackups (
    handler: RemoteHandler,
    backups: MetadataFull[]
  ): Promise<void> {
    await asyncMap(backups, ({ _filename, xva }) => {
      _filename = ((_filename: any): string)
      return Promise.all([
        handler.unlink(_filename),
        handler.unlink(resolveRelativeFromFile(_filename, xva)),
      ])
    })
  }

  // FIXME: synchronize by job/VDI, otherwise it can cause issues with the merge
  @defer
  async _deleteVhd ($defer: any, handler: RemoteHandler, path: string) {
    const vhds = await asyncMap(
      await handler.list(dirname(path), { filter: isVhd, prependDir: true }),
      async path => {
        const metadata = await readVhdMetadata(handler, path)
        metadata.path = path
        return metadata
      }
    )
    const base = basename(path)
    const child = vhds.find(_ => _.header.parentUnicodeName === base)
    if (child === undefined) {
      return handler.unlink(path)
    }

    $defer.onFailure.call(handler, 'unlink', path)

    const childPath = child.path
    await mergeVhd(handler, path, handler, childPath)
    await handler.rename(path, childPath)
  }

  async _deleteVms (xapi: Xapi, vms: Vm[]): Promise<void> {
    await asyncMap(vms, vm => xapi.deleteVm(vm))
  }

  async _listVmBackups (
    handler: RemoteHandler,
    vm: Object | string,
    predicate?: Metadata => boolean
  ): Promise<Metadata[]> {
    const backups = []

    const dir = getVmBackupDir(typeof vm === 'string' ? vm : vm.uuid)
    try {
      const files = await handler.list(dir)
      await Promise.all(
        files.filter(isMetadataFile).map(async file => {
          const path = `${dir}/${file}`
          try {
            const metadata = JSON.parse(String(await handler.readFile(path)))
            if (predicate === undefined || predicate(metadata)) {
              Object.defineProperty(metadata, '_filename', {
                value: path,
              })
              backups.push(metadata)
            }
          } catch (error) {
            console.warn('_listVmBackups', path, error)
          }
        })
      )
    } catch (error) {
      if (error == null || error.code !== 'ENOENT') {
        throw error
      }
    }

    return backups.sort(compareTimestamp)
  }
}
