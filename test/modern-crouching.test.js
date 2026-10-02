const assert = require('node:assert/strict')
const { test } = require('node:test')
const { data } = require('../lib/session-data')()
const { Physics, PlayerState } = require('../index.js')
const { Vec3 } = require('vec3')

for (const version of ['1.20.5', '1.21.4', '1.21.11', '26.1', '26.2', '26.3']) {
  test(`${version}: gliding keeps shift input and crouches on the following tick`, () => {
    const registry = data(version)
    const world = { getBlock: () => null }
    const state = new PlayerState({
      registry,
      entity: {
        position: new Vec3(0.5, 100, 0.5),
        velocity: new Vec3(0, 0, 0),
        onGround: false,
        yaw: 0,
        pitch: 0,
        effects: {},
        elytraFlying: true
      },
      inventory: { slots: [] },
      jumpTicks: 0,
      jumpQueued: false,
      fireworkRocketDuration: 0
    }, { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: true })
    state.pose = 'fall_flying'
    const physics = Physics(registry, world)
    physics.simulatePlayer(state, world)
    assert.equal(state.isCrouching, true)
    assert.equal(state.crouching, false)
    physics.simulatePlayer(state, world)
    assert.equal(state.crouching, true)
    assert.equal(state.pose, 'fall_flying')
    state.control.sneak = false
    physics.simulatePlayer(state, world)
    assert.equal(state.crouching, true)
    physics.simulatePlayer(state, world)
    assert.equal(state.crouching, false)

    // The same held key does not set the crouching flag while riding.
    state.elytraFlying = false
    state.isCrouching = true
    state.control.sneak = true
    state.vehicle = { type: 'minecart', pos: new Vec3(0.5, 100, 0.5) }
    physics.simulatePlayer(state, world)
    assert.equal(state.crouching, false)
  })
}
