const assert = require('node:assert/strict')
const { test } = require('node:test')
const { data } = require('../lib/session-data')()
const { Physics, PlayerState } = require('../index')
const { Vec3 } = require('vec3')

for (const version of ['1.14.4', '1.15.2', '1.16.5']) {
  test(`${version}: a boat classified as mob applies its collision push once`, () => {
    const registry = data(version)
    const state = new PlayerState({
      registry,
      entity: {
        position: new Vec3(5.653907637539506, 100.07326531022936, 2125.5),
        velocity: new Vec3(0, -0.0784000015258789, 0),
        onGround: false,
        yaw: 0,
        pitch: 0,
        effects: {}
      },
      inventory: { slots: [] }
    }, {})
    state.entities = [{
      type: 'boat',
      pos: new Vec3(5.622284403870007, 100.52326536116496, 2125.5),
      tickBeforePlayer: false
    }]
    const world = { getBlock: () => null }
    Physics(registry, world).simulatePlayer(state, world)
    // Native 1.14.4 dismount capture, after the unoccupied boat ticks.
    assert.equal(state.vel.x, 0.00889146170192836)
  })
}
