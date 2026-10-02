'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const { openArchive, createArchiveWriter, canonical, contentHash } = require('./fixture-archive')
const MANIFEST = '@manifest'
const validVersion = version => typeof version === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(version)
const validHash = hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)

// Only known packet byte fields are hex: arbitrary strings (including block names) stay strings.
function binaryFixture (value, key) {
  if (Buffer.isBuffer(value)) return value
  if (key === 'bytes' && typeof value === 'string') {
    if (!/^(?:[a-fA-F0-9]{2})*$/.test(value)) throw new Error('invalid packet hex')
    return Buffer.from(value, 'hex')
  }
  if (Array.isArray(value)) return value.map(x => binaryFixture(x))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, binaryFixture(v, k)]))
  return value
}

function referenceWorld (fixture, worldHash) {
  const out = { ...fixture, worldHash }
  if (fixture.sourceSession?.world) {
    out.sourceSession = { ...fixture.sourceSession }
    delete out.sourceSession.world
  }
  return out
}

function worldFile (root, hash) {
  if (!validHash(hash)) throw new Error('invalid world hash')
  return path.join(root, 'worlds', hash + '.pfix')
}

function readWorld (file) {
  const archive = openArchive(file)
  try {
    if (archive.kind !== 'world') throw new Error('expected a world archive')
    const { areaNames, ...metadata } = archive.read(MANIFEST)
    if (!Array.isArray(areaNames) || new Set(areaNames).size !== areaNames.length || archive.list().length !== areaNames.length + 1) throw new Error('invalid world manifest')
    return {
      ...metadata,
      areas: areaNames.map(name => {
        const area = archive.read(name)
        if (area.name !== name) throw new Error('world area name mismatch')
        return area
      })
    }
  } finally { archive.close() }
}

function putWorld (root, input) {
  const { version, ...world } = input
  if (!Array.isArray(world.areas)) throw new Error('world has no areas')
  const hash = contentHash(world); const file = worldFile(root, hash)
  if (fs.existsSync(file)) {
    if (contentHash(readWorld(file)) !== hash) throw new Error(`world content hash mismatch: ${file}`)
    return hash
  }
  const writer = createArchiveWriter(file, 'world')
  try {
    const names = new Set()
    for (const area of world.areas) {
      if (typeof area.name !== 'string' || names.has(area.name) || area.name === MANIFEST) throw new Error('invalid or duplicate world area')
      names.add(area.name); writer.put(area.name, area)
    }
    const { areas, ...metadata } = world
    writer.put(MANIFEST, { ...metadata, areaNames: areas.map(a => a.name) })
    try { writer.finish(undefined, { exclusive: true }) } catch (error) {
      if (error.code !== 'EEXIST' || contentHash(readWorld(file)) !== hash) throw error
    }
  } finally { writer.abort() }
  return hash
}

function createFixtureStore (root, { archive: selected } = {}) {
  const archives = new Map(); const worlds = new Map()
  const get = version => {
    if (!validVersion(version)) throw new Error('invalid Minecraft version')
    if (!archives.has(version)) {
      const archive = openArchive(selected || path.join(root, 'java', version + '.pfix'))
      try {
        if (archive.kind !== 'fixtures' || archive.read(MANIFEST).version !== version) throw new Error(`fixture version mismatch: ${version}`)
        archives.set(version, archive)
      } catch (error) { archive.close(); throw error }
    }
    return archives.get(version)
  }
  return {
    versions () {
      if (selected) {
        const a = openArchive(selected)
        try { return [a.read(MANIFEST).version] } finally { a.close() }
      }
      const dir = path.join(root, 'java')
      return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.pfix')).map(f => f.slice(0, -5)).sort() : []
    },
    manifest: version => get(version).read(MANIFEST),
    names: version => get(version).list().filter(n => n !== MANIFEST),
    fixture (version, name) {
      const a = get(version)
      return name !== MANIFEST && a.has(name) ? a.read(name) : null
    },
    area (fixture) {
      const hash = fixture.worldHash
      if (!worlds.has(hash)) {
        const file = worldFile(root, hash)
        const world = readWorld(file)
        if (contentHash(world) !== hash) throw new Error(`world content hash mismatch: ${file}`)
        worlds.set(hash, new Map(world.areas.map(a => [a.name, a])))
      }
      const area = worlds.get(hash).get(fixture.area)
      if (!area) throw new Error(`world ${hash} has no area ${fixture.area}`)
      return area
    },
    close () { for (const a of archives.values()) a.close(); archives.clear(); worlds.clear() }
  }
}

