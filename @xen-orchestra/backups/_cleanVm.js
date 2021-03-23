const assert = require('assert')
const limitConcurrency = require('limit-concurrency-decorator').default
const { asyncMap } = require('@xen-orchestra/async-map')
const { default: Vhd, mergeVhd } = require('vhd-lib')
const { dirname, resolve } = require('path')
const { DISK_TYPE_DIFFERENCING } = require('vhd-lib/dist/_constants')
const { isMetadataFile, isVhdFile, isXvaFile, isXvaSumFile } = require('./_backupType')
const { isValidXva } = require('./isValidXva')

// chain is an array of VHDs from child to parent
//
// the whole chain will be merged into parent, parent will be renamed to child
// and all the others will deleted
const mergeVhdChain = limitConcurrency(1)(async function mergeVhdChain(chain, { handler, onLog, remove, merge }) {
  assert(chain.length >= 2)

  let child = chain[0]
  const parent = chain[chain.length - 1]
  const children = chain.slice(0, -1).reverse()

  chain
    .slice(1)
    .reverse()
    .forEach(parent => {
      onLog(`the parent ${parent} of the child ${child} is unused`)
    })

  if (merge) {
    // `mergeVhd` does not work with a stream, either
    // - make it accept a stream
    // - or create synthetic VHD which is not a stream
    if (children.length !== 1) {
      // TODO: implement merging multiple children
      children.length = 1
      child = children[0]
    }

    let done, total
    const handle = setInterval(() => {
      if (done !== undefined) {
        onLog(`merging ${child}: ${done}/${total}`)
      }
    }, 10e3)

    await mergeVhd(
      handler,
      parent,
      handler,
      child,
      // children.length === 1
      //   ? child
      //   : await createSyntheticStream(handler, children),
      {
        onProgress({ done: d, total: t }) {
          done = d
          total = t
        },
      }
    )

    clearInterval(handle)
  }

  await Promise.all([
    remove && handler.rename(parent, child),
    asyncMap(children.slice(0, -1), child => {
      onLog(`the VHD ${child} is unused`)
      return remove && handler.unlink(child)
    }),
  ])
})

