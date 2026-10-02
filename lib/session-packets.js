'use strict'
const { data: minecraftData, dataId, revision } = require('./session-data')()
const mc = require('minecraft-protocol')
const { readSession } = require('./session-format')
const crypto = require('crypto')
const fs = require('fs')

class SessionPacketDecoder {
  constructor (header, { roundTrip = true, allowDataRevisionMismatch = false } = {}) {
    this.header = header
    this.data = minecraftData(header.gameVersion)
    if (!this.data) throw new Error(`no minecraft-data for ${header.gameVersion} (${dataId})`)
    if (this.data.version.version !== header.protocolVersion) {
      throw new Error(`protocol mismatch: ${header.gameVersion} capture=${header.protocolVersion}, data=${this.data.version.version}`)
    }
    if (this.data.version.minecraftVersion !== header.gameVersion) throw new Error(`requested version was replaced by ${this.data.version.minecraftVersion}`)
    if (header.dataRevision?.startsWith('sha256:') && header.dataRevision !== revision(header.gameVersion) && !allowDataRevisionMismatch) {
      throw new Error(`minecraft-data revision differs: recorded ${header.dataRevision}, loaded ${revision(header.gameVersion)}`)
    }
    this.codecs = new Map()
    this.roundTrip = roundTrip
  }

  decode (event) {
    if (event.e !== 'packet') throw new Error(`event ${event.seq} is not a packet`)
    if (!Buffer.isBuffer(event.bytes) || !event.bytes.length) throw new Error(`packet ${event.seq} has no binary payload`)
    if (!['clientbound', 'serverbound'].includes(event.direction)) throw new Error(`invalid packet direction at event ${event.seq}`)
    const state = event.state === 'handshake' ? 'handshaking' : event.state
    const key = `${state}/${event.direction}`
    try {
      if (!this.codecs.has(key)) {
        if (this.header.gameVersion === '0.30c' && state !== 'classic') throw new Error(`Classic has no ${state} protocol phase`)
        const options = this.header.gameVersion === '0.30c'
          ? require('./session-classic-codec').classicCodecOptions(this.data)
          : { state }
        this.codecs.set(key, {
          reader: mc.createDeserializer({ ...options, isServer: event.direction === 'serverbound', version: this.header.gameVersion, noErrorLogging: true }),
          writer: mc.createSerializer({ ...options, isServer: event.direction === 'clientbound', version: this.header.gameVersion })
        })
      }
      const { reader, writer } = this.codecs.get(key)
      const parsed = reader.parsePacketBuffer(event.bytes)
      // ProtoDef preserves unmapped IDs as numbers and can round-trip them without
      // decoding any packet fields. A byte match alone does not prove schema coverage.
      if (typeof parsed.data.name !== 'string') throw new Error(`unmapped packet id ${parsed.data.name}`)
      if (parsed.metadata.size !== event.bytes.length) throw new Error(`schema consumed ${parsed.metadata.size}/${event.bytes.length} bytes`)
      if (state === 'handshaking' && parsed.data.name === 'set_protocol' && parsed.data.params.protocolVersion !== this.header.protocolVersion) {
        throw new Error(`native handshake protocol ${parsed.data.params.protocolVersion} differs from session protocol ${this.header.protocolVersion}`)
      }
      if (state === 'classic' && ['player_identification', 'server_identification'].includes(parsed.data.name) &&
          parsed.data.params.protocol_version !== this.header.protocolVersion) {
        throw new Error(`native Classic identification protocol ${parsed.data.params.protocol_version} differs from session protocol ${this.header.protocolVersion}`)
      }
      if (this.roundTrip) {
        const encoded = writer.createPacketBuffer(parsed.data)
        if (!encoded.equals(event.bytes)) throw new Error(`schema round-trip changed bytes of ${parsed.data.name}`)
      }
      return { ...event, name: parsed.data.name, params: parsed.data.params }
    } catch (error) {
      throw new Error(`event ${event.seq}, packet ${event.packetId}, ${key}, ${this.header.gameVersion}: ${error.message}`, { cause: error })
    }
  }
}

function * loadPackets (file, options) {
  let decoder
  for (const event of readSession(file, options)) {
    if (event.e === 'session_start') decoder = new SessionPacketDecoder(event, options)
    yield event.e === 'packet' ? decoder.decode(event) : event
  }
}
/** Revalidate a closed native capture against a selected data revision, retaining its original provenance. */
function validatePackets (file, { allowDataRevisionMismatch = false, onEvent } = {}) {
  const hash = crypto.createHash('sha256')
  const before = fs.statSync(file)
  let sourceBytes = 0
  let header; let footer; let packets = 0; let events = 0
  const states = {}; const names = {}
  for (const event of loadPackets(file, { allowDataRevisionMismatch, onBytes: bytes => { hash.update(bytes); sourceBytes += bytes.length } })) {
    onEvent?.(event)
    events++
    if (event.e === 'session_start') header = event
    else if (event.e === 'session_end') footer = event
    else if (event.e === 'packet') {
      packets++; states[event.state] = (states[event.state] || 0) + 1
      names[event.name] = (names[event.name] || 0) + 1
    }
  }
  if (!packets) throw new Error('capture contains no packets')
  const after = fs.statSync(file)
  if (sourceBytes !== after.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('capture changed during validation')
  const loadedDataRevision = revision(header.gameVersion)
  return {
    status: 'passed',
    gameVersion: header.gameVersion,
    protocolVersion: header.protocolVersion,
    sessionId: header.sessionId,
    complete: footer.complete,
    events,
    packets,
    byteRoundTrips: packets,
    states,
    names,
    sessionSha256: hash.digest('hex'),
    sourceBytes,
    sourceMtimeMs: after.mtimeMs,
    recordedDataRevision: header.dataRevision,
    loadedDataRevision,
    dataRevisionChanged: header.dataRevision !== loadedDataRevision,
    validatedAt: new Date().toISOString()
  }
}
module.exports = { SessionPacketDecoder, loadPackets, validatePackets }
