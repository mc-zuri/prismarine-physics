/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// Block.stepOn on slime (SlimeBlock.stepOn): standing on it with |vy| under 0.1 and not sneaking scales the horizontal
// motion by 0.4 + |vy| * 0.2. Up to 1.21.1 inside Entity.move; from 1.21.2 after travel (applyEffectsFromBlocks), so it
// reads the vertical motion after gravity and drag. One tick sliding east at 0.2 on a block at y = 60.
function slideOn (version, name, { sneak = false } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 60 ? 'stone' : y === 60 ? name : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 61, 0.5), velocity: new Vec3(0.2, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.velocity.x
}

describe('slime step', () => {
  for (const [version, x] of [['1.20.4', 0.060523011770813], ['1.21.1', 0.060523011770813], ['1.21.3', 0.05828566370597047], ['1.21.11', 0.05828566370597047], ['26.1', 0.05828566370597047]]) {
    it(`${version}: slime slows a slide on it`, () => {
      expect(slideOn(version, 'slime_block')).toBe(x)
    })
  }

  for (const version of ['1.12.2', '1.20.4', '1.21.11']) {
    it(`${version}: slime slows a slide more than stone, and not a sneaking player's`, () => {
      const slime = 'slime_block' in require('minecraft-data')(version).blocksByName ? 'slime_block' : 'slime'
      const stone = slideOn(version, 'stone')
      expect(slideOn(version, slime)).toBeLessThan(stone)
      expect(slideOn(version, slime, { sneak: true })).toBeGreaterThan(slideOn(version, slime))
    })
  }
})