exports.cleanVm = async function cleanVm(vmDir, { remove, merge, onLog = Function.prototype }) {
  const handler = this._handler

  const vhds = new Set()
  const vhdParents = { __proto__: null }
  const vhdChildren = { __proto__: null }

  // remove broken VHDs
  await asyncMap(
    await handler.list(`${vmDir}/vdis`, {
      filter: isVhdFile,
      prependDir: true,
    }),
    async path => {
      try {
        const vhd = new Vhd(handler, path)
        await vhd.readHeaderAndFooter()
        vhds.add(path)
        if (vhd.footer.diskType === DISK_TYPE_DIFFERENCING) {
          const parent = resolve(dirname(path), vhd.header.parentUnicodeName)
          vhdParents[path] = parent
          if (parent in vhdChildren) {
            const error = new Error('this script does not support multiple VHD children')
            error.parent = parent
            error.child1 = vhdChildren[parent]
            error.child2 = path
            throw error // should we throw?
          }
          vhdChildren[parent] = path
        }
      } catch (error) {
        onLog(`error while checking the VHD with path ${path}`)
        if (error?.code === 'ERR_ASSERTION' && remove) {
          await handler.unlink(path)
        }
      }
    }
  )

  // remove VHDs with missing ancestors
  {
    const deletions = []

    // return true if the VHD has been deleted or is missing
    const deleteIfOrphan = vhd => {
      const parent = vhdParents[vhd]
      if (parent === undefined) {
        return
      }

      // no longer needs to be checked
      delete vhdParents[vhd]

      deleteIfOrphan(parent)

      if (!vhds.has(parent)) {
        vhds.delete(vhd)

        onLog(`the parent ${parent} of the VHD ${vhd} is missing`)
        if (remove) {
          deletions.push(handler.unlink(vhd))
        }
      }
    }

    // > A property that is deleted before it has been visited will not be
    // > visited later.
    // >
    // > -- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in#Deleted_added_or_modified_properties
    for (const child in vhdParents) {
      deleteIfOrphan(child)
    }

    await Promise.all(deletions)
  }

  const jsons = []
  const xvas = new Set()
  const xvaSums = []
  const entries = await handler.list(vmDir, {
    prependDir: true,
  })
  entries.forEach(path => {
    if (isMetadataFile(path)) {
      jsons.push(path)
    } else if (isXvaFile(path)) {
      xvas.add(path)
    } else if (isXvaSumFile(path)) {
      xvaSums.push(path)
    }
  })

  await asyncMap(xvas, async path => {
    // check is not good enough to delete the file, the best we can do is report
    // it
    if (!(await isValidXva(path))) {
      onLog(`the XVA with path ${path} is potentially broken`)
    }
  })

  const unusedVhds = new Set(vhds)
  const unusedXvas = new Set(xvas)

  // compile the list of unused XVAs and VHDs, and remove backup metadata which
  // reference a missing XVA/VHD
  await asyncMap(jsons, async json => {
    const metadata = JSON.parse(await handler.readFile(json))
    const { mode } = metadata
    if (mode === 'full') {
      const linkedXva = resolve(vmDir, metadata.xva)

      if (xvas.has(linkedXva)) {
        unusedXvas.delete(linkedXva)
      } else {
        onLog(`the XVA linked to the metadata ${json} is missing`)
        if (remove) {
          await handler.unlink(json)
        }
      }
    } else if (mode === 'delta') {
      const linkedVhds = (() => {
        const { vhds } = metadata
        return Object.keys(vhds).map(key => resolve(vmDir, vhds[key]))
      })()

      // FIXME: find better approach by keeping as much of the backup as
      // possible (existing disks) even if one disk is missing
      if (linkedVhds.every(_ => vhds.has(_))) {
        linkedVhds.forEach(_ => unusedVhds.delete(_))
      } else {
        onLog(`Some VHDs linked to the metadata ${json} are missing`)
        if (remove) {
          await handler.unlink(json)
        }
      }
    }
  })

  // TODO: parallelize by vm/job/vdi
  const unusedVhdsDeletion = []
  {
    // VHD chains (as list from child to ancestor) to merge indexed by last
    // ancestor
    const vhdChainsToMerge = { __proto__: null }

    const toCheck = new Set(unusedVhds)

    const getUsedChildChainOrDelete = vhd => {
      if (vhd in vhdChainsToMerge) {
        const chain = vhdChainsToMerge[vhd]
        delete vhdChainsToMerge[vhd]
        return chain
      }

      if (!unusedVhds.has(vhd)) {
        return [vhd]
      }

      // no longer needs to be checked
      toCheck.delete(vhd)

      const child = vhdChildren[vhd]
      if (child !== undefined) {
        const chain = getUsedChildChainOrDelete(child)
        if (chain !== undefined) {
          chain.push(vhd)
          return chain
        }
      }

      onLog(`the VHD ${vhd} is unused`)
      if (remove) {
        unusedVhdsDeletion.push(handler.unlink(vhd))
      }
    }

    toCheck.forEach(vhd => {
      vhdChainsToMerge[vhd] = getUsedChildChainOrDelete(vhd)
    })

    Object.keys(vhdChainsToMerge).forEach(key => {
      const chain = vhdChainsToMerge[key]
      if (chain !== undefined) {
        unusedVhdsDeletion.push(mergeVhdChain(chain, { onLog, remove, merge }))
      }
    })
  }

  await Promise.all([
    unusedVhdsDeletion,
    asyncMap(unusedXvas, path => {
      onLog(`the XVA ${path} is unused`)
      return remove && handler.unlink(path)
    }),
    asyncMap(xvaSums, path => {
      // no need to handle checksums for XVAs deleted by the script, they will be handled by `unlink()`
      if (!xvas.has(path.slice(0, -'.checksum'.length))) {
        onLog(`the XVA checksum ${path} is unused`)
        return remove && handler.unlink(path)
      }
    }),
  ])
}
