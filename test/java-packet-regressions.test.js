'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Vec3 } = require('vec3')
require('../lib/session-data')()
const packets = require('./tools/java-packets')

test('legacy sprint commands preserve their wire enum through decoding and encoding', () => {
  const bytes = Buffer.from([0x0b, 0, 3, 0])
  const decoded = packets.decode('1.8.9', 'toServer', bytes)
  assert.equal(decoded.name, 'entity_action')
  assert.equal(decoded.params.actionId, 'start_sprinting')
  assert.deepEqual(packets.encode('1.8.9', 'toServer', decoded.name, decoded.params), bytes)
})

test('server pose metadata clears a retained box before the next movement', () => {
  const state = { javaBox: {}, pose: 'swimming' }
  packets.handle(state, { name: 'entity_metadata', params: { entityId: 3, metadata: [{ key: 6, type: 'pose', value: 0 }] } },
    { entityId: 3, mcData: packets.protocolData('1.21') })
  assert.equal(state.pose, 'standing')
  assert.equal(state.javaBox, null)
})

test('legacy use-item metadata is not interpreted as swimming', () => {
  const state = { swimming: false }
  packets.handle(state, { name: 'entity_metadata', params: { entityId: 3, metadata: [{ key: 0, type: 0, value: 16 }] } },
    { entityId: 3, mcData: packets.protocolData('1.8.9') })
  assert.equal(state.swimming, false)
})

test('a legacy dismount detaches the rider without moving its server-corrected position', () => {
  const state = { pos: new Vec3(10, 102, 20), vehicle: { id: 7, type: 'horse', pos: new Vec3(9, 101, 20) }, entities: [] }
  packets.handle(state, { name: 'attach_entity', params: { entityId: 3, vehicleId: -1, leash: false } }, { entityId: 3 })
  assert.equal(state.vehicle, undefined)
  assert.deepEqual(state.pos, new Vec3(10, 102, 20))
  assert.equal(state.entities[0].id, 7)
})

test('a piston head replacement cancels its pending movement before the next tick', () => {
  const mcData = packets.protocolData('1.18')
  const state = {}
  const ctx = { mcData, world: { setStateId () {}, getBlock: () => ({ name: 'piston_head' }) } }
  packets.handle(state, { name: 'block_action', params: { location: { x: -1, y: 101, z: 0 }, byte1: 0, byte2: 5, blockId: mcData.blocksByName.piston.id } }, ctx)
  assert.equal(state.pistons.length, 1)
  packets.handle(state, { name: 'block_change', params: { location: { x: 0, y: 101, z: 0 }, type: 1422 } }, ctx)
  assert.deepEqual(state.pistons, [])
})
