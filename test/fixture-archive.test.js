'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { openArchive, createArchiveWriter, contentHash } = require('../lib/fixture-archive')
const { putWorld, createFixtureStore, MANIFEST, validateFixtures, migrate } = require('../lib/fixture-store')
const { importSession, mergeArchive } = require('../lib/fixture-import')
const { MAGIC, frame, crc32 } = require('../lib/session-format')

function temp (t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfix-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}
function archive (file, entries, kind = 'fixtures') {
  const writer = createArchiveWriter(file, kind)
  try { for (const [name, value] of Object.entries(entries)) writer.put(name, value); writer.finish() } finally { writer.abort() }
}
const world = { name: 'flat', origin: [0, 0, 0], fills: [[0, 0, 0, 1, 0, 1, 'stone']] }
function capture (file, { complete = true, x = -0, version = '1.21.10', bad = false } = {}) {
  const records = [
    { e: 'session_start', schema: 2, sessionId: 'test', gameVersion: version, protocolVersion: 773, dataRevision: 'test', capabilities: {} },
    { e: 'case_start', name: 'walk' },
    { e: 'case_world', name: 'walk', world },
    { e: 'case_tick', name: 'walk', row: { t: 1, pos: [x, 1, 0], clientPackets: [{ bytes: Buffer.from([1, 2, 3]) }] } },
    { e: 'case_summary', name: 'walk', status: 'ok', fixture: { version, name: 'walk', frames: 1, area: 'flat', start: {}, steps: [] } },
    { e: 'case_end', name: 'walk' },
    { e: 'catalog_end', cases: [{ name: 'walk', status: bad ? 'failed' : 'ok' }] }
  ]
  const counts = Object.fromEntries(records.map(r => [r.e, 1]))
  records.push({ e: 'session_end', complete, counts })
  fs.writeFileSync(file, Buffer.concat([MAGIC, ...records.map((r, i) => frame({ ...r, seq: i + 1, timeNs: i }))]))
}

test('typed payloads, independent direct reads and deterministic archives', t => {
  const dir = temp(t); const file = path.join(dir, 'a.pfix'); const other = path.join(dir, 'b.pfix')
  const value = { zero: -0, precise: 0.12345678901234568, large: 2n ** 60n, bytes: Buffer.from([0, 255]), flags: [true, false, null], text: '世界' }
  archive(file, { z: value, a: Array(50000).fill(42) })
  archive(other, { a: Array(50000).fill(42), z: { ...value } })
  assert.deepEqual(fs.readFileSync(file), fs.readFileSync(other))
  const a = openArchive(file)
  try {
    assert.deepEqual(a.list(), ['a', 'z']); assert.deepEqual(a.read('z'), value)
    const fd = fs.openSync(file, 'r+'); const entry = a.entries.get('a')
    fs.writeSync(fd, Buffer.from([255]), 0, 1, entry.offset); fs.closeSync(fd)
    assert.deepEqual(a.read('z'), value)
    assert.throws(() => a.read('a'))
    assert.throws(() => a.read('absent'), /missing archive entry/)
  } finally { a.close() }
  assert.throws(() => a.read('z'), /closed/)
})

test('rejects truncation, unsupported versions and corrupt indexes', t => {
  const dir = temp(t); const file = path.join(dir, 'a.pfix')
  archive(file, { a: [1, 2, 3] }); const bytes = fs.readFileSync(file)
  for (const length of [0, 7, 39, bytes.length - 1]) {
    fs.writeFileSync(file, bytes.subarray(0, length)); assert.throws(() => openArchive(file))
  }
  const bad = Buffer.from(bytes); bad.writeUInt16BE(2, 8); fs.writeFileSync(file, bad)
  assert.throws(() => openArchive(file), /unsupported/)
  const index = Buffer.from(bytes); index[40] ^= 1; fs.writeFileSync(file, index)
  assert.throws(() => openArchive(file), /index checksum/)
})

