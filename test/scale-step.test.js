/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.20.5 the player's box is 0.6F by 1.8F times the scale attribute (EntityDimensions.scale) and it steps up
// to the step_height attribute (Entity.maxUpStep). One tick moving east at 1 on the ground at y = 60 from x = 1.2, towards a
// block at x = 2.
function moveEast (version, attributes) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const b = new Block(mcData.blocksByName[p.y < 60 || (p.x === 2 && p.y === 60) ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const byName = name => mcData.attributesByName[name].resource
  const synced = Object.fromEntries(Object.entries(attributes).map(([name, value]) => [byName(name), { value, modifiers: [] }]))
  const bot = {
    entity: { position: new Vec3(1.2, 60, 0.5), velocity: new Vec3(1, -0.08, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, attributes: synced },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.position
}

describe('scale and step height attributes', () => {
  for (const version of ['1.20.6', '1.21.1', '1.21.11', '26.1']) {
    it(`${version}: steps up to the step_height attribute`, () => {
      expect(moveEast(version, {}).y).toBe(60)
      expect(moveEast(version, { stepHeight: 1 }).y).toBe(61)
    })
    it(`${version}: the box is as wide as the scale attribute makes it`, () => {
      expect(moveEast(version, {}).x).toBeCloseTo(1.7, 6)
      expect(moveEast(version, { scale: 2 }).x).toBeCloseTo(1.4, 6)
    })
  }
})
