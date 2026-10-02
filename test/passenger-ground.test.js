const assert = require('node:assert/strict')
const { test } = require('node:test')
const { data } = require('../lib/session-data')()
const { Physics, PlayerState } = require('../index.js')
const { Vec3 } = require('vec3')

for (const version of ['1.21.3', '1.21.4', '1.21.11', '26.1', '26.2', '26.3']) {
  test(`${version}: the first passenger tick uses the native ground-contact rule`, () => {
    const registry = data(version)
    const Block = require('prismarine-block')(registry)
    const world = {
      getBlock (pos) {
        const cell = pos.floored()
        const name = Math.abs(cell.x) <= 1 && cell.y === 100 && cell.z === 0 ? 'stone' : 'air'
        const block = Block.fromStateId(registry.blocksByName[name].defaultState, 0)
        block.position = cell
        return block
      }
    }
    const state = new PlayerState({
      registry,
      entity: {
        position: new Vec3(0.5, 100.5875, 0.5),
        velocity: new Vec3(0, 0, 0),
        onGround: true,
        yaw: 0,
        pitch: 0,
        effects: {}
      },
      inventory: { slots: [] }
    }, { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false })
    state.vehicle = { type: 'minecart', pos: new Vec3(0.5, 101, 0.5) }
    Physics(registry, world).simulatePlayer(state, world)
    // 26.3 no longer pushes passengers out of blocks; older clients push 0.1 south.
    const expected = version === '26.3' ? 0 : version === '1.21.3' ? 0.05460000634193421 : 0.09100000262260438
    assert.equal(state.vel.z, expected)
    assert.equal(state.vel.y, -0.0784000015258789)
    assert.equal(state.pos.y, 100.5875)
  })
}