test('64-bit positional offsets read beyond 4 GiB without large allocations', t => {
  const dir = temp(t); const file = path.join(dir, 'large.pfix')
  archive(file, { a: { n: 42 } })
  const bytes = fs.readFileSync(file); const offset = 2 ** 32 + 4096
  const indexLength = Number(bytes.readBigUInt64BE(16)); const data = bytes.subarray(40 + indexLength)
  const prefix = Buffer.from(bytes.subarray(0, 40 + indexLength))
  prefix.writeBigUInt64BE(BigInt(offset), 48)
  prefix.writeUInt32BE(crc32(prefix.subarray(40)), 24); prefix.writeUInt32BE(crc32(prefix.subarray(0, 28)), 28)
  const fd = fs.openSync(file, 'w')
  try { fs.writeSync(fd, prefix); fs.writeSync(fd, data, 0, data.length, offset) } finally { fs.closeSync(fd) }
  const a = openArchive(file)
  try { assert.deepEqual(a.read('a'), { n: 42 }) } finally { a.close() }
})

test('rejects duplicate names, unsupported schemas and decompression beyond declared size', t => {
  const dir = temp(t); const file = path.join(dir, 'a.pfix')
  archive(file, { a: 'a'.repeat(10000), b: 2 })
  const original = fs.readFileSync(file)
  const change = mutate => {
    const bytes = Buffer.from(original); mutate(bytes)
    const length = Number(bytes.readBigUInt64BE(16))
    bytes.writeUInt32BE(crc32(bytes.subarray(40, 40 + length)), 24)
    bytes.writeUInt32BE(crc32(bytes.subarray(0, 28)), 28)
    fs.writeFileSync(file, bytes)
  }
  change(b => { b[121] = 'a'.charCodeAt(0) })
  assert.throws(() => openArchive(file), /duplicate/)
  change(b => b.writeUInt16BE(2, 42))
  assert.throws(() => openArchive(file), /unsupported entry/)
  change(b => b.writeBigUInt64BE(2n, 64))
  const a = openArchive(file)
  try { assert.throws(() => a.read('a')) } finally { a.close() }
})

test('failed publication leaves previous archive intact and removes spool', t => {
  const dir = temp(t); const file = path.join(dir, 'a.pfix'); archive(file, { a: 1 })
  const before = fs.readFileSync(file); const writer = createArchiveWriter(file, 'fixtures')
  writer.put('a', 2)
  assert.throws(() => writer.finish(() => { throw new Error('validation failed') }), /validation failed/)
  assert.deepEqual(fs.readFileSync(file), before); assert.deepEqual(fs.readdirSync(dir), ['a.pfix'])
})

test('world revisions deduplicate across versions and verify content', t => {
  const root = temp(t)
  const hash = putWorld(root, { version: '1.21.10', areas: [world] })
  assert.equal(hash, putWorld(root, { version: '26.3', areas: [world] }))
  const changed = putWorld(root, { areas: [{ ...world, origin: [1, 0, 0] }] })
  assert.notEqual(hash, changed)
  const store = createFixtureStore(root)
  try {
    assert.deepEqual(store.area({ worldHash: hash, area: 'flat' }), world)
    assert.throws(() => store.area({ worldHash: hash, area: 'absent' }), /no area/)
    assert.throws(() => store.area({ worldHash: '0'.repeat(64), area: 'flat' }), /ENOENT/)
    assert.throws(() => store.area({ worldHash: '../escape', area: 'flat' }), /invalid world hash/)
  } finally { store.close() }
})

