'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { SessionPacketDecoder } = require('../lib/session-packets')
const { data } = require('../lib/session-data')()

// Actual 17w50a native packet: block particles while the player lands on stone.
const native = Buffer.from('2300000003003f00000042ca0000421a00000000000000000000000000003e19999a000000be01', 'hex')
function decode (bytes) {
  return new SessionPacketDecoder({ gameVersion: '17w50a', protocolVersion: data('17w50a').version.version }).decode({
    e: 'packet', seq: 1, packetId: 1, direction: 'clientbound', state: 'play', bytes
  })
}
test('17w50a native block particle payload survives a complete byte round trip', () => {
  const packet = decode(native)
  assert.equal(packet.name, 'world_particles')
  assert.equal(packet.params.particleId, 3)
  assert.equal(packet.params.particles, 190)
  assert.deepEqual(packet.params.data, { blockState: 1 })
})
test('flattened dust and falling-dust IDs use their native payload types', () => {
  const header = Buffer.from(native.subarray(0, 38))
  header.writeInt32BE(11, 1)
  const dust = Buffer.alloc(16)
  for (const [i, value] of [0.25, 0.5, 0.75, 1].entries()) dust.writeFloatBE(value, i * 4)
  assert.deepEqual(decode(Buffer.concat([header, dust])).params.data, { red: 0.25, green: 0.5, blue: 0.75, scale: 1 })
  header.writeInt32BE(20, 1)
  assert.deepEqual(decode(Buffer.concat([header, Buffer.from([1])])).params.data, { blockState: 1 })
})
