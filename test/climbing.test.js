/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LivingEntity.onClimbable and handleOnClimbable. The climbable blocks: ladder and vine; from 1.14 scaffolding; from
// 1.16 weeping and twisting vines, from 1.17 cave vines (the climbable tag). On one, a fall is limited to 0.15 (up to
// 1.13, a double) or 0.15F (from 1.14), and holding sneak stops it (from 1.14 not on scaffolding). One tick, falling
// at 0.5 with the feet in the block, high above the ground.
const LEGACY_LIMIT = 0.15
const FLOAT_LIMIT = Math.fround(0.15)

function fallThrough (version, block, { sneak = false } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const info = mcData.blocksByName[Math.floor(pos.y) === 80 ? block : 'air']
      // the default state: the first one of a ladder from 1.13 is waterlogged
      const b = info.defaultState !== undefined ? Block.fromStateId(info.defaultState, 0) : new Block(info.id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, 80.5, 0.5),
      velocity: new Vec3(0, -0.5, 0),
      onGround: false,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: Math.PI,
      pitch: 0,
      effects: {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.position.y - 80.5
}

describe('climbing', () => {
  for (const [version, limit] of [['1.8.8', LEGACY_LIMIT], ['1.13.2', LEGACY_LIMIT], ['1.14.4', FLOAT_LIMIT], ['1.21.11', FLOAT_LIMIT], ['26.1', FLOAT_LIMIT]]) {
    it(`${version}: a ladder limits a fall to ${limit}`, () => {
      expect(fallThrough(version, 'ladder')).toBeCloseTo(-limit, 12)
    })
    it(`${version}: holding sneak on a ladder stops a fall`, () => {
      expect(fallThrough(version, 'ladder', { sneak: true })).toBe(0)
    })
  }

  for (const [version, blocks] of [['1.16.5', ['weeping_vines', 'twisting_vines_plant']], ['1.17.1', ['cave_vines', 'cave_vines_plant']], ['1.21.11', ['weeping_vines', 'cave_vines']]]) {
    it(`${version}: ${blocks.join(' and ')} are climbable`, () => {
      for (const block of blocks) expect(fallThrough(version, block)).toBeCloseTo(-FLOAT_LIMIT, 12)
    })
  }

  it('1.14+: holding sneak on scaffolding does not stop a fall', () => {
    for (const version of ['1.14.4', '1.21.11']) expect(fallThrough(version, 'scaffolding', { sneak: true })).toBeCloseTo(-FLOAT_LIMIT, 12)
  })
})
