const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Physics, PlayerState } = require('../index.js')
const { Vec3 } = require('vec3')

for (const version of ['1.21.11', '26.1']) {
  test(`${version}: landing with zero gravity preserves negative vertical zero`, () => {
    const registry = require('minecraft-data')(version)
    const Block = require('prismarine-block')(version)
    const world = {
      getBlock (position) {
        const block = Block.fromStateId(registry.blocksByName[position.y < 60 ? 'stone' : 'air'].defaultState)
        block.position = position.floored()
        return block
      }
    }
    const bot = {
      registry,
      entity: {
        position: new Vec3(0.5, 60, 0.5),
        velocity: new Vec3(0, -0.0784000015258789, 0),
        onGround: true, yaw: 0, pitch: 0, effects: {}
      },
      inventory: { slots: [] }, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 0
    }
    const state = new PlayerState(bot, { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false })
    state.attributes = { [registry.attributesByName.gravity.resource]: { value: 0, modifiers: [] } }
    Physics(registry, world).simulatePlayer(state, world)
    assert.equal(state.pos.y, 60)
    assert.equal(state.onGround, true)
    assert.equal(Object.is(state.vel.y, -0), true)
  })
}
