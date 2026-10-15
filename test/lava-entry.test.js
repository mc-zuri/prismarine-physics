/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LivingEntity.travel in lava (1.16+): with the lava's height at or under the fluid jump threshold (shallow) the
// motion keeps 0.8F of its vertical part and sinks by gravity / 16, otherwise half of it; then gravity / 4. The height
// is the one the tick began with: after the move, LivingEntity.checkFallDamage looks again for water only, up to
// 1.21.11; from 26.1 it updates water and lava (Entity.updateFluidInteraction), so the lava fallen into counts.
// One tick falling at -0.7171 into lava whose top is 0.2349 above the feet.
const VY = -0.7170746714356033
function fallIntoLava (version, y = 100.6537296175886) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 97 ? 'stone' : y <= 100 ? 'lava' : 'air'].id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, y, 0.5),
      velocity: new Vec3(0, VY, 0),
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

const SHALLOW = VY * Math.fround(0.8) - 0.08 / 16 - 0.08 / 4
const DEEP = VY * 0.5 - 0.08 / 4

describe('entering lava', () => {
  for (const [version, vy] of [['1.16.5', SHALLOW], ['1.20.4', SHALLOW], ['1.21.11', SHALLOW], ['26.1', DEEP]]) {
    it(`${version}: falling into lava travels by the ${vy === SHALLOW ? 'height the tick began with (shallow)' : 'lava fallen into (deep)'}`, () => {
      expect(fallIntoLava(version).velocity.y).toBe(vy)
    })
  }

  // Entity.isInLava: up to 1.13 looked up whenever asked (any lava in the box shrunk by 0.1, 0.4, 0.1), on 1.14 and 1.15
  // the flag the move sets; both follow the moved box. From 1.16 the lava height the tick began with. From 1.3 above
  // the lava, falling into it:
  for (const [version, inLava] of [['1.8.8', true], ['1.12.2', true], ['1.13.2', true], ['1.14.4', true], ['1.15.2', true], ['1.16.5', false], ['1.21.11', false]]) {
    it(`${version}: after falling into lava the player is ${inLava ? 'in it' : 'not in it yet'}`, () => {
      expect(fallIntoLava(version, 101.3).isInLava).toBe(inLava)
    })
  }
})
