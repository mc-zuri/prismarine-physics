'use strict'
// PHYSREC2: u32be length, u32be CRC32, one definite-length CBOR value per frame.
const fs = require('fs')
const zlib = require('zlib')
const MAGIC = Buffer.from('PHYSREC2')
const MAX_FRAME = 256 * 1024 * 1024

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
function crc32 (buffer) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buffer)
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function decode (buffer) {
  let at = 0
  const need = n => { if (at + n > buffer.length) throw new Error('truncated CBOR value') }
  function read () {
    need(1)
    const tag = buffer[at++]; const major = tag >>> 5; const ai = tag & 31
    if (major === 7) {
      if (ai === 20) return false
      if (ai === 21) return true
      if (ai === 22) return null
      if (ai === 26) { need(4); const n = buffer.readFloatBE(at); at += 4; return n }
      if (ai === 27) { need(8); const n = buffer.readDoubleBE(at); at += 8; return n }
      throw new Error(`unsupported CBOR simple value ${ai}`)
    }
    let n
    if (ai < 24) n = ai
    else if (ai === 24) { need(1); n = buffer[at++] } else if (ai === 25) { need(2); n = buffer.readUInt16BE(at); at += 2 } else if (ai === 26) { need(4); n = buffer.readUInt32BE(at); at += 4 } else if (ai === 27) { need(8); const v = buffer.readBigUInt64BE(at); at += 8; n = v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v } else throw new Error('indefinite or reserved CBOR length')
    if (major === 0) return n
    if (major === 1) return typeof n === 'bigint' ? -1n - n : -1 - n
    if (typeof n === 'bigint' || n > MAX_FRAME) throw new Error('CBOR collection too large')
    if (major === 2 || major === 3) { need(n); const bytes = buffer.subarray(at, at + n); at += n; return major === 2 ? Buffer.from(bytes) : bytes.toString('utf8') }
    if (major === 4) { const out = []; for (let i = 0; i < n; i++) out.push(read()); return out }
    if (major === 5) {
      const out = {}
      for (let i = 0; i < n; i++) {
        const key = read()
        if (typeof key !== 'string' || Object.hasOwn(out, key)) throw new Error('invalid or duplicate CBOR map key')
        Object.defineProperty(out, key, { value: read(), enumerable: true, writable: true, configurable: true })
      }
      return out
    }
    throw new Error(`unsupported CBOR major type ${major}`)
  }
  const value = read()
  if (at !== buffer.length) throw new Error('trailing bytes in CBOR frame')
  return value
}

function encode (value) {
  const parts = []
  function head (major, n) {
    n = BigInt(n)
    let b
    if (n < 24n) b = Buffer.from([(major << 5) | Number(n)])
    else if (n <= 255n) b = Buffer.from([(major << 5) | 24, Number(n)])
    else if (n <= 65535n) { b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(Number(n), 1) } else if (n <= 0xffffffffn) { b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(Number(n), 1) } else { b = Buffer.alloc(9); b[0] = (major << 5) | 27; b.writeBigUInt64BE(n, 1) }
    parts.push(b)
  }
  function write (v) {
    if (v === null) parts.push(Buffer.from([0xf6]))
    else if (typeof v === 'boolean') parts.push(Buffer.from([v ? 0xf5 : 0xf4]))
    else if (Buffer.isBuffer(v) || v instanceof Uint8Array) { head(2, v.length); parts.push(Buffer.from(v)) } else if (typeof v === 'string') { const b = Buffer.from(v); head(3, b.length); parts.push(b) } else if (typeof v === 'bigint' || (Number.isSafeInteger(v) && !Object.is(v, -0))) head(v < 0 ? 1 : 0, v < 0 ? -1n - BigInt(v) : BigInt(v))
    else if (typeof v === 'number') { const b = Buffer.alloc(9); b[0] = 0xfb; b.writeDoubleBE(v, 1); parts.push(b) } else if (Array.isArray(v)) { head(4, v.length); v.forEach(write) } else if (v && typeof v === 'object') { const entries = Object.entries(v); head(5, entries.length); for (const [k, x] of entries) { write(k); write(x) } } else throw new Error(`unsupported CBOR value ${typeof v}`)
  }
  write(value)
  return Buffer.concat(parts)
}

