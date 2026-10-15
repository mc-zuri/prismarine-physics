/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LocalPlayer.aiStep starts gliding when jump is pressed, not held from the tick before, in the air with an elytra on,
// not creative flying, not on a ladder, not in water, and from 1.16 not levitating (Player.tryToStartFallFlying). From
// 1.15 the client starts it at once; up to 1.14 it only asks the server (START_FALL_FLYING) while falling, and the
// server's entity data starts it later. Returns the player state after one tick.
function tickInAir (version, { jumpHeld = false, elytra = { name: 'elytra' }, levitation = false, onGround = false, flying = false, around = 'air', velY = -0.3 } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const b = new Block(mcData.blocksByName[pos.y < 60 ? 'stone' : pos.y === 100 ? around : 'air'].id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, onGround ? 60 : 100, 0.5),
      velocity: new Vec3(0, onGround ? 0 : velY, 0),
      onGround,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      flying,
      flyingSpeed: 0.05,
      wasJumping: jumpHeld,
      yaw: Math.PI,
      pitch: 0,
      effects: levitation ? { [mcData.effectsByName.Levitation.id]: { amplifier: 0, duration: 100 } } : {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: Object.assign([], { 6: elytra }) }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: true, sprint: false, sneak: false }
  return Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world)
}
const jumpInAir = (version, options) => tickInAir(version, options).elytraFlying

describe('starting to glide', () => {
  for (const version of ['1.15.2', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: starts when jump is pressed in the air with an elytra`, () => {
      expect(jumpInAir(version)).toBe(true)
    })
    it(`${version}: does not start with jump held, without an elytra or on the ground`, () => {
      expect(jumpInAir(version, { jumpHeld: true })).toBe(false)
      expect(jumpInAir(version, { elytra: null })).toBe(false)
      expect(jumpInAir(version, { onGround: true })).toBe(false)
    })
    it(`${version}: does not start creative flying, in water or on a ladder`, () => {
      expect(jumpInAir(version, { flying: true })).toBe(false)
      expect(jumpInAir(version, { around: 'water' })).toBe(false)
      expect(jumpInAir(version, { around: 'ladder' })).toBe(false)
    })
    it(`${version}: does not start with an elytra one use from breaking`, () => {
      const max = require('minecraft-data')(version).itemsByName.elytra.maxDurability
      expect(jumpInAir(version, { elytra: { name: 'elytra', maxDurability: max, durabilityUsed: max - 2 } })).toBe(true)
      expect(jumpInAir(version, { elytra: { name: 'elytra', maxDurability: max, durabilityUsed: max - 1 } })).toBe(false)
    })
  }

  it('up to 1.14 the client leaves the start to the server', () => {
    for (const version of ['1.9.4', '1.12.2', '1.14.4']) expect(jumpInAir(version)).toBe(false)
  })

  it('from 1.15 asks the server on the tick the glide starts', () => {
    for (const version of ['1.15.2', '1.21.11', '26.1']) {
      expect(tickInAir(version).fallFlyingRequested).toBe(true)
      expect(tickInAir(version, { jumpHeld: true }).fallFlyingRequested).toBe(false)
      expect(tickInAir(version, { around: 'water' }).fallFlyingRequested).toBe(false)
      expect(tickInAir(version, { velY: 0.1 }).fallFlyingRequested).toBe(true)
    }
  })

  it('up to 1.14 asks the server while falling with a usable elytra', () => {
    for (const version of ['1.9.4', '1.12.2', '1.14.4']) {
      const max = require('minecraft-data')(version).itemsByName.elytra.maxDurability
      expect(tickInAir(version).fallFlyingRequested).toBe(true)
      expect(tickInAir(version, { around: 'water' }).fallFlyingRequested).toBe(true)
      expect(tickInAir(version, { velY: 0.1 }).fallFlyingRequested).toBe(false)
      expect(tickInAir(version, { jumpHeld: true }).fallFlyingRequested).toBe(false)
      expect(tickInAir(version, { flying: true }).fallFlyingRequested).toBe(false)
      expect(tickInAir(version, { elytra: null }).fallFlyingRequested).toBe(false)
      expect(tickInAir(version, { elytra: { name: 'elytra', maxDurability: max, durabilityUsed: max - 1 } }).fallFlyingRequested).toBe(false)
    }
  })

  it('levitation keeps a glide from starting from 1.16', () => {
    expect(jumpInAir('1.15.2', { levitation: true })).toBe(true)
    expect(jumpInAir('1.16.5', { levitation: true })).toBe(false)
  })
})
