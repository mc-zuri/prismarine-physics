/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LivingEntity.aiStep with the jump key in a fluid: swim up by (double)0.04F (jumpInLiquid) or jump from the ground.
// Up to 1.12 any water or lava swims up. On 1.13 to 1.15 water swims up off the ground or when deeper than 0.4, lava
// always. From 1.16 the fluid's height against the fluid jump threshold decides for lava too. From 1.13 sneaking in
// water sinks by 0.04F (LocalPlayer.goDownInWater).

// One tick standing on the floor (y = 60) in `depth` blocks of `fluid` (or floating at y = 61 in deep water)
function tickIn (version, fluid, depth, controls, { floating = false, velY = 0 } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const name = pos.y < 60 ? 'stone' : pos.y < 60 + depth ? fluid : 'air'
      const block = new Block(mcData.blocksByName[name].id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, floating ? 61 : 60, 0.5),
      velocity: new Vec3(0, velY, 0),
      onGround: !floating,
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
  const keys = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false, ...controls }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, keys), world).apply(bot)
  return bot.entity.position.y
}

const VERSIONS = ['1.8.8', '1.12.2', '1.13.2', '1.15.2', '1.16.5', '1.20.4', '1.21.11', '26.1']

describe('jumping in fluids', () => {
  for (const version of VERSIONS) {
    it(`${version}: swims up in deep water by 0.04F`, () => {
      const still = tickIn(version, 'water', 3, {}, { floating: true })
      const swimming = tickIn(version, 'water', 3, { jump: true }, { floating: true })
      expect(swimming - still).toBeCloseTo(Math.fround(0.04), 12)
    })

    const sinks = require('minecraft-data')(version).version['>=']('1.13')
    it(`${version}: ${sinks ? 'sinks by 0.04F' : 'does not sink'} sneaking in deep water`, () => {
      const still = tickIn(version, 'water', 3, {}, { floating: true })
      const sneaking = tickIn(version, 'water', 3, { sneak: true }, { floating: true })
      expect(still - sneaking).toBeCloseTo(sinks ? Math.fround(0.04) : 0, 12)
    })

    // the sink comes before LivingEntity.aiStep stops a negligible motion: rising at 0.0415, sneaking leaves 0.0015,
    // which stops
    if (sinks) {
      it(`${version}: sinks before a negligible motion stops`, () => {
        const still = tickIn(version, 'water', 3, {}, { floating: true })
        expect(tickIn(version, 'water', 3, { sneak: true }, { floating: true, velY: 0.0415 })).toBe(still)
      })
    }
  }

  // A thin layer of flowing fluid (level 7) on the floor, standing in it with the jump key: true when the jump is from
  // the ground (rising well over 0.04), false when it swims up
  function jumpsFromGround (version, fluid) {
    const mcData = require('minecraft-data')(version)
    const Block = require('prismarine-block')(version)
    const info = mcData.blocksByName[fluid]
    const world = {
      getBlock: (pos) => {
        const block = pos.y < 60
          ? new Block(mcData.blocksByName.stone.id, 0, 0)
          : pos.y < 61
            ? (info.minStateId !== undefined ? Block.fromStateId(info.minStateId + 7, 0) : new Block(info.id, 0, 7))
            : new Block(mcData.blocksByName.air.id, 0, 0)
        block.position = pos
        return block
      }
    }
    const bot = {
      // isInLava: on 1.14 and 1.15 the flag the last move set, standing in the lava
      entity: { position: new Vec3(0.5, 60, 0.5), velocity: new Vec3(0, 0, 0), onGround: true, isInWater: false, isInLava: fluid === 'lava', isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
      jumpTicks: 0,
      jumpQueued: false,
      fireworkRocketDuration: 0,
      version,
      inventory: { slots: [] }
    }
    const keys = { forward: false, back: false, left: false, right: false, jump: true, sprint: false, sneak: false }
    Physics(mcData, world).simulatePlayer(new PlayerState(bot, keys), world).apply(bot)
    return bot.entity.position.y > 60.3
  }

  it('in shallow water jumps from the ground from 1.13', () => {
    for (const [version, fromGround] of [['1.12.2', false], ['1.13.2', true], ['1.15.2', true], ['1.21.11', true]]) {
      expect(jumpsFromGround(version, 'water')).toBe(fromGround)
    }
  })

  it('in shallow lava jumps from the ground from 1.16', () => {
    for (const [version, fromGround] of [['1.12.2', false], ['1.15.2', false], ['1.16.5', true], ['1.21.11', true]]) {
      expect(jumpsFromGround(version, 'lava')).toBe(fromGround)
    }
  })
})
