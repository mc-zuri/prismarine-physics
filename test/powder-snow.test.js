/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// PowderSnowBlock.getCollisionShape (1.17+): a 0.9 tall box under a player that has fallen more than 2.5; a full block
// under one in leather boots standing above it and not sneaking; otherwise nothing. One tick falling at -0.6 from 61.2
// onto powder snow at y = 60.
function landOnSnow (version, { fallDistance = 0, boots = false, sneak = false } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 50 ? 'stone' : y === 60 ? 'powder_snow' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 61.2, 0.5), velocity: new Vec3(0, -0.6, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, fallDistance },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: Object.assign([], { 8: boots ? { name: 'leather_boots' } : undefined }) }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('powder snow collision', () => {
  for (const version of ['1.17.1', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: a long fall lands on a 0.9 tall box`, () => {
      const landed = landOnSnow(version, { fallDistance: 3 })
      expect(landed.position.y).toBe(60.89999997615814)
      expect(landed.onGround).toBe(true)
    })
    it(`${version}: a short fall sinks in, unless in leather boots and not sneaking`, () => {
      expect(landOnSnow(version).position.y).toBeCloseTo(60.6, 9)
      expect(landOnSnow(version, { boots: true }).position.y).toBe(61)
      expect(landOnSnow(version, { boots: true, sneak: true }).position.y).toBeCloseTo(60.6, 9)
    })
  }
})

// LivingEntity.travel (1.17+): leather boots climb powder snow like a ladder, jumping or against a wall: the block at
// the feet after the move up to 1.21.4, from 1.21.5 whether powder snow touched the player the tick before. One tick
// jumping inside a column of powder snow.
function jumpInSnow (version, { boots = true, isInPowderSnow = true } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 60 ? 'stone' : y <= 62 ? 'powder_snow' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 60.5, 0.5), velocity: new Vec3(0, 0, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, isInPowderSnow },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: Object.assign([], { 8: boots ? { name: 'leather_boots' } : undefined }) }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: true, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('powder snow climbing', () => {
  const climbed = (0.2 - 0.08) * Math.fround(0.98)
  for (const version of ['1.17.1', '1.20.4', '1.21.4', '1.21.5', '1.21.11', '26.1']) {
    it(`${version}: leather boots climb powder snow`, () => {
      expect(jumpInSnow(version).velocity.y).toBe(climbed)
      expect(jumpInSnow(version, { boots: false }).velocity.y).not.toBe(climbed)
    })
  }
  it('from 1.21.5 the climb needs powder snow on the tick before', () => {
    expect(jumpInSnow('1.21.4', { isInPowderSnow: false }).velocity.y).toBe(climbed)
    expect(jumpInSnow('1.21.11', { isInPowderSnow: false }).velocity.y).not.toBe(climbed)
  })
})