test('session import preserves packet buffers, rejects incomplete sources and handles conflicts', t => {
  const root = temp(t); const file = path.join(root, 'session.bin')
  capture(file)
  assert.throws(() => importSession(file, root, { expectedDigest: '0'.repeat(64) }), /hash differs/)
  assert.throws(() => importSession(file, root, { expectedVersion: '26.3' }), /version differs/)
  assert.equal(importSession(file, root).added, 1)
  const target = path.join(root, 'java/1.21.10.pfix'); const before = fs.readFileSync(target)
  assert.equal(importSession(file, root).identical, 1)
  const store = createFixtureStore(root)
  try {
    const f = store.fixture('1.21.10', 'walk')
    assert(Object.is(f.ticks[0].pos[0], -0)); assert(Buffer.isBuffer(f.ticks[0].clientPackets[0].bytes))
    assert.deepEqual(store.area(f), world)
  } finally { store.close() }
  capture(file, { complete: false }); assert.throws(() => importSession(file, root, { conflict: 'replace' }), /incomplete/)
  assert.deepEqual(fs.readFileSync(target), before)
  capture(file, { x: 1 }); assert.throws(() => importSession(file, root), /already exists/)
  assert.equal(importSession(file, root, { conflict: 'keep' }).kept, 1)
  assert.deepEqual(fs.readFileSync(target), before)
  assert.equal(importSession(file, root, { conflict: 'replace' }).replaced, 1)
  const destination = path.join(root, 'merged')
  assert.equal(mergeArchive(target, destination).added, 1)
  const a = openArchive(target); const b = openArchive(path.join(destination, 'java/1.21.10.pfix'))
  try {
    assert.equal(contentHash(a.read('walk')), contentHash(b.read('walk')))
    validateFixtures(b, destination)
    assert.equal(b.read(MANIFEST).version, '1.21.10')
  } finally { a.close(); b.close() }
})

test('directory import validates its manifest and retains unrelated cases on replacement', t => {
  const root = temp(t); const source = path.join(root, 'source'); const target = path.join(root, 'target')
  fs.mkdirSync(source)
  const file = path.join(source, 'session.bin'); capture(file)
  fs.writeFileSync(path.join(source, 'index.json'), JSON.stringify({ recordings: [{ session: 'session.bin', version: '1.21.10' }] }))
  const { main } = require('../scripts/fixtures')
  main(['import-session', source, '--root', target])
  const { updateVersion } = require('../lib/fixture-import')
  const store = createFixtureStore(target); const walk = store.fixture('1.21.10', 'walk'); store.close()
  updateVersion(target, '1.21.10', 'error', put => put({ ...walk, name: 'unrelated' }))
  capture(file, { x: 2 })
  main(['import-session', source, '--root', target, '--conflict', 'replace'])
  const after = createFixtureStore(target)
  try { assert.equal(contentHash(after.fixture('1.21.10', 'unrelated')), contentHash({ ...walk, name: 'unrelated' })) } finally { after.close() }
  fs.writeFileSync(path.join(source, 'index.json'), JSON.stringify({ recordings: [{ session: '../escape.bin' }] }))
  assert.throws(() => main(['import-session', source, '--root', target]), /escapes/)
})

test('legacy migration externalizes inline worlds and preserves signed zero and packet bytes', t => {
  const root = temp(t); const legacy = path.join(root, 'legacy/1.21.10-recorded')
  fs.mkdirSync(path.join(legacy, 'scenarios'), { recursive: true })
  fs.writeFileSync(path.join(legacy, 'world.json'), JSON.stringify({ version: '1.21.10', areas: [world] }))
  fs.writeFileSync(path.join(legacy, 'index.json'), JSON.stringify({ version: '1.21.10', cases: [{ name: 'walk', status: 'ok' }] }))
  fs.writeFileSync(path.join(legacy, 'scenarios/walk.json'), '{"version":"1.21.10","name":"walk","area":"flat","frames":1,"ticks":[{"t":1,"x":-0.0,"clientPackets":[{"bytes":"00ff"}]}],"sourceSession":{"world":' + JSON.stringify(world) + '}}')
  const target = path.join(root, 'target')
  assert.equal(migrate(target, path.dirname(legacy), () => {})[0].fixtures, 1)
  const store = createFixtureStore(target)
  try {
    const fixture = store.fixture('1.21.10', 'walk')
    assert(Object.is(fixture.ticks[0].x, -0)); assert.deepEqual(fixture.ticks[0].clientPackets[0].bytes, Buffer.from([0, 255]))
    assert.equal(fixture.sourceSession.world, undefined); assert.deepEqual(store.area(fixture), world)
  } finally { store.close() }
})
