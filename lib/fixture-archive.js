'use strict'
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')
const { encode, decode, crc32 } = require('./session-format')

const MAGIC = Buffer.from('PHYSFIX\0')
const HEADER = 40
const ENTRY = 40
const MAX_ENTRY = 256 * 1024 * 1024
const MAX_INDEX = 64 * 1024 * 1024
const KINDS = { fixtures: 1, world: 2 }

function canonical (value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value)
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]))
  return value
}
const contentHash = value => crypto.createHash('sha256').update(encode(canonical(value))).digest('hex')

function readAt (fd, length, position) {
  const bytes = Buffer.allocUnsafe(length)
  let at = 0
  while (at < length) {
    const n = fs.readSync(fd, bytes, at, length - at, position + at)
    if (!n) throw new Error('truncated fixture archive')
    at += n
  }
  return bytes
}

function uint64 (bytes, at) {
  const n = bytes.readBigUInt64BE(at)
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('archive offset exceeds safe filesystem range')
  return Number(n)
}

function openArchive (file) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const h = readAt(fd, HEADER, 0)
    if (!h.subarray(0, 8).equals(MAGIC)) throw new Error('not a PHYSFIX archive')
    if (h.readUInt16BE(8) !== 1) throw new Error('unsupported fixture archive version')
    const kind = Object.keys(KINDS).find(k => KINDS[k] === h.readUInt16BE(10))
    if (!kind || h.readBigUInt64BE(32) !== 0n) throw new Error('unsupported archive kind or flags')
    if (crc32(h.subarray(0, 28)) !== h.readUInt32BE(28)) throw new Error('archive header checksum mismatch')
    const count = h.readUInt32BE(12); const indexLength = uint64(h, 16)
    if (indexLength > MAX_INDEX || HEADER + indexLength > size || count * ENTRY > indexLength) throw new Error('invalid archive index length')
    const index = readAt(fd, indexLength, HEADER)
    if (crc32(index) !== h.readUInt32BE(24)) throw new Error('archive index checksum mismatch')
    const entries = new Map()
    let at = 0; let end = HEADER + indexLength; let previous = ''
    for (let i = 0; i < count; i++) {
      if (at + ENTRY > index.length) throw new Error('truncated archive index')
      const n = index.readUInt16BE(at)
      const schema = index.readUInt16BE(at + 2); const codec = index[at + 4]
      const offset = uint64(index, at + 8); const stored = uint64(index, at + 16); const raw = uint64(index, at + 24)
      const checksum = index.readUInt32BE(at + 32)
      if (schema !== 1 || codec > 1 || index.readUIntBE(at + 5, 3) || index.readUInt32BE(at + 36)) throw new Error('unsupported entry schema or codec')
      at += ENTRY
      if (!n || at + n > index.length) throw new Error('invalid archive entry name')
      const name = index.toString('utf8', at, at + n)
      if (!Buffer.from(name).equals(index.subarray(at, at + n)) || name.includes('\0') || (i && name <= previous)) throw new Error('invalid, unsorted or duplicate archive entry')
      if (!stored || !raw || raw > MAX_ENTRY || stored > MAX_ENTRY || offset < end || offset > size - stored) throw new Error('invalid archive entry bounds')
      entries.set(name, { name, schema, codec, offset, stored, raw, checksum })
      previous = name; end = offset + stored; at += n
    }
    if (at !== index.length || end !== size) throw new Error('trailing archive data')
    let closed = false
    const ensure = () => { if (closed) throw new Error('archive is closed') }
    const archive = {
      file,
      kind,
      entries,
      list: () => { ensure(); return [...entries.keys()] },
      has: name => { ensure(); return entries.has(name) },
      stored (name) {
        ensure()
        const entry = entries.get(name)
        if (!entry) throw new Error(`missing archive entry: ${name}`)
        return readAt(fd, entry.stored, entry.offset)
      },
      read (name) {
        const bytes = archive.stored(name); const entry = entries.get(name)
        const raw = entry.codec === 1 ? zlib.inflateRawSync(bytes, { maxOutputLength: entry.raw }) : bytes
        if (raw.length !== entry.raw || crc32(raw) !== entry.checksum) throw new Error(`archive entry checksum or length mismatch: ${name}`)
        return decode(raw)
      },
      close () { if (!closed) { closed = true; fs.closeSync(fd) } }
    }
    return archive
  } catch (error) { fs.closeSync(fd); throw error }
}

