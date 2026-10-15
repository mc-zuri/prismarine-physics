/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LocalPlayer.aiStep's sprint logic: the sprint key or a double tap of forward starts a sprint, and releasing the
// sprint key does not stop it. A double tap is a second press of forward while sprintTriggerTime, set to 7 by the
// first and counted down at the start of every tick, is still above 0: within 6 ticks.
const VERSIONS = ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.20.4', '1.21.1', '1.21.4', '1.21.5', '1.21.11', '26.1']

// `water`: a block of water over the floor, so a player standing in it has its eyes above (shallow water); `state`:
// other entity fields as the tick before left them
function makePlayer (version, { airborne = false, food = 20, effects = {}, water = false, state = {}, usingItem = false } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const name = pos.y < 60 ? 'stone' : water && pos.y < 61 ? 'water' : 'air'
      const block = new Block(mcData.blocksByName[name].id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, airborne ? 200 : 60, 0.5),
      velocity: new Vec3(0, 0, 0),
      onGround: !airborne,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: Math.PI,
      pitch: 0,
      effects,
      ...state
    },
    food,
    usingHeldItem: usingItem,
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const physics = Physics(mcData, world)
  // runs one tick per entry of keys, returns whether the player sprints after the last
  bot.run = (...ticks) => {
    for (const keys of ticks) {
      const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false, ...keys }
      physics.simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
    }
    return bot.entity.isSprinting
  }
  return bot
}

const FORWARD = { forward: true }
const NONE = {}

describe('sprinting', () => {
  for (const version of VERSIONS) {
    describe(version, () => {
      it('starts with the sprint key and keeps going when the key is released', () => {
        const bot = makePlayer(version)
        expect(bot.run({ forward: true, sprint: true })).toBe(true)
        expect(bot.run(FORWARD, FORWARD)).toBe(true)
        expect(bot.run(NONE)).toBe(false)
      })

      it('starts with a second press of forward within 6 ticks', () => {
        expect(makePlayer(version).run(FORWARD, NONE, NONE, NONE, NONE, NONE, FORWARD)).toBe(true)
        expect(makePlayer(version).run(FORWARD, NONE, NONE, NONE, NONE, NONE, NONE, FORWARD)).toBe(false)
        expect(makePlayer(version).run(FORWARD, FORWARD)).toBe(false)
      })

      it('does not start when hungry or blind', () => {
        expect(makePlayer(version, { food: 6 }).run({ forward: true, sprint: true })).toBe(false)
        const blindness = require('minecraft-data')(version).effectsByName.Blindness.id
        expect(makePlayer(version, { effects: { [blindness]: { amplifier: 0, duration: 100 } } }).run({ forward: true, sprint: true })).toBe(false)
      })

      // before 1.21.5 a double tap needs the ground (or, from 1.13, eyes under water)
      const inAir = require('minecraft-data')(version).version['>=']('1.21.5')
      it(inAir ? 'starts with a double tap in the air' : 'needs the ground for a double tap', () => {
        expect(makePlayer(version, { airborne: true }).run(FORWARD, NONE, FORWARD)).toBe(inAir)
      })
    })
  }

  describe('version rules', () => {
    const SPRINT_KEY = { forward: true, sprint: true }

    it('item use keeps a sprint from starting', () => {
      for (const version of ['1.8.8', '1.20.4', '1.21.11']) expect(makePlayer(version, { usingItem: true }).run(SPRINT_KEY)).toBe(false)
    })

    it('from 1.13 shallow water keeps the sprint key from starting a sprint', () => {
      expect(makePlayer('1.12.2', { water: true }).run(SPRINT_KEY)).toBe(true)
      expect(makePlayer('1.13.2', { water: true }).run(SPRINT_KEY)).toBe(false)
    })

    it('from 1.16 sneaking between the taps resets the double tap', () => {
      const taps = [FORWARD, { sneak: true }, NONE, FORWARD]
      expect(makePlayer('1.14.4').run(...taps)).toBe(true)
      expect(makePlayer('1.16.5').run(...taps)).toBe(false)
    })

    it('from 1.19.4 elytra flight keeps a sprint from starting', () => {
      const gliding = { airborne: true, state: { elytraFlying: true } }
      expect(makePlayer('1.19.3', gliding).run(SPRINT_KEY)).toBe(true)
      expect(makePlayer('1.19.4', gliding).run(SPRINT_KEY)).toBe(false)
    })

    it('from 1.21.4 blindness stops a running sprint', () => {
      const blind = version => ({ state: { isSprinting: true }, effects: { [require('minecraft-data')(version).effectsByName.Blindness.id]: { amplifier: 0, duration: 100 } } })
      expect(makePlayer('1.21.3', blind('1.21.3')).run(FORWARD)).toBe(true)
      expect(makePlayer('1.21.4', blind('1.21.4')).run(FORWARD)).toBe(false)
    })

    it('from 1.21.5 the back key between the taps resets the double tap', () => {
      const taps = [FORWARD, { back: true }, FORWARD]
      expect(makePlayer('1.21.4').run(...taps)).toBe(true)
      expect(makePlayer('1.21.5').run(...taps)).toBe(false)
    })

    it('from 1.21.9 a flying player may sprint in shallow water', () => {
      const flyingInWater = { water: true, state: { flying: true, flyingSpeed: Math.fround(0.05) } }
      expect(makePlayer('1.21.8', flyingInWater).run(SPRINT_KEY)).toBe(false)
      expect(makePlayer('1.21.9', flyingInWater).run(SPRINT_KEY)).toBe(true)
    })

    it('in creative flight with sneak held the sprint logic sees the slowed input up to 1.14, not from 1.15', () => {
      const flying = { airborne: true, state: { flying: true, flyingSpeed: Math.fround(0.05), shiftKeyDown: true } }
      const keys = { forward: true, sprint: true, sneak: true }
      for (const version of ['1.8.8', '1.12.2', '1.14.4']) expect(makePlayer(version, flying).run(keys)).toBe(false)
      for (const version of ['1.16.5', '1.21.11']) expect(makePlayer(version, flying).run(keys)).toBe(true)
    })
  })
})
