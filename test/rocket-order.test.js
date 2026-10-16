/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.14 to 1.16 the client ticks its entities in its entity map's order (Int2ObjectOpenHashMap: slot mix(id) & 31,
// from the highest slot down). A gliding player (entity 1, slot 14) rides a rocket: entity 64 (slot 30) ticks before
// the player, so its boost comes before the player's move, and entity 46 (slot 9) after, so the move comes first and
// goes less far. Up to 1.13 and from 1.17 every rocket ticks after the player.
function glideWithRocket (version, rocketId) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const block = new Block(mcData.blocksByName.air.id, 0, 0)
      block.position = pos.floored()
      return block
    }
  }
  const entity = { id: 1, position: new Vec3(0.5, 130, 0.5), velocity: new Vec3(0, -0.3, 0.05), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: true, yaw: Math.PI, pitch: 10 * Math.PI / 180, effects: {} }
  const rocketName = mcData.entitiesByName.firework_rocket ? 'firework_rocket' : 'fireworks_rocket'
  const rocket = { id: rocketId, name: rocketName, type: mcData.entitiesByName[rocketName].type, position: new Vec3(0.5, 130, 0.5), width: 0.25, height: 0.25 }
  const bot = { entity, entities: { 1: entity, [rocketId]: rocket }, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 1, version, inventory: { slots: [] } }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return entity.position.z
}

describe('the tick of a rocket a gliding player rides', () => {
  for (const version of ['1.14.4', '1.15.2', '1.16.5']) {
    it(`${version}: comes before the player's move for a rocket in a higher slot`, () => {
      expect(glideWithRocket(version, 64)).toBeGreaterThan(glideWithRocket(version, 46))
    })
  }
  for (const version of ['1.13.2', '1.17.1', '1.20.4', '26.1']) {
    it(`${version}: comes after the player's move`, () => {
      expect(glideWithRocket(version, 64)).toBe(glideWithRocket(version, 46))
    })
  }
})
