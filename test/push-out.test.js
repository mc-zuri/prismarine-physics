/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LocalPlayer.aiStep pushes a player inside blocks towards the nearest open side (pushOutOfBlocks up to 1.15,
// moveTowardsClosestSpace from 1.16). One tick standing at x = 1.3 inside a 2 tall stone column at x = 1, open to the
// west at x = 0 and walled in to the east: the motion turns west.
function standInColumn (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const solid = p.y < 60 || ((p.x === 1 || p.x === 2) && p.y <= 61 && p.z === 0)
      const b = new Block(mcData.blocksByName[solid ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(1.3, 60, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
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

describe('push out of blocks', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.21.11', '26.1']) {
    it(`${version}: a player inside a block is pushed towards the open side`, () => {
      const entity = standInColumn(version)
      expect(entity.position.x).toBeLessThan(1.3)
    })
  }
})
