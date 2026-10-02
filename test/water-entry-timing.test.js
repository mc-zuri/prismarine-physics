const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Physics, PlayerState } = require('../index.js')
const { Vec3 } = require('vec3')

for (const version of ['1.21.4', '1.21.5']) {
  test(`${version}: client-controlled fall checks use native water-entry timing`, () => {
    const registry = require('minecraft-data')(version)
    const Block = require('prismarine-block')(version)
    const world = {
      getBlock (position) {
        const name = position.y < 100 ? 'stone' : position.y < 101 ? 'water' : 'air'
        const block = Block.fromStateId(registry.blocksByName[name].defaultState)
        block.position = position.floored()
        return block
      }
    }
    // Native b_land_3_water, immediately before the player crosses the water surface.
    const state = new PlayerState({
      registry,
      entity: {
        position: new Vec3(4.5, 101.30543845175121, 1549.5),
        velocity: new Vec3(0, -0.6517088341626173, 0),
        onGround: false, yaw: 0, pitch: 0, effects: {}
      },
      inventory: { slots: [] }, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 0
    }, { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false })
    const physics = Physics(registry, world)
    physics.simulatePlayer(state, world)
    assert.equal(state.pos.y, 100.6537296175886)
    assert.equal(state.isInWater, version !== '1.21.4')
    physics.simulatePlayer(state, world)
    assert.equal(state.isInWater, true)
  })
}
