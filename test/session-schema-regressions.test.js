'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { SessionPacketDecoder } = require('../lib/session-packets')
const { data } = require('../lib/session-data')()

function decode (version, hex) {
  return new SessionPacketDecoder({ gameVersion: version, protocolVersion: data(version).version.version }).decode({
    e: 'packet', seq: 1, packetId: 1, direction: 'clientbound', state: 'play', bytes: Buffer.from(hex, 'hex')
  })
}

// Native bytes retained from the failed full sessions; decoding also checks byte-exact re-encoding.
for (const version of ['1.17', '1.17.1', '1.18', '1.18.1', '1.18.2']) {
  test(`${version}: vibration destinations include the registry namespace`, () => {
    const packet = decode(version, '0500000000005490650f6d696e6563726166743a626c6f636b000000c00055006507')
    assert.equal(packet.name, 'sculk_vibration_signal')
    assert.deepEqual(packet.params.destination, { x: 3, y: 101, z: 1360 })
    assert.equal(packet.params.arrivalTicks, 7)
    const entity = decode(version, '050000000000549065106d696e6563726166743a656e746974797b07')
    assert.equal(entity.params.destination, 123)
    assert.equal(entity.params.arrivalTicks, 7)
  })
}
for (const version of ['1.20.3', '1.20.4']) {
  test(`${version}: explosions write a direct sound event`, () => {
    const hex = '1e400c000000000000405940000000000040434000000000004000000000be61417b3df346b800000000001716206d696e6563726166743a656e746974792e67656e657269632e6578706c6f646500'
    const packet = decode(version, hex)
    assert.equal(packet.name, 'explosion')
    assert.equal(packet.params.sound.soundName, 'minecraft:entity.generic.explode')
    assert.equal(packet.params.small_explosion_particle.type, 'explosion')
    assert.equal(packet.params.large_explosion_particle.type, 'explosion_emitter')
    assert.equal(packet.params.sound.fixedRange, undefined)
    const fixed = decode(version, hex.slice(0, -2) + '0141800000')
    assert.equal(fixed.params.sound.fixedRange, 16)
    const block = decode(version, hex.replace('00171620', '00022a1620'))
    assert.deepEqual(block.params.small_explosion_particle, { type: 'block', data: { blockState: 42 } })
    const vibration = decode(version, '272b003ff551104ef09aca40594000000000004095260000000000000000000000000000000000000000000000000100000000c00055006507')
    assert.equal(vibration.name, 'world_particles')
    assert.deepEqual(vibration.params.data, { positionType: 'minecraft:block', entityId: undefined, entityEyeHeight: undefined, destination: { x: 3, y: 101, z: 1360 }, ticks: 7 })
  })
}
