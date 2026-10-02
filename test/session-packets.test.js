'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { SessionPacketDecoder } = require('../lib/session-packets')

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
