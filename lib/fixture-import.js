'use strict'
const fs = require('fs')
const path = require('path')
const { openArchive, createArchiveWriter, contentHash } = require('./fixture-archive')
const { MANIFEST, validVersion, binaryFixture, referenceWorld, putWorld, worldFile, readWorld, validateFixtures } = require('./fixture-store')
const { sessionFixtures } = require('./session-fixtures')
const { readSession } = require('./session-format')

function updateVersion (root, version, policy, consume, metadata = {}) {
  if (!validVersion(version)) throw new Error('invalid Minecraft version')
  if (!['error', 'keep', 'replace'].includes(policy)) throw new Error('conflict policy must be error, keep or replace')
  const file = path.join(root, 'java', version + '.pfix')
  const old = fs.existsSync(file) ? openArchive(file) : null
  const writer = createArchiveWriter(file, 'fixtures')
  const report = { version, added: 0, replaced: 0, identical: 0, kept: 0, skipped: 0 }
  try {
    const manifest = old ? old.read(MANIFEST) : { ...metadata, version, cases: [] }
    if (old) {
      validateFixtures(old, root)
      for (const name of old.list()) writer.copy(old, name)
    }
    const cases = new Map(manifest.cases.map(c => [c.name, c]))
    const updated = new Set()
    consume((fixture, catalogEntry) => {
      const name = fixture.name
      if (!name || name === MANIFEST || fixture.version !== version) throw new Error('invalid imported fixture identity')
      if (updated.has(name)) throw new Error(`duplicate incoming fixture: ${name}`)
      updated.add(name)
      if (old?.has(name)) {
        if (contentHash(old.read(name)) === contentHash(fixture)) { report.identical++; return }
        if (policy === 'error') throw new Error(`fixture already exists: ${version}/${name}; choose --conflict keep or replace`)
        if (policy === 'keep') { report.kept++; return }
        report.replaced++
      } else report.added++
      writer.put(name, fixture)
      cases.set(name, { ...cases.get(name), ...catalogEntry, name, status: 'ok' })
    }, report)
    writer.put(MANIFEST, { ...manifest, cases: [...cases.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')) })
    old?.close() // Windows replacement requires readers to be closed.
    if (report.added || report.replaced || !old) writer.finish(a => validateFixtures(a, root))
    return report
  } finally { old?.close(); writer.abort() }
}

function importSession (file, root, { conflict = 'error', onProgress = () => {}, expectedDigest, expectedVersion } = {}) {
  const reader = readSession(file)
  let header
  try { header = reader.next().value } finally { reader.return() }
  if (expectedVersion && expectedVersion !== header.gameVersion) throw new Error('session version differs from source manifest')
  return updateVersion(root, header.gameVersion, conflict, (put, report) => {
    const seen = new Set(); let catalog
    for (const raw of sessionFixtures(file, {
      binary: true,
      onValidated: info => {
        if (expectedDigest && info.digest !== expectedDigest) throw new Error('session hash differs from source manifest')
        catalog = info.catalog; onProgress({ source: file, validated: true, digest: info.digest })
      }
    })) {
      if (seen.has(raw.name)) continue
      seen.add(raw.name)
      const fixture = binaryFixture(raw)
      const world = fixture.sourceSession.world
      if (!world || world.name !== fixture.area) throw new Error(`missing or mismatched case world: ${fixture.name}`)
      const worldHash = putWorld(root, { areas: [world] })
      put(referenceWorld(fixture, worldHash), { tier: fixture.tier, tags: fixture.tags })
      if (seen.size % 100 === 0) onProgress({ version: header.gameVersion, fixtures: seen.size })
    }
    report.skipped = catalog ? [...catalog.values()].filter(s => s !== 'ok').length : 0
    if (!seen.size) throw new Error('session contains no successful fixtures')
  })
}

function mergeArchive (source, root, { conflict = 'error', worlds = path.join(path.dirname(source), '..', 'worlds') } = {}) {
  const archive = openArchive(source)
  try {
    if (archive.kind !== 'fixtures') throw new Error('merge expects a fixture archive')
    const manifest = archive.read(MANIFEST)
    const cases = new Map(manifest.cases.map(c => [c.name, c]))
    const copied = new Set()
    return updateVersion(root, manifest.version, conflict, put => {
      for (const name of archive.list().filter(n => n !== MANIFEST)) {
        const fixture = archive.read(name)
        if (!copied.has(fixture.worldHash)) {
          const sourceFile = worldFile(path.dirname(worlds), fixture.worldHash)
          const world = readWorld(path.join(worlds, path.basename(sourceFile)))
          if (contentHash(world) !== fixture.worldHash) throw new Error('source world content hash mismatch')
          putWorld(root, world); copied.add(fixture.worldHash)
        }
        put(fixture, cases.get(name))
      }
    }, manifest)
  } finally { archive.close() }
}

function importLegacy (source, root, { conflict = 'error' } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'index.json')))
  const world = JSON.parse(fs.readFileSync(path.join(source, 'world.json')))
  return updateVersion(root, manifest.version, conflict, put => {
    const hash = putWorld(root, world)
    for (const c of manifest.cases.filter(c => c.status === 'ok')) {
      if (typeof c.name !== 'string' || /[\\/:\0]/.test(c.name) || c.name === '..' || c.name === '.') throw new Error('invalid legacy fixture name')
      const fixture = binaryFixture(JSON.parse(fs.readFileSync(path.join(source, 'scenarios', c.name + '.json'))))
      const worldHash = fixture.sourceSession?.world ? putWorld(root, { areas: [fixture.sourceSession.world] }) : hash
      put(referenceWorld(fixture, worldHash), c)
    }
  }, manifest)
}

module.exports = { importSession, mergeArchive, updateVersion, importLegacy }
