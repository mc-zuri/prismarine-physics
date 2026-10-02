const assert = require('node:assert/strict')
const { test } = require('node:test')
const { data } = require('../lib/session-data')()
const { Physics, PlayerState } = require('../index.js')
const { Vec3 } = require('vec3')

function setup () {
  const registry = data('1.21.3')
  const Block = require('prismarine-block')(registry)
  const world = {
    getBlock (pos) {
      const block = Block.fromStateId(registry.blocksByName.air.defaultState, 0)
      block.position = pos.floored()
      return block
    }
  }
  const state = new PlayerState({
    registry,
    entity: {
      position: new Vec3(0.5, 101, 0.5),
      velocity: new Vec3(0, 0, 0),
      onGround: false,
      yaw: Math.PI,
      pitch: 0,
      effects: {}
    },
    inventory: { slots: [] }
  }, { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false })
  return { state, world, physics: Physics(registry, world) }
}

function boat () {
  return {
    type: 'oak_boat',
    pos: new Vec3(0.5, 101, 0.5),
    vel: new Vec3(0, 0, 0),
    yaw: 0,
    deltaRotation: 0,
    onGround: false,
    status: null,
    input: { left: false, right: false, up: false, down: false }
  }
}

test('a paused boat preserves its state while its passenger ticks, sits and supplies input', () => {
  const { state, world, physics } = setup()
  const vehicle = state.vehicle = boat()
  vehicle.tickEnabled = false
  vehicle.vel.set(0.25, -0.1, 0.5)
  vehicle.deltaRotation = 2
  vehicle.yaw = 25
  state.yawDegrees = 40
  state.vel.set(0.7, 1, 0.7)
  state.control.forward = true
  state.control.left = true
  const original = { ...vehicle, pos: vehicle.pos.clone(), vel: vehicle.vel.clone() }

  physics.simulatePlayer(state, world)

  assert.deepEqual({ ...vehicle, input: original.input }, original)
  assert.deepEqual(vehicle.input, { left: true, right: false, up: true, down: false })
  assert.deepEqual(state.pos, new Vec3(vehicle.pos.x, (vehicle.pos.y + Math.fround(0.5625 / Math.fround(3))) - 0.6, vehicle.pos.z))
  assert.equal(state.vel.y, -0.0784000015258789)
  assert.equal(state.yawDegrees, 42)
})

test('resuming a boat uses the input supplied by its passenger while held', () => {
  const { state, world, physics } = setup()
  const vehicle = state.vehicle = boat()
  vehicle.tickEnabled = false
  state.control.forward = true
  physics.simulatePlayer(state, world)
  assert.deepEqual(vehicle.pos, new Vec3(0.5, 101, 0.5))

  vehicle.tickEnabled = true
  state.control.forward = false
  physics.simulatePlayer(state, world)

  assert.equal(vehicle.status, 'in_air')
  assert.equal(vehicle.vel.z, Math.fround(0.04))
  assert.equal(vehicle.pos.z, 0.5 + Math.fround(0.04))
  assert.equal(vehicle.pos.y, 101 - 0.04)
  assert.deepEqual(vehicle.input, { left: false, right: false, up: false, down: false })
})

test('nearby paused boats suppress push impulses but keep solid collision boxes', () => {
  for (const tickEnabled of [undefined, false]) {
    const { state, world, physics } = setup()
    const nearby = { ...boat(), tickEnabled, pos: new Vec3(1, 101, 0.5) }
    state.entities = [nearby]
    physics.simulatePlayer(state, world)
    if (tickEnabled === false) {
      assert.equal(state.vel.x, 0)
      assert.equal(nearby.vel.x, 0)
    } else {
      assert.ok(state.vel.x < 0)
      assert.equal(nearby.vel.x, -state.vel.x)
    }
  }

  const { state, world, physics } = setup()
  state.entities = [{ ...boat(), tickEnabled: false, pos: new Vec3(1, 101, 0.5) }]
  state.pos.x = -1
  state.vel.x = 1.4
  physics.simulatePlayer(state, world)
  assert.equal(state.pos.x, 1 - 1.375 / 2 - Math.fround(0.6) / 2)
  assert.equal(state.isCollidedHorizontally, true)
})
