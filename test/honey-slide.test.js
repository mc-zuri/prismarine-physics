/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// HoneyBlock (1.15+): a player falling faster than 0.08 against the side of a honey block, below its top, slides down
// it at 0.05, a fall faster than 0.13 also scaling the horizontal motion by 0.05 over it (isSlidingDown,
// doSlideMovement). From 1.21.2 it acts after travel, on the fall before gravity and drag, and sets the one after them.
// One tick falling beside a honey block at x = 1.
function fallBesideHoney (version, vy) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const name = p.y < 50 ? 'stone' : p.x === 1 && p.y === 60 && p.z === 0 ? 'honey_block' : 'air'
      const b = new Block(mcData.blocksByName[name].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.7005, 60.2, 0.5), velocity: new Vec3(0.05, vy, 0.1), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.velocity
}

describe('honey slide', () => {
  for (const version of ['1.15.2', '1.20.4', '1.21.1', '1.21.3', '1.21.11', '26.1']) {
    it(`${version}: a fall against a honey block slides down it at 0.05`, () => {
      const fast = fallBesideHoney(version, -0.5)
      expect(fast.y).toBe((-0.05 - 0.08) * Math.fround(0.98))
      expect(fast.x).toBeLessThan(0.01) // 0.05 over the fall
      expect(fallBesideHoney(version, -0.1).x).toBeGreaterThan(0.04) // a slower fall keeps its horizontal motion
    })
  }
})
