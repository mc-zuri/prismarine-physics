'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { MAGIC, frame, readSession } = require('../lib/session-format')

function capture (body) {
  const records = [{ e: 'session_start', seq: 1, timeNs: 0, schema: 2 }, { e: 'payload', seq: 2, timeNs: 1, body }, { e: 'session_end', seq: 3, timeNs: 2, complete: true, counts: { session_start: 1, payload: 1 } }]
  return { records, bytes: Buffer.concat([MAGIC, ...records.map(frame)]) }
}

test('buffered reader preserves frames, retained byte views and payloads across read boundaries', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-buffer-'))
  t.after(() => fs.rmSync(directory, { recursive: true }))
  const file = path.join(directory, 'session.bin')
  for (const length of [0, 1024 * 1024 - 80, 1024 * 1024, 3 * 1024 * 1024 + 17]) {
    const { records, bytes } = capture(Buffer.alloc(length, 0xa5))
    fs.writeFileSync(file, bytes)
    const chunks = []
    assert.deepEqual([...readSession(file, { onBytes: bytes => chunks.push(bytes) })], records)
    assert.deepEqual(Buffer.concat(chunks), bytes)
  }
})

test('buffering retains checksum, truncation, footer and trailing-data checks', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-buffer-errors-'))
  t.after(() => fs.rmSync(directory, { recursive: true }))
  const file = path.join(directory, 'session.bin')
  const { bytes } = capture(Buffer.alloc(2 * 1024 * 1024, 0xa5))
  for (const length of [0, 7, 1024 * 1024 - 1, 1024 * 1024, bytes.length - 1]) {
    fs.writeFileSync(file, bytes.subarray(0, length))
    assert.throws(() => [...readSession(file)], /truncated session frame/)
  }
  const corrupt = Buffer.from(bytes)
  corrupt[1024 * 1024] ^= 1
  fs.writeFileSync(file, corrupt)
  assert.throws(() => [...readSession(file)], /checksum mismatch/)
  fs.writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(8)]))
  assert.throws(() => [...readSession(file)], /records after session footer/)
  fs.writeFileSync(file, Buffer.concat([MAGIC, frame({ e: 'session_start', seq: 1, timeNs: 0, schema: 2 })]))
  assert.throws(() => [...readSession(file)], /no completion footer/)
})
