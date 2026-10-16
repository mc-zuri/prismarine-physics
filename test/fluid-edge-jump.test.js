/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

const HALF_WIDTH = Math.fround(0.3)

// A player in a one-deep pool of `fluid` (the blocks at y = 60 for x < 2) floats at `y` and moves into the stone ledge
// beside it (y = 60 from x = 2). Meeting the ledge, LivingEntity.travel jumps it out of the fluid (0.3 up) if the box
// 0.6 higher is free (Entity.isFree): no collision and no fluid at any height in the cells it is in
// (Level.containsAnyLiquid). At y = 60.35 that box starts above the fluid's surface but in its cell, so it is not free;
// at y = 60.45 it starts in the cell above.
function moveIntoLedge (version, fluid, y) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const name = p.y < 60 || (p.y === 60 && p.x >= 2) ? 'stone' : p.y === 60 ? fluid : 'air'
      const b = new Block(mcData.blocksByName[name].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(2 - 0.05 - HALF_WIDTH, y, 0.5), velocity: new Vec3(0.1, 0, 0), onGround: false, isInWater: fluid === 'water', isInLava: fluid === 'lava', isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
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

describe('jumping out of a fluid at a ledge', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.21.4', '1.21.11', '26.1']) {
    for (const fluid of ['water', 'lava']) {
      it(`${version}: not while the box 0.6 higher is in a ${fluid} block's cell`, () => {
        const entity = moveIntoLedge(version, fluid, 60.35)
        expect(entity.isCollidedHorizontally).toBe(true)
        expect(entity.velocity.y).toBeLessThan(0)
      })
      it(`${version}: once the box 0.6 higher is above the ${fluid} block's cell`, () => {
        const entity = moveIntoLedge(version, fluid, 60.45)
        expect(entity.velocity.y).toBe(0.30000001192092896)
      })
    }
  }
})
