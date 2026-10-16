/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

const HALF_WIDTH = Math.fround(0.3)

// A move east at 0.1 along a stone floor (the blocks below y = 60) into a stone wall (from x = 2), the wall `gap` away.
// Up to 1.13 any cut of the move is a horizontal collision and stops the motion along the axis (Entity.move). From 1.14
// a cut of under 1.0E-5 is not a collision (Mth.equal), and from 1.18.2 such a cut no longer stops the motion either:
// up to 1.18.1 any cut does.
function moveIntoWall (version, gap) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const solid = pos.y < 60 || pos.x >= 2
      const block = new Block(solid ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: {
      position: new Vec3(2 - gap - HALF_WIDTH, 60, 0.5),
      velocity: new Vec3(0.1, -0.0784000015258789, 0),
      onGround: true,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: true,
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
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('a move the collision cuts by a little', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.18.2', '1.20.4', '1.21.1', '1.21.11', '26.1']) {
    const tolerant = !['1.8.8', '1.12.2', '1.13.2'].includes(version)
    const keepsMotion = tolerant && !['1.14.4', '1.16.5', '1.17.1'].includes(version)
    it(`${version}: a cut of 5.0E-6 ${tolerant ? 'is no' : 'is a'} collision and ${keepsMotion ? 'keeps' : 'stops'} the motion`, () => {
      const entity = moveIntoWall(version, 0.1 - 5e-6)
      expect(entity.position.x).toBeCloseTo(2 - HALF_WIDTH, 9)
      expect(entity.isCollidedHorizontally).toBe(!tolerant)
      expect(entity.velocity.x !== 0).toBe(keepsMotion)
    })
    it(`${version}: a cut of 1.0E-3 is a collision and stops the motion`, () => {
      const entity = moveIntoWall(version, 0.1 - 1e-3)
      expect(entity.isCollidedHorizontally).toBe(true)
      expect(entity.velocity.x).toBe(0)
    })
  }
})

// A move 0.1 east and 0.1 south into a corner (stone walls from x = 2 and from z = 2), each 0.05 away, cut along both
// axes. Entity.move stops the motion along each: from 1.14 to 1.18.1 the z stop sets the motion read before the x stop,
// so the x motion comes back and only z stops; up to 1.13 and from 1.18.2 both stop.
function moveIntoCorner (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const solid = pos.y < 60 || pos.x >= 2 || pos.z >= 2
      const block = new Block(solid ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: {
      position: new Vec3(2 - 0.05 - HALF_WIDTH, 60, 2 - 0.05 - HALF_WIDTH),
      velocity: new Vec3(0.1, -0.0784000015258789, 0.1),
      onGround: true,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: true,
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
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('a move cut along both horizontal axes', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5', '1.17.1', '1.18.2', '1.20.4', '1.21.11', '26.1']) {
    const keepsX = ['1.14.4', '1.15.2', '1.16.5', '1.17.1'].includes(version)
    it(`${version}: stops the motion along ${keepsX ? 'z only' : 'both'}`, () => {
      const entity = moveIntoCorner(version)
      expect(entity.isCollidedHorizontally).toBe(true)
      expect(entity.velocity.x !== 0).toBe(keepsX)
      expect(entity.velocity.z).toBe(0)
    })
  }
})
