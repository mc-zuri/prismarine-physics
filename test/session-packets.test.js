'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { SessionPacketDecoder, validatePackets } = require('../lib/session-packets')
const { MAGIC, frame } = require('../lib/session-format')
const { data } = require('../lib/session-data')()
const mc = require('minecraft-protocol')

function packet (bytes, direction = 'clientbound', state = 'play') {
  return { e: 'packet', seq: 42, packetId: 7, direction, state, bytes: Buffer.from(bytes) }
}

for (const roundTrip of [true, false]) {
  test(`unmapped packet IDs are rejected with roundTrip=${roundTrip}`, () => {
    const decoder = new SessionPacketDecoder({ gameVersion: '1.20.1', protocolVersion: 763 }, { roundTrip })
    // The old recorder serialized a bundle wrapper with the non-wire ID -1.
    // ProtoDef also accepts positive IDs outside the mapping as empty packets.
    for (const direction of ['clientbound', 'serverbound']) {
      for (const bytes of [[0xff, 0xff, 0xff, 0xff, 0x0f], [0x7f]]) {
        assert.throws(() => decoder.decode(packet(bytes, direction)),
          new RegExp(`event 42, packet 7, play/${direction}, 1\\.20\\.1: unmapped packet id (-1|127)`))
      }
    }
  })
}

test('mapped packets without fields still pass exact round-trip', () => {
  const decoder = new SessionPacketDecoder({ gameVersion: '1.20.1', protocolVersion: 763 })
  assert.equal(decoder.decode(packet([0])).name, 'bundle_delimiter')
})

test('configuration packets use the same unmapped-ID validation', () => {
  const decoder = new SessionPacketDecoder({ gameVersion: '1.21', protocolVersion: 767 })
  assert.throws(() => decoder.decode(packet([0x7f], 'clientbound', 'configuration')),
    /configuration\/clientbound, 1\.21: unmapped packet id 127/)
})

test('Classic packet mappings accept known IDs and reject unknown IDs', () => {
  const decoder = new SessionPacketDecoder({ gameVersion: '0.30c', protocolVersion: 7 })
  assert.equal(decoder.decode(packet([1], 'clientbound', 'classic')).name, 'ping')
  assert.throws(() => decoder.decode(packet([0xff], 'clientbound', 'classic')),
    /classic\/clientbound, 0\.30c: unmapped packet id 255/)
})

function capture (t, records, version = '1.20.1') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-packets-'))
  const file = path.join(directory, 'session.bin')
  t.after(() => { fs.unlinkSync(file); fs.rmdirSync(directory) })
  const events = [{ e: 'session_start', schema: 2, gameVersion: version, protocolVersion: data(version).version.version }, ...records]
  const counts = {}
  for (const event of events) counts[event.e] = (counts[event.e] || 0) + 1
  events.push({ e: 'session_end', complete: true, counts })
  fs.writeFileSync(file, Buffer.concat([MAGIC, ...events.map((event, index) => frame({ ...event, seq: index + 1, timeNs: index }))]))
  return file
}

function wirePacket (name, params = {}, { version = '1.20.1', connectionId = 'a', direction = 'clientbound', state = 'play' } = {}) {
  const bytes = mc.createSerializer({ version, state, isServer: direction === 'clientbound' }).createPacketBuffer({ name, params })
  return { e: 'packet', packetId: 7, connectionId, direction, state, bytes }
}

test('full packet validation rejects a byte-exact but unclosed bundle at the footer', t => {
  const delimiter = wirePacket('bundle_delimiter')
  // Individual packets are valid even though the native recorder dropped the closing delimiter.
  assert.equal(new SessionPacketDecoder({ gameVersion: '1.20.1', protocolVersion: 763 }).decode(delimiter).name, 'bundle_delimiter')
  const file = capture(t, [delimiter, wirePacket('keep_alive', { keepAliveId: 1n })])
  assert.throws(() => validatePackets(file), /unclosed bundle from event 2, connection a, play\/clientbound at session_end/)
})

