/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

function tick (version, bot) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const block = new Block(pos.y < 101 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos.floored()
      return block
    }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

function playerAt (version, position, velocity, onGround, others) {
  const mcData = require('minecraft-data')(version)
  const entity = { id: 1, position, velocity, onGround, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: onGround, elytraFlying: false, yaw: -Math.PI / 2, pitch: 0, effects: {} }
  const entities = { 1: entity }
  for (const other of others) entities[other.id] = { ...other, type: mcData.entitiesByName[other.name].type }
  return { entity, entities, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 0, version, inventory: { slots: [] } }
}

// A cow (entity 13) 0.4 east of a player standing still, their boxes overlapping, pushes it west (Entity.push: 0.05
// over the root of 0.4, the root in float up to 1.16). From 1.17 and up to 1.13 the cow ticks after the player, so the
// tick ends with the push as the motion; on 1.14 to 1.16 the cow (slot 20 of the client's entity map) ticks before the
// player (slot 14), which moves with the push and ends with what the ground leaves of it. The values are the vanilla
// client's.
describe('a cow the player stands in', () => {
  const cases = [
    ['1.12.2', 0.5, -0.03162277728546167],
    ['1.15.2', 0.4683772227145383, -0.017266038403357803],
    ['1.20.4', 0.5, -0.031622777072899885],
    ['26.1', 0.5, -0.031622777072899885]
  ]
  for (const [version, x, vx] of cases) {
    it(`${version}: pushes it west`, () => {
      const cow = { id: 13, name: 'cow', position: new Vec3(0.9, 101, 38.5), width: 0.9, height: 1.4 }
      const entity = tick(version, playerAt(version, new Vec3(0.5, 101, 38.5), new Vec3(0, -0.0784000015258789, 0), true, [cow]))
      expect(entity.position.x).toBe(x)
      expect(entity.velocity.x).toBe(vx)
    })
  }
})

// A boat is a collider (Level.getEntityCollisions): a player falling onto it lands on its top
describe('a boat the player falls onto', () => {
  for (const version of ['1.12.2', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: holds the player up`, () => {
      const mcData = require('minecraft-data')(version)
      const boatName = mcData.entitiesByName.boat ? 'boat' : 'oak_boat'
      const boat = { id: 29, name: boatName, position: new Vec3(3.5, 101, 38.5), width: 1.375, height: 0.5625 }
      const entity = tick(version, playerAt(version, new Vec3(3.5, 101.8, 38.5), new Vec3(0, -0.5, 0), false, [boat]))
      expect(entity.position.y).toBe(101.5625)
      expect(entity.onGround).toBe(true)
    })
  }
})

// The 1.14 to 1.16 entity map holds every entity the client knows, near or not: with 30 more entities its table grows
// from 32 to 64 slots, and a cow (entity 16) that ticked after the player (slot 7 of 32, below the player's 14) ticks
// before it (slot 39 of 64), so its push comes before the player's move.
describe('the entities the client knows on 1.15.2', () => {
  it('place a cow before or after the player in its tick order', () => {
    const version = '1.15.2'
    const cow = { id: 16, name: 'cow', position: new Vec3(0.9, 101, 38.5), width: 0.9, height: 1.4 }
    const alone = tick(version, playerAt(version, new Vec3(0.5, 101, 38.5), new Vec3(0, -0.0784000015258789, 0), true, [cow]))
    expect([alone.position.x, alone.velocity.x]).toEqual([0.5, -0.03162277728546167])
    const far = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: 'cow', position: new Vec3(0.5, 101, 138.5), width: 0.9, height: 1.4 }))
    const crowded = tick(version, playerAt(version, new Vec3(0.5, 101, 38.5), new Vec3(0, -0.0784000015258789, 0), true, [cow, ...far]))
    expect([crowded.position.x, crowded.velocity.x]).toEqual([0.4683772227145383, -0.017266038403357803])
  })
})

// A minecart is no collider (only its own moves collide), an armor stand and a bat push nothing, and up to 1.8 only the
// server pushes
describe('entities that neither hold up nor push the player', () => {
  for (const version of ['1.12.2', '1.20.4', '26.1']) {
    it(`${version}: a minecart lets a falling player through`, () => {
      const cart = { id: 29, name: 'minecart', position: new Vec3(3.5, 101, 38.5), width: 0.98, height: 0.7 }
      const entity = tick(version, playerAt(version, new Vec3(3.5, 101.8, 38.5), new Vec3(0, -0.5, 0), false, [cart]))
      expect(entity.position.y).toBeLessThan(101.7)
      expect(entity.onGround).toBe(false)
    })
    it(`${version}: an armor stand and a bat the player stands in do not push it`, () => {
      for (const name of ['armor_stand', 'bat']) {
        const other = { id: 13, name, position: new Vec3(0.9, 101, 38.5), width: 0.5, height: 0.9 }
        const entity = tick(version, playerAt(version, new Vec3(0.5, 101, 38.5), new Vec3(0, -0.0784000015258789, 0), true, [other]))
        expect(entity.velocity.x).toBe(0)
      }
    })
  }
  it('1.8.8: a cow the player stands in does not push it', () => {
    const cow = { id: 13, name: 'Cow', position: new Vec3(0.9, 101, 38.5), width: 0.9, height: 1.4 }
    const entity = tick('1.8.8', playerAt('1.8.8', new Vec3(0.5, 101, 38.5), new Vec3(0, -0.0784000015258789, 0), true, [cow]))
    expect(entity.velocity.x).toBe(0)
  })
})