function validateFixtures (archive, root) {
  if (archive.kind !== 'fixtures') throw new Error('expected fixture archive')
  const manifest = archive.read(MANIFEST)
  if (!validVersion(manifest.version) || !Array.isArray(manifest.cases)) throw new Error('invalid fixture manifest')
  const names = new Set()
  for (const c of manifest.cases) {
    if (names.has(c.name)) throw new Error('duplicate fixture catalog name')
    names.add(c.name)
    if (c.status === 'ok' && !archive.has(c.name)) throw new Error(`missing catalog fixture: ${c.name}`)
  }
  const store = createFixtureStore(root)
  try {
    for (const name of archive.list().filter(n => n !== MANIFEST)) {
      const fixture = archive.read(name)
      if (fixture.name !== name || fixture.version !== manifest.version || !names.has(name)) throw new Error(`fixture identity mismatch: ${name}`)
      if (!Array.isArray(fixture.ticks) || (fixture.frames !== undefined && fixture.frames !== fixture.ticks.length)) throw new Error(`fixture frame count mismatch: ${name}`)
      store.area(fixture)
    }
  } finally { store.close() }
}

function migrate (root, legacyRoot = path.join(root, 'java'), onProgress = console.log) {
  const reports = []
  for (const dir of fs.readdirSync(legacyRoot).filter(n => n.endsWith('-recorded')).sort()) {
    const source = path.join(legacyRoot, dir)
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'index.json')))
    const version = manifest.version
    if (!validVersion(version)) throw new Error('invalid Minecraft version')
    const target = path.join(root, 'java', version + '.pfix')
    if (fs.existsSync(target)) throw new Error(`archive already exists: ${target}`)
    const hash = putWorld(root, JSON.parse(fs.readFileSync(path.join(source, 'world.json'))))
    const writer = createArchiveWriter(target, 'fixtures')
    let count = 0
    try {
      const cases = new Map(manifest.cases.map(c => [c.name, c]))
      for (const file of fs.readdirSync(path.join(source, 'scenarios')).filter(n => n.endsWith('.json')).sort()) {
        const fixture = binaryFixture(JSON.parse(fs.readFileSync(path.join(source, 'scenarios', file))))
        if (fixture.name === MANIFEST || file !== fixture.name + '.json') throw new Error('fixture filename mismatch')
        const worldHash = fixture.sourceSession?.world ? putWorld(root, { areas: [fixture.sourceSession.world] }) : hash
        writer.put(fixture.name, referenceWorld(fixture, worldHash))
        if (!cases.has(fixture.name)) cases.set(fixture.name, { name: fixture.name, status: 'ok' })
        count++
      }
      writer.put(MANIFEST, { ...manifest, cases: [...cases.values()] })
      writer.finish(a => {
        validateFixtures(a, root)
        for (const name of a.list().filter(n => n !== MANIFEST)) {
          const { worldHash, ...fixture } = a.read(name)
          const original = binaryFixture(JSON.parse(fs.readFileSync(path.join(source, 'scenarios', name + '.json'))))
          if (original.sourceSession?.world) {
            const restored = readWorld(worldFile(root, worldHash)).areas.find(a => a.name === original.area)
            assert.deepStrictEqual(restored, canonical(original.sourceSession.world))
            fixture.sourceSession.world = restored
          }
          assert.deepStrictEqual(fixture, canonical(original), `${version}/${name} migration changed data`)
        }
      })
      const report = { version, fixtures: count, bytes: fs.statSync(target).size }
      reports.push(report); onProgress(report)
    } finally { writer.abort() }
  }
  return reports
}

module.exports = { MANIFEST, validVersion, binaryFixture, referenceWorld, worldFile, readWorld, putWorld, createFixtureStore, validateFixtures, migrate }
