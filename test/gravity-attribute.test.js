/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.20.5 a living entity falls by its gravity attribute (LivingEntity.getEffectiveGravity), 0.08 by default;
// falling with Slow Falling by at most 0.01. One tick falling at -0.1 in the air.
function fall (version, gravity, { slowFalling = false } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = { getBlock: (pos) => { const b = new Block(mcData.blocksByName.air.id, 0, 0); b.position = pos.clone(); return b } }
  const resource = mcData.attributesByName.gravity.resource
  const effects = slowFalling ? { [mcData.effectsByName.SlowFalling.id]: { amplifier: 0, duration: 100 } } : {}
  const bot = {
    entity: { position: new Vec3(0.5, 100, 0.5), velocity: new Vec3(0, -0.1, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects, attributes: { [resource]: { value: gravity, modifiers: [] } } },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.velocity.y
}

describe('gravity attribute', () => {
  for (const version of ['1.21.1', '1.21.11', '26.1']) {
    it(`${version}: falls by the gravity attribute`, () => {
      expect(fall(version, 0.04)).toBe((-0.1 - 0.04) * Math.fround(0.98))
      expect(fall(version, -0.02)).toBe((-0.1 + 0.02) * Math.fround(0.98))
    })
    it(`${version}: with Slow Falling falls by at most 0.01`, () => {
      expect(fall(version, 0.04, { slowFalling: true })).toBe((-0.1 - 0.01) * Math.fround(0.98))
      expect(fall(version, 0.005, { slowFalling: true })).toBe((-0.1 - 0.005) * Math.fround(0.98))
    })
  }
})

// From 1.21.2 LivingEntity.travelInAir takes the gravity after the move, so Slow Falling's 0.01 applies only when the
// move left the player falling: landing on slime with Slow Falling bounces it up, and it falls back by the full gravity
describe('gravity after the move', () => {
  function landOnSlime (version) {
    const mcData = require('minecraft-data')(version)
    const Block = require('prismarine-block')(version)
    const world = { getBlock: (pos) => { const y = Math.floor(pos.y); const b = new Block(mcData.blocksByName[y < 59 ? 'stone' : y === 59 ? 'slime_block' : 'air'].id, 0, 0); b.position = pos.clone(); return b } }
    const bot = {
      entity: { position: new Vec3(0.5, 60.3, 0.5), velocity: new Vec3(0, -0.5, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: { [mcData.effectsByName.SlowFalling.id]: { amplifier: 0, duration: 100 } } },
      jumpTicks: 0,
      jumpQueued: false,
      fireworkRocketDuration: 0,
      version,
      inventory: { slots: [] }
    }
    const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
    Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
    return bot.entity.velocity.y
  }
  it('1.21.1: Slow Falling\'s gravity even after the bounce', () => {
    expect(landOnSlime('1.21.1')).toBe((0.5 - 0.01) * Math.fround(0.98))
  })
  for (const version of ['1.21.3', '1.21.11']) {
    it(`${version}: the full gravity after the bounce`, () => {
      expect(landOnSlime(version)).toBe((0.5 - 0.08) * Math.fround(0.98))
    })
  }
})
