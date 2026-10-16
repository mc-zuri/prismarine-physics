/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A move past a pillar's corner: the floor is the block below y = 60 and a two-high pillar stands at x = 2, z = 2. The
// player at x = z = 1.5 moves 0.5 east and 0.6 south. Up to 1.13 a move collides y, x then z (Entity.move), so the east
// move clears the pillar and the south one stops on it. From 1.14 (Entity.collideWithShapes, collideBoundingBox) the
// larger horizontal axis goes first, here z, so the south move clears the pillar and the east one stops on it.
function movePastCorner (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const solid = p.y < 60 || (p.x === 2 && p.z === 2 && p.y < 62)
      const b = new Block(mcData.blocksByName[solid ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(1.5, 60, 1.5), velocity: new Vec3(0.5, 0, 0.6), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
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

describe('the order a move collides its axes in', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.21.1', '1.21.11', '26.1']) {
    const zFirst = !['1.8.8', '1.12.2', '1.13.2'].includes(version)
    it(`${version}: ${zFirst ? 'the larger axis, z,' : 'x'} goes first`, () => {
      const entity = movePastCorner(version)
      expect(entity.position.x).toBeCloseTo(zFirst ? 1.7 : 2, 6)
      expect(entity.position.z).toBeCloseTo(zFirst ? 2.1 : 1.7, 6)
      expect(entity.isCollidedHorizontally).toBe(true)
    })
  }
})
