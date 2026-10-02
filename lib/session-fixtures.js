'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { readSession } = require('./session-format')

function jsonValue (value) {
  if (Buffer.isBuffer(value)) return value.toString('hex')
  if (typeof value === 'bigint') throw new Error('a fixture contains an integer outside JSON precision; retain it in the binary session')
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('a non-finite fixture number cannot be represented in JSON')
  if (Array.isArray(value)) return value.map(jsonValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonValue(v)]))
  return value
}

/** Yield case ranges only after the complete source session has passed integrity validation. */
function * sessionFixtures (file, { names, binary = false, onValidated } = {}) {
  // First pass verifies the footer and every checksum before a consumer writes any derived fixture.
  let catalog
  const hash = crypto.createHash('sha256')
  for (const event of readSession(file, { onBytes: bytes => hash.update(bytes) })) {
    if (event.e === 'catalog_end') catalog = new Map(event.cases.map(item => [item.name, item.status]))
  }
  const digest = hash.digest('hex')
  onValidated?.({ digest, catalog })
  const value = binary ? v => v : jsonValue
  let header, current
  const secondHash = crypto.createHash('sha256')
  for (const event of readSession(file, { onBytes: bytes => secondHash.update(bytes) })) {
    if (event.e === 'session_start') header = event
    if (event.e === 'case_start') {
      if (current) throw new Error(`nested case at event ${event.seq}`)
      current = { name: event.name, first: event.seq, rows: [] }
    } else if (event.e === 'case_tick') {
      if (!current || current.name !== event.name) throw new Error(`case tick outside its range at event ${event.seq}`)
      if (event.row.t !== current.rows.length + 1) throw new Error(`case tick gap at event ${event.seq}`)
      current.rows.push(value(event.row))
    } else if (event.e === 'case_world') {
      if (!current || current.name !== event.name) throw new Error(`world outside its case range at event ${event.seq}`)
      current.world = value(event.world)
    } else if (event.e === 'case_summary') {
      if (!current || current.name !== event.name) throw new Error(`summary outside its range at event ${event.seq}`)
      current.summary = event
    } else if (event.e === 'case_end') {
      if (!current || current.name !== event.name) throw new Error(`unmatched case end at event ${event.seq}`)
      if (current.summary?.status === 'ok' && (!catalog || catalog.get(current.name) === 'ok') && (!names || names.has(current.name))) {
        const fixture = value(current.summary.fixture)
        if (fixture.name !== current.name || fixture.version !== header.gameVersion) throw new Error('fixture identity differs from session')
        if (fixture.frames !== current.rows.length) throw new Error(`fixture frame count differs for ${current.name}`)
        fixture.ticks = current.rows
        fixture.sourceSession = {
          file: path.basename(file),
          sessionId: header.sessionId,
          firstEvent: current.first,
          lastEvent: event.seq,
          gameVersion: header.gameVersion,
          protocolVersion: header.protocolVersion,
          dataRevision: header.dataRevision,
          capabilities: header.capabilities,
          ...(binary ? { digest } : {}),
          world: current.world || null
        }
        yield fixture
      }
      current = null
    }
  }
  if (current) throw new Error('session ended inside a case')
  if (secondHash.digest('hex') !== digest) throw new Error('source session changed during import')
}

function exportSessionFixtures (file, target, options = {}) {
  const fixtures = sessionFixtures(file, options)
  // Advancing once validates the entire source before writing. Stream the remaining cases so a full catalog
  // never retains every tick and world snapshot in memory at the same time.
  let next = fixtures.next()
  try {
    fs.mkdirSync(path.join(target, 'sessions'), { recursive: true })
    fs.mkdirSync(path.join(target, 'scenarios'), { recursive: true })
    const headerReader = readSession(file)
    const header = headerReader.next().value
    headerReader.return()
    const sourceName = crypto.createHash('sha256').update(header.sessionId).digest('hex') + '.bin'
    const source = path.join(target, 'sessions', sourceName)
    if (fs.existsSync(source)) {
      const from = fs.statSync(file); const retained = fs.statSync(source)
      if (from.dev !== retained.dev || from.ino !== retained.ino) throw new Error(`retained source session already exists: ${source}`)
    } else {
    // A second hard link retains the complete binary if either path is removed, without duplicating chunk payloads.
      try { fs.linkSync(file, source) } catch (error) {
        if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error
        fs.copyFileSync(file, source, fs.constants.COPYFILE_EXCL)
      }
    }
    const exported = new Set()
    const areas = new Map()
    const worldFile = path.join(target, 'world.json')
    if (fs.existsSync(worldFile)) for (const area of JSON.parse(fs.readFileSync(worldFile)).areas) areas.set(area.name, area)
    for (; !next.done; next = fixtures.next()) {
      const fixture = next.value
      if (/[\\/:\0]/.test(fixture.name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fixture.name)) {
        throw new Error(`invalid fixture file name: ${fixture.name}`)
      }
      if (exported.has(fixture.name)) continue // Keep the first verified run, matching the catalog exporter.
      exported.add(fixture.name)
      fixture.sourceSession.file = sourceName
      if (fixture.sourceSession.world) areas.set(fixture.sourceSession.world.name, fixture.sourceSession.world)
      fs.writeFileSync(path.join(target, 'scenarios', `${fixture.name}.json`), JSON.stringify(fixture,
        (_, value) => typeof value === 'number' && Object.is(value, -0) ? JSON.rawJSON('-0.0') : value, 2) + '\n')
    }
    if (areas.size) fs.writeFileSync(worldFile, JSON.stringify({ version: header.gameVersion, areas: [...areas.values()] }, null, 2) + '\n')
    fs.writeFileSync(path.join(target, 'index.json'), JSON.stringify({
      version: header.gameVersion,
      sourceSessions: [sourceName],
      cases: [...exported].map(name => ({ name, status: 'ok' }))
    }, null, 2) + '\n')
    return [...exported]
  } finally { fixtures.return() }
}
module.exports = { sessionFixtures, exportSessionFixtures }
