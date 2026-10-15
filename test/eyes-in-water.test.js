/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A sprint starts in water only with the eyes under it (LocalPlayer.aiStep, isUnderWater). From 1.16 isUnderWater is
// the eyes of the tick before (Entity.wasEyeInWater) while in water; on 1.13 to 1.15 the eyes now. One tick pressing
// sprint and forward, deep in water, with the eyes under it or not on the tick before.
function sprintUnderWater (version, eyeInWaterBefore) {
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
    entity: { position: new Vec3(0.5, 60, 0.5), velocity: new Vec3(0, 0, 0), onGround: false, isInWater: true, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, eyeInWater: eyeInWaterBefore },
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

describe('eyes in water', () => {
  for (const version of ['1.13.2', '1.15.2']) {
    it(`${version}: the eyes under water now let a sprint start`, () => {
      expect(sprintUnderWater(version, false).isSprinting).toBe(true)
    })
  }
  for (const version of ['1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: a sprint starts only with the eyes under water on the tick before`, () => {
      expect(sprintUnderWater(version, false).isSprinting).toBe(false)
      expect(sprintUnderWater(version, true).isSprinting).toBe(true)
      expect(sprintUnderWater(version, true).eyeInWater).toBe(true)
    })
  }
})

// From 1.16 to 1.20.4 the eyes are taken 0.11111111 lower (Entity.updateFluidOnEyes), so eyes just over the surface of
// the water still count as in it there. Eyes 0.05 over the surface of water at y = 60 (its top 8/9 up).
function eyesJustOverWater (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 50 ? 'stone' : y <= 60 ? 'water' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const eyeY = 60 + Math.fround(8 / 9) + 0.05
  const bot = {
    entity: { position: new Vec3(0.5, eyeY - Math.fround(1.62), 0.5), velocity: new Vec3(0, 0, 0), onGround: false, isInWater: true, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] },
    food: 20
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.eyeInWater
}

describe('eyes just over the water', () => {
  for (const [version, under] of [['1.16.5', true], ['1.20.4', true], ['1.20.6', false], ['1.21.11', false]]) {
    it(`${version}: eyes 0.05 over the surface ${under ? 'count as' : 'are not'} under it`, () => {
      expect(eyesJustOverWater(version)).toBe(under)
    })
  }
})
