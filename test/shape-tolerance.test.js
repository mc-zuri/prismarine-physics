/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

function worldOf (version, isStone) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  return {
    getBlock: (pos) => {
      const block = new Block(isStone(pos) ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos.floored()
      return block
    }
  }
}

// A wall from x = 1 on a floor at y = 101
const wallWorld = version => worldOf(version, pos => pos.y < 101 || (pos.x >= 1 && pos.y < 103))

function tick (version, world, entity, controls = {}) {
  const mcData = require('minecraft-data')(version)
  const bot = { entity, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 0, version, inventory: { slots: [] } }
  const keys = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false, ...controls }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, keys), world).apply(bot)
  return entity
}

const playerAt = (x, vx) => ({ position: new Vec3(x, 101, 0.5), velocity: new Vec3(vx, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: true, elytraFlying: false, yaw: -Math.PI / 2, pitch: 0, effects: {} })

// From 1.13 a shape stops a move from its face 1.0E-7 inside the box on (VoxelShape.collide): a player whose box reaches
// 5.0E-8 into a wall and moves into it is stopped there (the 5.0E-8 back is under 1.0E-7, so the next shape cuts it).
// Up to 1.12 (AxisAlignedBB.calculateXOffset) only a face outside the box stops it, so the wall lets it through.
describe('a wall face just inside the player', () => {
  const start = 1.00000005 - 0.30000001192092896
  for (const version of ['1.13.2', '1.14.4', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: stops the player`, () => {
      const entity = tick(version, wallWorld(version), playerAt(start, 0.1))
      expect(entity.position.x).toBe(start)
      expect(entity.isCollidedHorizontally).toBe(true)
    })
  }
  for (const version of ['1.8.8', '1.12.2']) {
    it(`${version}: lets the player through`, () => {
      const entity = tick(version, wallWorld(version), playerAt(start, 0.1))
      expect(entity.position.x).toBeGreaterThan(start + 0.05)
    })
  }
})

// EntityPlayer.updateSize (1.9 to 1.13) resizes the box from its lower corner when the new box collides with nothing: on
// 1.13 nothing it overlaps by more than 1.0E-7 (isCollisionBoxesEmpty compares shapes whose sides within 1.0E-7 merge),
// up to 1.12 nothing it overlaps at all. A sneaking player against a wall whose crouching box would reach 2.4E-8 into
// it crouches on 1.13 and stays standing up to 1.12.
describe('a crouch whose box would reach a hair into a wall', () => {
  const AABB = require('prismarine-physics/lib/aabb')
  const cases = [['1.9.4', 'standing'], ['1.12.2', 'standing'], ['1.13.2', 'crouching']]
  for (const [version, pose] of cases) {
    it(`${version}: leaves the player ${pose}`, () => {
      const entity = playerAt(0.7, 0)
      entity.physicsBox = { box: new AABB(0.4, 101, 0.2, 1, 102.8, 0.8), position: entity.position.clone() }
      expect(tick(version, wallWorld(version), entity, { sneak: true }).pose).toBe(pose)
    })
  }
})
