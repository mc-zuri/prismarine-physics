const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Physics, PlayerState } = require('../index.js')
const { Vec3 } = require('vec3')

for (const version of ['1.21.4', '1.21.5']) {
  test(`${version}: powder-snow climb uses the native contact source`, () => {
    const registry = require('minecraft-data')(version)
    const Block = require('prismarine-block')(version)
    const world = {
      getBlock (position) {
        const name = position.y < 98 ? 'stone' : position.y < 101 ? 'powder_snow' : 'air'
        const block = Block.fromStateId(registry.blocksByName[name].defaultState)
        block.position = position.floored()
        return block
      }
    }
    const state = new PlayerState({
      registry,
      entity: {
        position: new Vec3(0.5, 98, 920.5), velocity: new Vec3(0, 0, 0),
        onGround: true, yaw: 0, pitch: 0, effects: {}, isInPowderSnow: false
      },
      inventory: { slots: [] }, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 0
    }, { forward: false, back: false, left: false, right: false, jump: true, sprint: false, sneak: false })
    state.leatherBoots = true
    Physics(registry, world).simulatePlayer(state, world)
    assert.equal(state.pos.y, 98.41999998688698)
    assert.equal(state.vel.y, version === '1.21.4' ? 0.11760000228881837 : 0.33319999363422365)
  })
}
