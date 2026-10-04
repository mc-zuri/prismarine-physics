'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Vec3 } = require('vec3')
require('../lib/session-data')()
const packets = require('./tools/java-packets')
const AABB = require('../lib/aabb')

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

test('1.18.2 sends small position changes that 1.18.1 accumulates', () => {
  const after = { pos: [0.001, 101, 0], onGround: true, sprinting: false, shiftKeyDown: false }
  const input = { yaw: 0, pitch: 0 }
  const net = { entityId: 1, lastPos: [0, 101, 0], lastYaw: 0, lastPitch: 0, lastOnGround: true, wasSprinting: false, wasShiftKeyDown: false, positionReminder: 0 }
  assert.deepEqual(packets.movementPackets(after, input, net, '1.18.1').packets, [])
  assert.deepEqual(packets.movementPackets(after, input, net, '1.18.2').packets.map(p => p.name), ['position'])
})

test('1.16.5 pose metadata preserves the box corner even when it repeats the current pose', () => {
  const state = {
    pos: new Vec3(-2.15808430284093, 101, 35.84191569715907),
    pose: 'standing',
    javaBox: new AABB(-2.4580843147618587, 101, 35.54191568523814, -1.8580842909200008, 102.79999995231628, 36.141915709079996)
  }
  packets.handle(state, { name: 'entity_metadata', params: { entityId: 3, metadata: [{ key: 6, type: 'pose', value: 0 }] } },
    { entityId: 3, mcData: packets.protocolData('1.16.5') })
  assert.equal(state.javaBox.minX, -2.4580843147618587)
  assert.equal(state.javaBox.maxX, -1.8580842909200008)
  assert.equal(state.pos.x, -2.15808430284093)
})

test('a delayed finish-using-item notification cannot consume food twice', () => {
  const state = { food: 16, usingItem: false }
  const ctx = { entityId: 1, mainhand: 'cooked_beef', mcData: packets.protocolData('1.19.2') }
  const notification = { name: 'entity_status', params: { entityId: 1, entityStatus: 9 } }
  packets.handle(state, notification, ctx)
  assert.equal(state.food, 16)
  state.usingItem = true
  packets.handle(state, notification, ctx)
  assert.equal(state.food, 20)
  assert.equal(state.usingItem, false)
})
