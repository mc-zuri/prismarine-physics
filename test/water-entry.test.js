/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// Entity.move ends with checkFallDamage, where LivingEntity first looks for water again around the box the move left
// (updateInWaterStateAndDoWaterCurrentPushing) when the player was not in water: a player falling into water is in it
// on the tick it enters. On 1.21.4 the local player skips checkFallDamage in move (Player.isControlledByClient), so it is
// in the water only from the next tick.
function fallInto (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 58 ? 'stone' : y < 62 ? 'water' : 'air'].id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, 62.3, 0.5),
      velocity: new Vec3(0, -1, 0),
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
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('entering water', () => {
  for (const [version, atOnce] of [['1.8.8', true], ['1.12.2', true], ['1.13.2', true], ['1.16.5', true], ['1.20.4', true], ['1.21.1', true], ['1.21.3', true], ['1.21.4', false], ['1.21.5', true], ['1.21.11', true], ['26.1', true]]) {
    it(`${version}: a falling player is in the water ${atOnce ? 'on the tick it enters' : 'from the next tick'}`, () => {
      const entity = fallInto(version)
      expect(entity.position.y).toBeLessThan(61.6)
      expect(entity.isInWater).toBe(atOnce)
    })
  }
})

// The fluid the tick travels in is chosen before the move: sinking in lava towards water under it, the move may find
// the water (checkFallDamage), but the tick still takes the lava's drag
describe('sinking from lava towards water', () => {
  for (const version of ['1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: keeps the lava's drag`, () => {
      const mcData = require('minecraft-data')(version)
      const Block = require('prismarine-block')(version)
      const world = {
        getBlock: (pos) => {
          const y = Math.floor(pos.y)
          const b = new Block(mcData.blocksByName[y < 55 ? 'stone' : y <= 60 ? 'water' : y === 61 ? 'lava' : 'air'].id, 0, 0)
          b.position = pos
          return b
        }
      }
      const bot = {
        entity: { position: new Vec3(0.5, 61.1, 0.5), velocity: new Vec3(0, -0.3, 0), onGround: false, isInWater: false, isInLava: true, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
        jumpTicks: 0,
        jumpQueued: false,
        fireworkRocketDuration: 0,
        version,
        inventory: { slots: [] }
      }
      const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
      Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
      expect(bot.entity.velocity.y).toBe(-0.3 * 0.5 - 0.08 / 4)
    })
  }
})
