/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// Entity.makeStuckInBlock: a block the player is in sets a multiplier the next move uses once (and stops the motion):
// a cobweb (0.25, 0.05F, 0.25), with Weaving from 1.20.5 (0.5, 0.25, 0.5); a sweet berry bush from 1.14
// (0.8F, 0.75, 0.8F); powder snow at the feet from 1.17 (0.9F, 1.5, 0.9F). A flying player is never stuck.
const f = Math.fround

function tickIn (version, blockName, { flying = false, weaving = false, stuck = null, velocity = [0, 0, 0] } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const info = mcData.blocksByName[pos.y < 60 ? 'stone' : pos.y < 61 ? blockName : 'air']
      const b = info.defaultState !== undefined ? Block.fromStateId(info.defaultState, 0) : new Block(info.id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, 60, 0.5),
      velocity: new Vec3(...velocity),
      onGround: !flying,
      isInWater: false,
      isInLava: false,
      isInWeb: !!stuck,
      stuckSpeedMultiplier: stuck,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      flying,
      flyingSpeed: f(0.05),
      yaw: Math.PI,
      pitch: 0,
      effects: weaving ? { [mcData.effectsByName.Weaving.id]: { amplifier: 0, duration: 100 } } : {}
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

const multiplierOf = entity => entity.stuckSpeedMultiplier && [entity.stuckSpeedMultiplier.x, entity.stuckSpeedMultiplier.y, entity.stuckSpeedMultiplier.z]

describe('stuck in a block', () => {
  for (const version of ['1.8.8', '1.13.2', '1.14.4', '1.21.11', '26.1']) {
    it(`${version}: a cobweb sets (0.25, 0.05F, 0.25)`, () => {
      expect(multiplierOf(tickIn(version, 'cobweb' in require('minecraft-data')(version).blocksByName ? 'cobweb' : 'web'))).toEqual([0.25, f(0.05), 0.25])
    })
  }

  for (const version of ['1.14.4', '1.17.1', '1.21.11']) {
    it(`${version}: a sweet berry bush sets (0.8F, 0.75, 0.8F)`, () => {
      expect(multiplierOf(tickIn(version, 'sweet_berry_bush'))).toEqual([f(0.8), 0.75, f(0.8)])
    })
  }

  for (const version of ['1.17.1', '1.21.11']) {
    it(`${version}: powder snow at the feet sets (0.9F, 1.5, 0.9F)`, () => {
      expect(multiplierOf(tickIn(version, 'powder_snow'))).toEqual([f(0.9), 1.5, f(0.9)])
    })
  }

  it('Weaving makes a cobweb (0.5, 0.25, 0.5) from 1.20.5', () => {
    expect(multiplierOf(tickIn('1.21.11', 'cobweb', { weaving: true }))).toEqual([0.5, 0.25, 0.5])
  })

  it('does not stick a flying player', () => {
    expect(tickIn('1.21.11', 'cobweb', { flying: true }).isInWeb).toBe(false)
  })

  // The blocks are visited x, then y, then z, and the last stuck block wins: standing across x = 1 with a cobweb at
  // (0, 61, 0) and a sweet berry bush at (1, 60, 0), the bush comes last
  for (const version of ['1.14.4', '1.21.1']) {
    it(`${version}: the last block visited, x then y then z, sets the multiplier`, () => {
      const mcData = require('minecraft-data')(version)
      const Block = require('prismarine-block')(version)
      const names = { '0,61,0': 'cobweb', '1,60,0': 'sweet_berry_bush' }
      const world = {
        getBlock: (pos) => {
          const p = pos.floored()
          const name = p.y < 60 ? 'stone' : names[`${p.x},${p.y},${p.z}`] ?? 'air'
          const info = mcData.blocksByName[name]
          const b = info.defaultState !== undefined ? Block.fromStateId(info.defaultState, 0) : new Block(info.id, 0, 0)
          b.position = pos
          return b
        }
      }
      const bot = {
        entity: { position: new Vec3(1, 60, 0.5), velocity: new Vec3(0, 0, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
        jumpTicks: 0,
        jumpQueued: false,
        fireworkRocketDuration: 0,
        version,
        inventory: { slots: [] }
      }
      const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
      Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
      expect(multiplierOf(bot.entity)).toEqual([f(0.8), 0.75, f(0.8)])
    })
  }

  it('scales the next move once and stops the motion', () => {
    // standing in air with a berry bush's multiplier left from the tick before, moving east at 0.5
    const entity = tickIn('1.21.11', 'air', { stuck: new Vec3(f(0.8), 0.75, f(0.8)), velocity: [0.5, 0, 0] })
    expect(entity.position.x).toBe(0.5 + 0.5 * f(0.8))
    expect(entity.velocity.x).toBe(0)
    expect(entity.isInWeb).toBe(false)
  })
})
