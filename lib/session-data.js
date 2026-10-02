'use strict'
// Recorder tools and both replay consumers must resolve identical schemas and gameplay data.
const fs = require('fs')
const path = require('path')
const Module = require('module')
const crypto = require('crypto')
let configured
module.exports = function sessionData () {
  if (configured) return configured
  const local = 'D:/projects/mc-zuri/mc-data/node-minecraft-data'
  const requested = process.env.PHYSREC_MCDATA || (fs.existsSync(path.join(local, 'index.js')) ? local : null)
  const dataId = requested ? require.resolve(path.resolve(requested)) : require.resolve('minecraft-data')
  const protocolLocal = 'D:/projects/mc-zuri/mc-data/node-minecraft-protocol'
  const protocolDir = process.env.PHYSREC_PROTOCOL || (fs.existsSync(path.join(protocolLocal, 'package.json')) ? protocolLocal : null)
  const resolve = Module._resolveFilename
  Module._resolveFilename = function (request, ...args) {
    if (request === 'minecraft-data') return dataId
    if (protocolDir && (request === 'minecraft-protocol' || request.startsWith('minecraft-protocol/'))) {
      const suffix = request.slice('minecraft-protocol'.length)
      return resolve.call(this, path.resolve(protocolDir) + suffix, ...args)
    }
    return resolve.call(this, request, ...args)
  }
  const data = require(dataId)
  const revisions = new Map()
  const revision = version => {
    if (revisions.has(version)) return revisions.get(version)
    const loaded = data(version)
    if (!loaded) throw new Error(`no data for ${version}`)
    const root = path.dirname(dataId)
    const hash = crypto.createHash('sha256')
    hash.update(fs.readFileSync(dataId))
    for (const [domain, source] of Object.entries(loaded.dataSources || {}).sort()) {
      const file = path.join(root, 'minecraft-data/data', source, domain === 'proto' ? 'proto.yml' : domain + '.json')
      if (!fs.existsSync(file)) throw new Error(`missing authoritative ${domain} source: ${file}`)
      hash.update(domain + '\0' + source + '\0'); hash.update(fs.readFileSync(file))
    }
    const digest = 'sha256:' + hash.digest('hex')
    revisions.set(version, digest)
    return digest
  }
  configured = { data, dataId, protocolDir, revision }
  return configured
}
