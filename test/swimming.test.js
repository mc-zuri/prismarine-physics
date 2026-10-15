/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.13 a sprinter with the eyes under water starts swimming (Entity.updateSwimming), and a swimmer's vertical
// motion turns towards the look, by 0.06 looking level (Player.travel). One tick sprinting forward deep in water,
// sinking at -0.004 and looking level.
function sprintInWater (version, { swimming, eyeInWater = true }) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 55 ? 'stone' : y <= 65 ? 'water' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 60, 0.5), velocity: new Vec3(0, -0.004, 0), onGround: false, isInWater: true, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, isSprinting: true, isSwimming: swimming, eyeInWater },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] },
    food: 20
  }
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: true, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('swimming', () => {
  for (const version of ['1.13.2', '1.16.5', '1.21.11', '26.1']) {
    it(`${version}: a sprinter with the eyes under water starts swimming`, () => {
      expect(sprintInWater(version, { swimming: false }).isSwimming).toBe(true)
    })
    it(`${version}: a swimmer's vertical motion turns towards a level look`, () => {
      expect(sprintInWater(version, { swimming: true }).velocity.y).toBe((-0.004 + 0.004 * 0.06) * Math.fround(0.8))
    })
  }
})

// From 1.17 a sprinter starts swimming only with water at its feet (Entity.updateSwimming). Feet in an air pocket under
// water, the eyes under it on the tick before.
function sprintWithFeetInAir (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 60 ? 'stone' : y === 60 ? 'air' : y <= 65 ? 'water' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 60, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: true, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, isSprinting: true, eyeInWater: true },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] },
    food: 20
  }
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: true, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.isSwimming
}

describe('swimming needs water at the feet', () => {
  for (const [version, swims] of [['1.16.5', true], ['1.17.1', false], ['1.18.2', false], ['1.21.11', false]]) {
    it(`${version}: a sprinter with the feet out of water ${swims ? 'starts' : 'does not start'} swimming`, () => {
      expect(sprintWithFeetInAir(version)).toBe(swims)
    })
  }
})
