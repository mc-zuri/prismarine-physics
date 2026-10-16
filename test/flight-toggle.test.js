/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LocalPlayer.aiStep: a player that may fly toggles flight on a second press of jump while jumpTriggerTime, set to 7 by
// the first press and counted down after the check (Player.aiStep), is not 0, so within 6 ticks; the flight's climb
// follows in the same tick. From 1.20.5 starting to fly on the ground also jumps.
// The player starts 0.05 over the floor (the block below y = 60), falling at 0.08: the first tick lands it.
function run (version, presses) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const b = new Block(mcData.blocksByName[pos.y < 60 ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 60.05, 0.5), velocity: new Vec3(0, -0.08, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, flying: false },
    game: { gameMode: 'creative' },
    abilities: { mayFly: true },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const physics = Physics(mcData, world)
  for (const jump of presses) {
    const controls = { forward: false, back: false, left: false, right: false, jump, sprint: false, sneak: false }
    physics.simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  }
  return bot.entity
}

describe('double-tapping jump toggles creative flight', () => {
  for (const version of ['1.8.8', '1.12.2', '1.16.5', '1.20.4', '1.20.6', '1.21.11', '26.1']) {
    const jumpsOnToggle = ['1.20.6', '1.21.11', '26.1'].includes(version)
    it(`${version}: a second press 2 ticks later starts flying${jumpsOnToggle ? ', jumping off the ground' : ''}`, () => {
      const entity = run(version, [true, false, true])
      expect(entity.flying).toBe(true)
      // the climb (3 times the flying speed) on the standing motion, or from 1.20.5 on the jump's (0.42)
      expect(entity.position.y).toBeCloseTo(60 + (jumpsOnToggle ? 0.42 : -0.0784000015258789) + Math.fround(0.05 * 3), 6)
    })
    it(`${version}: a second press 6 ticks later still toggles, 7 ticks later starts over`, () => {
      expect(run(version, [true, false, false, false, false, false, true]).flying).toBe(true)
      expect(run(version, [true, false, false, false, false, false, false, true]).flying).toBe(false)
    })
    it(`${version}: holding jump does not toggle`, () => {
      expect(run(version, [true, true, true]).flying).toBe(false)
    })
  }
})

// One tick per entry of `ticks` ({ jump, sneak, forward, sprint }), from `entity` (fields over a resting player at
// x = z = 0.5) in a world of stone below y = 59 and `fluid` (or air) from y = 59 to 63; `elytra` equips one. Returns
// the entity and the last tick's state.
function runFrom (version, { entity, gameMode = 'creative', fluid = 'air', elytra = false }, ticks) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const b = new Block(mcData.blocksByName[pos.y < 59 ? 'stone' : pos.y < 64 ? fluid : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 60, 0.5), velocity: new Vec3(0, 0, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, flying: false, ...entity },
    game: { gameMode },
    abilities: { mayFly: true },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const physics = Physics(mcData, world)
  let state
  for (const keys of ticks) {
    state = new PlayerState(bot, { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false, ...keys })
    state.elytraEquipped = elytra
    physics.simulatePlayer(state, world).apply(bot)
  }
  return { entity: bot.entity, state }
}

describe('flight toggle rules', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5', '1.21.11', '26.1']) {
    it(`${version}: a spectator that may fly starts flying at once`, () => {
      const { entity, state } = runFrom(version, { entity: { position: new Vec3(0.5, 70, 0.5) }, gameMode: 'spectator' }, [{}])
      expect(entity.flying).toBe(true)
      expect(state.flightToggled).toBe(true)
    })
    it(`${version}: the toggling tick reports the toggle`, () => {
      const { state } = runFrom(version, { entity: { position: new Vec3(0.5, 70, 0.5) } }, [{ jump: true }, {}, { jump: true }])
      expect(state.flightToggled).toBe(true)
    })

    // a swimmer (from 1.13, sprinting under water) does not toggle flight; before 1.13 nobody swims
    const swims = version !== '1.8.8' && version !== '1.12.2'
    it(`${version}: a double press under water ${swims ? 'while swimming does not toggle' : 'toggles'} flight`, () => {
      const keys = { forward: true, sprint: true }
      const { entity } = runFrom(version, {
        entity: { position: new Vec3(0.5, 60, 0.5), isInWater: true, isSprinting: true, isSwimming: true, eyeInWater: true, isUnderWater: true },
        fluid: 'water'
      }, [keys, { ...keys, jump: true }, keys, { ...keys, jump: true }])
      expect(entity.flying).toBe(!swims)
    })

    // turning flight off with a press of jump in the air, falling, with an elytra: up to 1.14 the same press asks to glide
    // (it falls); from 1.15 not on the tick flight was toggled
    if (version === '1.8.8') continue // no elytra
    const glides = ['1.12.2', '1.13.2', '1.14.4'].includes(version)
    it(`${version}: turning flight off ${glides ? 'asks to glide on the same press' : 'does not glide on that tick'}`, () => {
      const { entity, state } = runFrom(version, { entity: { position: new Vec3(0.5, 70, 0.5), flying: true }, elytra: true },
        [{ jump: true }, { sneak: true }, { jump: true }])
      expect(entity.flying).toBe(false)
      expect(state.flightToggled).toBe(true)
      expect(state.fallFlyingRequested).toBe(glides)
    })
  }
})
