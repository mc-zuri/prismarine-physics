#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const util = require('util')
const { openArchive, contentHash } = require('../lib/fixture-archive')
const { MANIFEST, readWorld, validateFixtures, migrate } = require('../lib/fixture-store')
const { importSession, mergeArchive } = require('../lib/fixture-import')

function main (args) {
  const command = args.shift(); const files = []; const options = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      if (!['root', 'legacy', 'conflict', 'worlds', 'name'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`invalid option: ${args[i]}`)
      options[key] = pathOption(key, args[++i])
    } else files.push(path.resolve(args[i]))
  }
  const root = options.root || path.join(__dirname, '..', 'test', 'fixtures')
  const log = value => console.log(util.inspect(value, { depth: 5, maxArrayLength: null, colors: false, compact: true }))
  if (command === 'migrate') return migrate(root, options.legacy, log)
  if (command === 'import-session' || command === 'merge') {
    if (!files.length) throw new Error('provide one or more input files')
    for (const file of files) {
      if (command === 'merge') log(mergeArchive(file, root, options))
      else if (fs.statSync(file).isDirectory()) {
        const manifest = JSON.parse(fs.readFileSync(path.join(file, 'index.json')))
        if (!Array.isArray(manifest.recordings)) throw new Error('session directory index must contain recordings')
        for (const recording of manifest.recordings) {
          if (typeof recording.session !== 'string') throw new Error('missing session path in source manifest')
          const source = path.resolve(file, recording.session)
          const relative = path.relative(file, source)
          if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('session path escapes source directory')
          log(importSession(source, root, { ...options, expectedDigest: recording.sessionSha256, expectedVersion: recording.version, onProgress: log }))
        }
      } else log(importSession(file, root, { ...options, onProgress: log }))
    }
    return
  }
  if (command === 'diff') {
    if (files.length !== 2) throw new Error('diff requires two archives')
    const a = openArchive(files[0]); const b = openArchive(files[1])
    try {
      for (const name of [...new Set([...a.list(), ...b.list()])].sort()) {
        const status = !a.has(name) ? 'added' : !b.has(name) ? 'removed' : contentHash(a.read(name)) !== contentHash(b.read(name)) ? 'changed' : null
        if (status) log({ name, status })
      }
    } finally { a.close(); b.close() }
    return
  }
  if (command === 'verify' && !files.length) {
    for (const dir of ['java', 'worlds']) {
      const folder = path.join(root, dir)
      if (fs.existsSync(folder)) for (const f of fs.readdirSync(folder).filter(f => f.endsWith('.pfix'))) files.push(path.join(folder, f))
    }
  }
  if (!['list', 'inspect', 'verify'].includes(command) || !files.length) throw new Error('usage: node scripts/fixtures.js migrate|import-session|merge|list|inspect|verify|diff [files...] [--root fixtures] [--conflict error|keep|replace] [--legacy directory] [--worlds directory]')
  for (const file of files) {
    const a = openArchive(file)
    try {
      if (command === 'list') log({ file, kind: a.kind, entries: a.list() })
      if (command === 'inspect') {
        if (options.name) console.log(util.inspect(a.read(options.name), { depth: null, maxArrayLength: null, colors: false }))
        else log({ file, kind: a.kind, manifest: a.read(MANIFEST), entries: [...a.entries.values()] })
      }
      if (command === 'verify') {
        if (a.kind === 'fixtures') validateFixtures(a, root)
        else if (path.basename(file, '.pfix') !== contentHash(readWorld(file))) throw new Error('world filename hash mismatch')
        log({ file, entries: a.list().length, verified: true })
      }
    } finally { a.close() }
  }
}
const pathOption = (key, value) => ['conflict', 'name'].includes(key) ? value : path.resolve(value)
if (require.main === module) {
  try { main(process.argv.slice(2)) } catch (error) { console.error(error.stack); process.exitCode = 1 }
}
module.exports = { main }
