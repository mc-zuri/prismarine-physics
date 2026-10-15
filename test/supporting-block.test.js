/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.20 the block under the player that affects its movement (friction, speed and jump factors) is under the
// supporting block (Entity.checkSupportingBlock, getOnPos): among the blocks the underside of the box touches, the one
// closest to the position. Before, it is the block under the position. Standing at x = 5.75 on stone at x = 6 (top 101),
// beside soul sand at x = 5 (top 100.875, under the feet but not touching them), one tick walking east.
function walkEast (version, soulSand) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const name = p.y < 100 ? 'stone' : p.y > 100 ? 'air' : p.x >= 6 ? 'stone' : soulSand ? 'soul_sand' : 'air'
      const b = new Block(mcData.blocksByName[name].id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(5.75, 101, 0.5),
      velocity: new Vec3(0, -0.0784000015258789, 0),
      onGround: true,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: Math.PI + Math.PI / 2, // east
      pitch: 0,
      effects: {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('supporting block', () => {
  for (const [version, bySupport] of [['1.19.4', false], ['1.20.4', true], ['1.21.11', true], ['26.1', true]]) {
    it(`${version}: ${bySupport ? 'the stone holding the player up' : 'the soul sand under the position'} affects the walk`, () => {
      const beside = walkEast(version, true)
      const alone = walkEast(version, false)
      if (bySupport) {
        expect(beside.velocity.x).toBe(alone.velocity.x)
        expect(beside.supportingBlockPos).toEqual(new Vec3(6, 100, 0))
      } else {
        expect(beside.velocity.x).toBeLessThan(alone.velocity.x)
      }
    })
  }
})