test('a closing delimiter after connection_end cannot repair an incomplete bundle', t => {
  const delimiter = wirePacket('bundle_delimiter')
  const file = capture(t, [delimiter, { e: 'connection_end', connectionId: 'a' }, delimiter])
  assert.throws(() => validatePackets(file), /unclosed bundle.*connection a.*at connection_end/)
})

test('one stream cannot cross protocol states while its bundle is open', t => {
  const version = '1.21'
  const file = capture(t, [
    wirePacket('bundle_delimiter', {}, { version }),
    wirePacket('finish_configuration', {}, { version, state: 'configuration' }),
    wirePacket('bundle_delimiter', {}, { version })
  ], version)
  assert.throws(() => validatePackets(file), /bundle from event 2, connection a, play\/clientbound crossed into configuration/)
})

for (const version of ['1.19.4', '1.20', '1.21.4', '26.3']) {
  test(`${version} accepts empty and repeated bundles with reused delimiter bytes`, t => {
    const delimiter = wirePacket('bundle_delimiter', {}, { version })
    const file = capture(t, [
      { e: 'connection_start', connectionId: 'a' },
      delimiter, delimiter,
      delimiter, wirePacket('keep_alive', { keepAliveId: 1n }, { version }), delimiter,
      delimiter, wirePacket('keep_alive', { keepAliveId: 2n }, { version }), delimiter,
      { e: 'connection_end', connectionId: 'a' }
    ], version)
    const result = validatePackets(file)
    assert.equal(result.complete, true)
    assert.equal(result.byteRoundTrips, 8)
    assert.equal(result.names.bundle_delimiter, 6)
  })
}

test('bundles on different connections cannot supply each other a closing delimiter', t => {
  const file = capture(t, [wirePacket('bundle_delimiter'), wirePacket('bundle_delimiter', {}, { connectionId: 'b' })])
  assert.throws(() => validatePackets(file), /unclosed bundle.*at session_end/)
})

test('independent connections and opposite protocol directions can interleave', t => {
  const version = '1.21'
  const a = wirePacket('bundle_delimiter', {}, { version })
  const b = wirePacket('bundle_delimiter', {}, { version, connectionId: 'b' })
  const file = capture(t, [
    a, b,
    // Serverbound configuration can change independently of the clientbound play stream.
    wirePacket('finish_configuration', {}, { version, direction: 'serverbound', state: 'configuration' }),
    wirePacket('keep_alive', { keepAliveId: 1n }, { version, direction: 'serverbound' }),
    { e: 'connection_end', connectionId: 'unrelated' },
    a, { e: 'connection_end', connectionId: 'a' },
    b, { e: 'connection_end', connectionId: 'b' }
  ], version)
  assert.equal(validatePackets(file).byteRoundTrips, 6)
})

test('protocol changes between complete bundles and reconnecting are accepted', t => {
  const version = '1.21'
  const delimiter = wirePacket('bundle_delimiter', {}, { version })
  const file = capture(t, [
    { e: 'connection_start', connectionId: 'a' },
    wirePacket('finish_configuration', {}, { version, state: 'configuration' }),
    delimiter, delimiter,
    wirePacket('finish_configuration', {}, { version, state: 'configuration' }),
    delimiter, delimiter,
    { e: 'connection_end', connectionId: 'a' },
    { e: 'connection_start', connectionId: 'b' },
    wirePacket('bundle_delimiter', {}, { version, connectionId: 'b' }),
    wirePacket('bundle_delimiter', {}, { version, connectionId: 'b' }),
    { e: 'connection_end', connectionId: 'b' }
  ], version)
  assert.equal(validatePackets(file).byteRoundTrips, 8)
})

for (const version of ['1.18.1', '1.19.3']) {
  test(`${version} validation remains valid without bundle packets or connection metadata`, t => {
    const packet = wirePacket('keep_alive', { keepAliveId: 1n }, { version })
    delete packet.connectionId
    const file = capture(t, [packet], version)
    assert.equal(validatePackets(file).byteRoundTrips, 1)
  })
}