// A disk spool bounds memory to one decoded entry, including when replacing existing entries.
function createArchiveWriter (file, kind) {
  if (!KINDS[kind]) throw new Error(`unknown archive kind: ${kind}`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const dir = fs.mkdtempSync(path.join(path.dirname(file), '.pfix-'))
  const spool = fs.openSync(path.join(dir, 'spool'), 'w+')
  const entries = new Map()
  let position = 0; let closed = false
  const writer = {
    entries,
    putStored (name, entry, bytes) {
      if (closed) throw new Error('archive writer is closed')
      const length = Buffer.byteLength(name)
      if (!length || length > 65535 || name.includes('\0')) throw new Error('invalid archive entry name')
      if (bytes.length !== entry.stored) throw new Error('stored entry length mismatch')
      let at = 0
      while (at < bytes.length) at += fs.writeSync(spool, bytes, at, bytes.length - at, position + at)
      entries.set(name, { ...entry, name, offset: position })
      position += bytes.length
    },
    put (name, value) {
      const raw = encode(canonical(value))
      if (raw.length > MAX_ENTRY) throw new Error('fixture entry exceeds 256 MiB')
      const deflated = zlib.deflateRawSync(raw, { level: 6 })
      const codec = deflated.length < raw.length ? 1 : 0
      const bytes = codec ? deflated : raw
      writer.putStored(name, { schema: 1, codec, raw: raw.length, stored: bytes.length, checksum: crc32(raw) }, bytes)
    },
    copy (archive, name) {
      archive.read(name) // Validate even entries that are copied without re-encoding.
      writer.putStored(name, archive.entries.get(name), archive.stored(name))
    },
    finish (validate, { exclusive = false } = {}) {
      try {
        const sorted = [...entries.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
        const length = sorted.reduce((n, e) => n + ENTRY + Buffer.byteLength(e.name), 0)
        if (length > MAX_INDEX) throw new Error('archive index too large')
        const index = Buffer.alloc(length)
        let at = 0; let offset = HEADER + length
        for (const entry of sorted) {
          const name = Buffer.from(entry.name)
          index.writeUInt16BE(name.length, at); index.writeUInt16BE(1, at + 2); index[at + 4] = entry.codec
          index.writeBigUInt64BE(BigInt(offset), at + 8); index.writeBigUInt64BE(BigInt(entry.stored), at + 16)
          index.writeBigUInt64BE(BigInt(entry.raw), at + 24); index.writeUInt32BE(entry.checksum, at + 32)
          name.copy(index, at + ENTRY); at += ENTRY + name.length; offset += entry.stored
        }
        const h = Buffer.alloc(HEADER)
        MAGIC.copy(h); h.writeUInt16BE(1, 8); h.writeUInt16BE(KINDS[kind], 10); h.writeUInt32BE(sorted.length, 12)
        h.writeBigUInt64BE(BigInt(length), 16); h.writeUInt32BE(crc32(index), 24); h.writeUInt32BE(crc32(h.subarray(0, 28)), 28)
        const temp = path.join(dir, 'archive')
        const out = fs.openSync(temp, 'wx')
        try {
          const write = bytes => { let n = 0; while (n < bytes.length) n += fs.writeSync(out, bytes, n, bytes.length - n) }
          write(h); write(index)
          for (const entry of sorted) {
            for (let n = 0; n < entry.stored; n += 1024 * 1024) write(readAt(spool, Math.min(1024 * 1024, entry.stored - n), entry.offset + n))
          }
          fs.fsyncSync(out)
        } finally { fs.closeSync(out) }
        const check = openArchive(temp)
        try { for (const name of check.list()) check.read(name); validate?.(check) } finally { check.close() }
        if (exclusive) fs.linkSync(temp, file)
        else fs.renameSync(temp, file)
      } finally { writer.abort() }
    },
    abort () {
      if (!closed) { closed = true; fs.closeSync(spool); fs.rmSync(dir, { recursive: true, force: true }) }
    }
  }
  return writer
}

module.exports = { openArchive, createArchiveWriter, canonical, contentHash, readAt }
