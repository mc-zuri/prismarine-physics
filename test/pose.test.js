/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// The player's size follows its pose at the end of the tick. On 1.9 to 1.13 EntityPlayer.updateSize makes a sneaking
// player 1.65 tall, keeping the box's lower corner. From 1.14 Player.updatePlayerPose crouches (1.5) a sneaking player and
// makes one who does not fit crouching swim (crawl, 0.6). One tick standing still on the ground at y = 60, under a
// ceiling at `ceiling` (none by default).
function standStill (version, { sneak = false, ceiling = Infinity } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 60 || y >= ceiling ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 60, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('pose', () => {
  for (const version of ['1.9.4', '1.12.2', '1.13.2']) {
    it(`${version}: sneaking makes the box 1.65 tall from its lower corner`, () => {
      const { box } = standStill(version, { sneak: true }).physicsBox
      expect(box.maxY - box.minY).toBeCloseTo(1.65, 6)
      expect(box.maxX).toBe(box.minX + Math.fround(0.6))
      expect(standStill(version).pose).toBe('standing')
    })
  }

  for (const version of ['1.14.4', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: sneaking crouches, and a 1 tall tunnel makes the player crawl`, () => {
      expect(standStill(version).pose).toBe('standing')
      expect(standStill(version, { sneak: true }).pose).toBe('crouching')
      expect(standStill(version, { ceiling: 61 }).pose).toBe('swimming')
    })
  }
})

// LocalPlayer.aiStep (1.14+): a player crouches, and is slowed to the sneaking speed, where standing does not fit but
// crouching does, without the sneak key; a crawling player (the swimming pose out of water) is slowed too. One tick
// walking forward under a ceiling.
function walkUnder (version, { ceilingAt, pose, slab = false }) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = y === ceilingAt && slab
        ? Block.fromProperties('stone_slab', { type: 'top', waterlogged: false }, 0)
        : new Block(mcData.blocksByName[y < 60 || y === ceilingAt ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 60, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, pose },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return Math.abs(bot.entity.velocity.z)
}

describe('forced crouching and crawling', () => {
  for (const version of ['1.14.4', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: crouching under a top slab, without the sneak key, is slowed`, () => {
      const open = walkUnder(version, { ceilingAt: 70, pose: 'standing' })
      expect(walkUnder(version, { ceilingAt: 61, pose: 'crouching', slab: true })).toBeLessThan(open * 0.5)
    })
    it(`${version}: crawling where only crawling fits is slowed`, () => {
      const open = walkUnder(version, { ceilingAt: 70, pose: 'standing' })
      expect(walkUnder(version, { ceilingAt: 61, pose: 'swimming' })).toBeLessThan(open * 0.5) // crawling
    })
  }
})
