/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A passenger (bot.vehicle) ticks from no motion with its own input (Entity.rideTick), as in the air, and its vehicle
// places it: holding forward it ends the tick moving at 0.02 * 0.98 slowed by 0.91 and falling at 0.0784, where it
// started. The values are the vanilla client's.
describe('a player riding a vehicle', () => {
  const cases = [['1.8.8', 0.017836000725567347], ['1.12.2', 0.017836000725567347], ['1.13.2', 0.017836000725567347], ['1.20.4', 0.017836000462502232], ['1.21.11', 0.017836000462502232], ['26.1', 0.017836000462502232]]
  for (const [version, vx] of cases) {
    it(`${version}: moves from its own input but stays put`, () => {
      const mcData = require('minecraft-data')(version)
      const Block = require('prismarine-block')(version)
      const world = { getBlock: (pos) => { const block = new Block(mcData.blocksByName.air.id, 0, 0); block.position = pos.floored(); return block } }
      const entity = { position: new Vec3(2.5, 100.7125, 0.5), velocity: new Vec3(0.3, 0.2, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: -Math.PI / 2, pitch: 0, effects: {} }
      const bot = { entity, vehicle: { id: 97 }, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 0, version, inventory: { slots: [] } }
      const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
      Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
      expect(entity.velocity.x).toBe(vx)
      expect(entity.velocity.y).toBe(-0.0784000015258789)
      expect(entity.position).toEqual(new Vec3(2.5, 100.7125, 0.5))
    })
  }
})
