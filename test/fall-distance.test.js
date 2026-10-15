/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// Entity.checkFallDamage at the end of Entity.move: a downward move adds to the fall distance, the ground and water end
// it. A float: (float)(fallDistance - y) up to 1.18, fallDistance -= (float)y from 1.19; from 1.21.5 a double adding
// (float)y. On 1.21.4 the local player skips it in move, so it stays 0.
function fallTicks (version, ticks, { ground = 0 } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = { getBlock: (pos) => { const b = new Block(mcData.blocksByName[Math.floor(pos.y) < ground ? 'stone' : 'air'].id, 0, 0); b.position = pos.clone(); return b } }
  const bot = {
    entity: { position: new Vec3(0.5, 100, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const physics = Physics(mcData, world)
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  const moves = []
  for (let i = 0; i < ticks; i++) {
    const y = bot.entity.position.y
    physics.simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
    moves.push(bot.entity.position.y - y)
  }
  return { fallDistance: bot.entity.fallDistance, moves, onGround: bot.entity.onGround }
}

describe('fall distance', () => {
  const f = Math.fround
  for (const [version, add] of [
    ['1.12.2', (fd, dy) => f(fd - dy)],
    ['1.18.2', (fd, dy) => f(fd - dy)],
    ['1.20.4', (fd, dy) => f(fd - f(dy))],
    ['1.21.3', (fd, dy) => f(fd - f(dy))],
    ['1.21.11', (fd, dy) => fd - f(dy)],
    ['26.1', (fd, dy) => fd - f(dy)]
  ]) {
    it(`${version}: a fall adds up as the version does, and ends on the ground`, () => {
      const { fallDistance, moves } = fallTicks(version, 3)
      expect(fallDistance).toBe(moves.reduce(add, 0))
      const landed = fallTicks(version, 3, { ground: 100 })
      expect(landed.onGround).toBe(true)
      expect(landed.fallDistance).toBe(0)
    })
  }

  it('1.21.4: the local player keeps no fall distance', () => {
    expect(fallTicks('1.21.4', 3).fallDistance).toBe(0)
  })
})

// A flyer's fall distance ends after the move up to 1.21.1 (Player.travel) and before travel from 1.21.2
// (Player.aiStep), so a descending flyer ends the tick with none, or with the tick's descent
describe('fall distance while flying', () => {
  function flyDown (version) {
    const mcData = require('minecraft-data')(version)
    const Block = require('prismarine-block')(version)
    const world = { getBlock: (pos) => { const b = new Block(mcData.blocksByName.air.id, 0, 0); b.position = pos.clone(); return b } }
    const bot = {
      entity: { position: new Vec3(0.5, 100, 0.5), velocity: new Vec3(0, -0.3, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, flying: true, flyingSpeed: 0.05, yaw: Math.PI, pitch: 0, effects: {}, fallDistance: 2 },
      jumpTicks: 0,
      jumpQueued: false,
      fireworkRocketDuration: 0,
      version,
      inventory: { slots: [] }
    }
    const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: true }
    Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
    return bot.entity.fallDistance
  }
  for (const [version, none] of [['1.20.4', true], ['1.21.1', true], ['1.21.3', false], ['1.21.11', false]]) {
    it(`${version}: a descending flyer ends the tick with ${none ? 'no fall distance' : 'the descent'}`, () => {
      if (none) expect(flyDown(version)).toBe(0)
      else expect(flyDown(version)).toBeGreaterThan(0)
    })
  }
})
