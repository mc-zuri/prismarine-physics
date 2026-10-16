/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 26.1 LivingEntity.checkFallDamage, in the move, looks again for every fluid when the player is not in water
// (Entity.updateFluidInteraction); up to 1.21.11 it looks for water only (updateInWaterStateAndDoWaterCurrentPushing). A
// player walking east at 0.3 from x = 1.5 on the floor (the block below y = 60) into a lava pool from x = 2 is in lava by
// the end of that tick on 26.1, and only on the next tick before.
function walkIntoLava (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const name = p.y < 60 ? 'stone' : p.y === 60 && p.x >= 2 ? 'lava' : 'air'
      const b = new Block(mcData.blocksByName[name].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(1.5, 60, 0.5), velocity: new Vec3(0.3, 0, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
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

describe('lava after the move', () => {
  for (const version of ['1.16.5', '1.20.4', '1.21.11', '26.1']) {
    const afterMove = version === '26.1'
    it(`${version}: the player is in lava ${afterMove ? 'by the end of the tick' : 'only from the next tick'}`, () => {
      const entity = walkIntoLava(version)
      expect(entity.position.x).toBeGreaterThan(1.7)
      expect(entity.isInLava).toBe(afterMove)
      if (afterMove) expect(entity.lavaHeight).toBeGreaterThan(0)
    })
  }
})
