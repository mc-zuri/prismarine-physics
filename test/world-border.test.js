/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

const HALF_WIDTH = Math.fround(0.3)

// The world border stops a player inside it. Up to 1.13 the cells outside it collide as full blocks; from 1.14 its
// shape, everything outside it, collides (from 1.18 only near it). A player walks east along a stone floor towards the
// east side of a border 10 across around 0, 0 (at x = 5) and stops against it; the default border, 59999968 across, is
// far away.
function walkEast (version, worldBorder) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const block = new Block(pos.y < 60 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos.floored()
      return block
    }
  }
  const bot = {
    worldBorder,
    entity: { position: new Vec3(3.5, 60, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: true, elytraFlying: false, yaw: -Math.PI / 2, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const physics = Physics(mcData, world)
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  for (let tick = 0; tick < 20; tick++) physics.simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('the world border', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.18.2', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: stops a player walking into it`, () => {
      const entity = walkEast(version, { centerX: 0, centerZ: 0, size: 10 })
      expect(entity.position.x).toBeCloseTo(5 - HALF_WIDTH, 6)
      expect(entity.isCollidedHorizontally).toBe(true)
    })
    it(`${version}: is far away by default`, () => {
      expect(walkEast(version, undefined).position.x).toBeGreaterThan(5)
    })
  }
})

// Up to 1.13 the cells outside the border collide for a player inside the border widened by 1, or, when the last check
// found it outside (entity.outsideBorder), narrowed by 1. A player 0.2 past the east side of a border 20 across (at
// x = 10) moving east at 0.6: still taken for inside, it stops at the cell past the one it is in (x = 11); taken for
// outside, it goes on.
describe('a player just past the world border up to 1.13', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2']) {
    it(`${version}: collides with the cells outside it until it is found outside`, () => {
      const mcData = require('minecraft-data')(version)
      const Block = require('prismarine-block')(version)
      const world = { getBlock: (pos) => { const block = new Block(pos.y < 60 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0); block.position = pos.floored(); return block } }
      const moveEast = (outsideBorder) => {
        const entity = { position: new Vec3(10.2, 60, 0.5), velocity: new Vec3(0.6, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: true, elytraFlying: false, yaw: -Math.PI / 2, pitch: 0, effects: {}, outsideBorder }
        const bot = { worldBorder: { centerX: 0, centerZ: 0, size: 20 }, entity, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 0, version, inventory: { slots: [] } }
        const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
        Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
        return entity
      }
      const inside = moveEast(false)
      expect(inside.position.x).toBe(11 - HALF_WIDTH)
      expect(inside.outsideBorder).toBe(false)
      const outside = moveEast(true)
      expect(outside.position.x).toBeGreaterThan(10.7)
      expect(outside.outsideBorder).toBe(true)
    })
  }
})
