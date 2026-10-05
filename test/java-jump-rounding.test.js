const assert = require('node:assert/strict')
const { test } = require('node:test')
const { data } = require('../lib/session-data')()
const { Physics, PlayerState } = require('../index')
const { Vec3 } = require('vec3')

test('1.17 adds jump boost in float; 1.17.1 adds the two float values in double', () => {
  for (const [version, expected] of [['1.17', 0.431199989700317], ['1.17.1', 0.4311999970018861]]) {
    const registry = data(version)
    const state = new PlayerState({ registry, entity: { position: new Vec3(0.5, 101, 0.5), velocity: new Vec3(0, 0, 0), onGround: true, yaw: 0, pitch: 0, effects: {} }, inventory: { slots: [] }, jumpTicks: 0 }, { jump: true })
    state.jumpBoost = 1
    Physics(registry, { getBlock: () => null }).simulatePlayer(state, { getBlock: () => null })
    assert.equal(state.vel.y, expected, version)
  }
})
