/* eslint-env mocha */

const expect = require('expect')
const { firstTick } = require('./helpers/walk')

// The sneak slowdown (0.3) and when it applies. Up to 1.14 the sneak key slows the input in the tick it goes down
// (KeyboardInput). From 1.15 the slowdown follows crouching, which LocalPlayer.aiStep decides from the tick before's
// key, so it starts a tick after the key. Walking east on ice from rest, velocity x after one tick:
const UNSLOWED = { legacy: 0.020057144802124727, v113: 0.020057148124338786, modern: 0.02005714406293894 }
const SLOWED = { legacy: 0.0060171438559141754, v113: 0.00601714468646769, modern: 0.006017143706840427 }

// [version, era of the float chain, slowed on the tick the key goes down]
const VERSIONS = [
  ['1.8.8', 'legacy', true],
  ['1.12.2', 'legacy', true],
  ['1.13.2', 'v113', true],
  ['1.14.4', 'modern', true],
  ['1.15.2', 'modern', false],
  ['1.16.5', 'modern', false],
  ['1.20.4', 'modern', false],
  ['1.21.1', 'modern', false],
  ['1.21.4', 'modern', false],
  ['1.21.11', 'modern', false],
  ['26.1', 'modern', false]
]

function walkOnIce (version, sneakBefore) {
  return firstTick(version, { floor: 'ice', yawDegrees: -90, controls: { forward: true, sneak: true }, state: { shiftKeyDown: sneakBefore } }).x
}

describe('sneak slowdown', () => {
  for (const [version, era, slowedAtOnce] of VERSIONS) {
    describe(version, () => {
      it(slowedAtOnce ? 'slows the tick the sneak key goes down' : 'starts slowing a tick after the sneak key goes down', () => {
        expect(walkOnIce(version, false)).toBe(slowedAtOnce ? SLOWED[era] : UNSLOWED[era])
      })

      it('slows while the sneak key stays down', () => {
        expect(walkOnIce(version, true)).toBe(SLOWED[era])
      })
    })
  }

  // In creative flight the slowdown stays on 1.8, LocalPlayer divides it back out on 1.9 to 1.14, and from 1.15 a flying
  // player does not crouch
  for (const [version, slowedFlying] of [['1.8.8', true], ['1.9.4', false], ['1.13.2', false], ['1.14.4', false], ['1.20.4', false], ['1.21.11', false]]) {
    it(`${version}: ${slowedFlying ? 'slows' : 'does not slow'} a flying player`, () => {
      const fly = sneak => firstTick(version, {
        airborne: true,
        yawDegrees: -90,
        controls: { forward: true, sneak },
        state: { flying: true, flyingSpeed: Math.fround(0.05), shiftKeyDown: sneak }
      }).x
      if (slowedFlying) expect(fly(true)).toBeLessThan(fly(false) / 2)
      else expect(fly(true)).toBe(fly(false))
    })
  }
})

describe('sneak slowdown factor', () => {
  // walking on ice with the sneak key held since the tick before, from rest: (impulse * 0.98F) times the ice's float
  // acceleration and inertia (1.14+, in double)
  const f = Math.fround
  const ice = f(0.98)
  const iceVelocity = zza => zza * f(f(0.1) * f(f(0.21600002) / f(f(ice * ice) * ice))) * f(ice * f(0.91))

  it('1.20.4: Swift Sneak III slows to 0.3F + 3 * 0.15F', () => {
    const nbt = require('prismarine-nbt')
    const { Physics, PlayerState } = require('prismarine-physics')
    const { Vec3 } = require('vec3')
    const version = '1.20.4'
    const mcData = require('minecraft-data')(version)
    const Block = require('prismarine-block')(version)
    const world = {
      getBlock: (pos) => {
        const block = new Block(pos.y < 60 ? mcData.blocksByName.ice.id : mcData.blocksByName.air.id, 0, 0)
        block.position = pos
        return block
      }
    }
    const leggings = { nbt: nbt.comp({ Enchantments: nbt.list(nbt.comp([{ id: nbt.string('minecraft:swift_sneak'), lvl: nbt.short(3) }])) }) }
    const bot = {
      entity: {
        position: new Vec3(0.5, 60, 0.5),
        velocity: new Vec3(0, 0, 0),
        onGround: true,
        isInWater: false,
        isInLava: false,
        isInWeb: false,
        isCollidedHorizontally: false,
        isCollidedVertically: false,
        elytraFlying: false,
        yaw: Math.PI + Math.PI / 2, // east
        pitch: 0,
        effects: {},
        shiftKeyDown: true
      },
      jumpTicks: 0,
      jumpQueued: false,
      fireworkRocketDuration: 0,
      version,
      inventory: { slots: Object.assign([], { 7: leggings }) }
    }
    const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: true }
    Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
    expect(bot.entity.velocity.x).toBe(iceVelocity(f(f(f(0.3) + f(3 * f(0.15))) * f(0.98))))
  })

  it('1.21.11: slows to the sneaking_speed attribute', () => {
    const resource = require('minecraft-data')('1.21.11').attributesByName.sneakingSpeed.resource
    const x = firstTick('1.21.11', {
      floor: 'ice',
      yawDegrees: -90,
      controls: { forward: true, sneak: true },
      state: { shiftKeyDown: true, attributes: { [resource]: { value: 0.45, modifiers: [] } } }
    }).x
    // from 1.21.5 the 0.98F comes first (LocalPlayer.modifyInput)
    expect(x).toBe(iceVelocity(f(f(0.98) * f(0.45))))
  })
})