function frame (record) {
  const bytes = encode(record); const prefix = Buffer.alloc(8)
  prefix.writeUInt32BE(bytes.length); prefix.writeUInt32BE(crc32(bytes), 4)
  return Buffer.concat([prefix, bytes])
}

function * readSession (file, { allowIncomplete = false, onBytes } = {}) {
  const fd = fs.openSync(file, 'r')
  // Millions of small frames otherwise issue two synchronous filesystem calls each.
  // Allocate on refill so a prefix or onBytes view remains valid across subsequent reads.
  let buffered = Buffer.alloc(0); let offset = 0
  function read (n, eof = false) {
    if (buffered.length - offset >= n) {
      const bytes = buffered.subarray(offset, offset + n)
      offset += n
      onBytes?.(bytes)
      return bytes
    }
    const bytes = Buffer.allocUnsafe(n)
    let at = 0
    while (at < n) {
      if (offset === buffered.length) {
        const next = Buffer.allocUnsafe(1024 * 1024)
        const got = fs.readSync(fd, next, 0, next.length)
        if (!got) { if (eof && at === 0) return null; throw new Error('truncated session frame') }
        buffered = next.subarray(0, got); offset = 0
      }
      const count = Math.min(n - at, buffered.length - offset)
      buffered.copy(bytes, at, offset, offset + count)
      offset += count; at += count
    }
    onBytes?.(bytes)
    return bytes
  }
  try {
    if (!read(8).equals(MAGIC)) throw new Error('not a PHYSREC2 binary session')
    let seq = 0n; let footer = false; let time = 0n; const counts = Object.create(null)
    for (let prefix = read(8, true); prefix; prefix = read(8, true)) {
      if (footer) throw new Error('records after session footer')
      const n = prefix.readUInt32BE(0)
      if (!n || n > MAX_FRAME) throw new Error('invalid session frame length')
      const bytes = read(n)
      if (crc32(bytes) !== prefix.readUInt32BE(4)) throw new Error(`session checksum mismatch after event ${seq}`)
      const event = decode(bytes)
      if (!event || typeof event.e !== 'string') throw new Error('invalid session record')
      const integer = value => typeof value === 'bigint' || Number.isSafeInteger(value)
      if (!integer(event.seq) || !integer(event.timeNs) || event.seq <= 0 || event.timeNs < 0) throw new Error('invalid event sequence or timestamp')
      const nextSeq = BigInt(event.seq); const nextTime = BigInt(event.timeNs)
      if (nextSeq !== seq + 1n && !allowIncomplete) throw new Error(`missing or reordered session event ${seq + 1n}`)
      if (nextTime < time) throw new Error('session time moved backwards')
      time = nextTime; seq = nextSeq
      if (seq === 1n && (event.e !== 'session_start' || event.schema !== 2)) throw new Error('missing or unsupported session header')
      if (event.e === 'session_end') {
        footer = true
        if (!event.complete && !allowIncomplete) throw new Error(`incomplete session: ${event.failure}`)
        if (JSON.stringify(Object.entries(counts).sort()) !== JSON.stringify(Object.entries(event.counts).sort())) throw new Error('session census does not match footer')
      } else counts[event.e] = (counts[event.e] ?? 0) + 1
      yield event
    }
    if (!footer && !allowIncomplete) throw new Error('session has no completion footer')
  } finally { fs.closeSync(fd) }
}

function inspectSession (file) {
  let header; let footer; let events = 0
  for (const event of readSession(file)) { header ??= event; footer = event; events++ }
  return { header, footer, events }
}

function readLegacySession (file) {
  const bytes = fs.readFileSync(file)
  const text = (file.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes).toString('utf8')
  return { capabilities: { legacy: true, fullLifecycle: false, completePayloads: false }, events: text.split('\n').filter(Boolean).map(JSON.parse) }
}
module.exports = { MAGIC, encode, decode, crc32, frame, readSession, inspectSession, readLegacySession }
