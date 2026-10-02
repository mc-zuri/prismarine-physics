const assert = require('node:assert/strict')
const { test } = require('node:test')
const { data } = require('../lib/session-data')()
const { Physics, PlayerState } = require('../index')
const { Vec3 } = require('vec3')

for (const version of ['1.18', '1.19.2']) {
  test(`${version}: a spontaneous rearing input stops movement once, animates the rider, then expires`, () => {
    const registry = data(version)
    const Block = require('prismarine-block')(registry)
    const world = {
      getBlock (position) {
        const block = Block.fromStateId(registry.blocksByName[position.y < 101 ? 'stone' : 'air'].defaultState)
        block.position = position.floored()
        return block
      }
    }
    const state = new PlayerState({
      registry,
      entity: { position: new Vec3(0.5, 101.85, 0.5), velocity: new Vec3(0, 0, 0), onGround: false, yaw: Math.PI, pitch: 0, effects: {} },
      inventory: { slots: [] }
    }, { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false })
    state.yawDegrees = 0
    const horse = state.vehicle = {
      type: 'horse',
      pos: new Vec3(0.5, 101, 0.5),
      vel: new Vec3(0, -0.0784000015258789, 0),
      yaw: 0,
      onGround: true,
      movementSpeed: 0.225,
      jumpStrength: 0.7,
      riderInput: { xxa: 0, zza: 1 },
      rearingRequested: true
    }
    const physics = Physics(registry, world)
    physics.simulatePlayer(state, world)
    const firstHeight = state.pos.y
    assert.equal(horse.rearingRequested, false)
    assert.equal(horse.standing, true)
    assert.equal(horse.pos.z, 0.5)
    physics.simulatePlayer(state, world)
    assert.ok(state.pos.y > firstHeight)
    assert.equal(horse.pos.z, 0.5)
    for (let i = 2; i < 20; i++) physics.simulatePlayer(state, world)
    assert.equal(horse.standing, false)
    physics.simulatePlayer(state, world)
    assert.ok(horse.pos.z > 0.5)
  })
}
