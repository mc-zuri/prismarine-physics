import assert from 'node:assert'
import {
  creativeGlideBoost, flightLiftoffNudge, flyingDrag, flyingFrictionScale, flyingSpeed, FlyToggleKey, flyToggleApplied, flyTrigger, frictionAxis,
  glideTriggers, movementModifier, verticalFlightControl, type GlideFacts
} from '../../../../lib/bedrock/movement/flight.ts'
import { readKeys } from '../../../../lib/bedrock/movement/input.ts'
import type { BedrockState } from '../../../../lib/bedrock/types.ts'

const f = Math.fround
const JUMP = readKeys({ jump: true })
const CHANGE_HEIGHT = readKeys({ raw: { changeHeight: true } })
const NONE = readKeys({})

describe('bedrock movement/flight', () => {
  describe('the fly toggle', () => {
    it('toggles on a second jump press within the window', () => {
      const st: BedrockState = {}
      const actions = new Set<string>()
      assert.strictEqual(flyTrigger(st, JUMP, false, true, actions), false)
      assert.deepStrictEqual([st.jumpTriggerTime, st.flyTriggerSource], [7, FlyToggleKey.jump])
      assert.strictEqual(flyTrigger(st, JUMP, false, true, actions), true)
      assert.ok(actions.has('startFlying'))
      assert.strictEqual(flyTrigger({ jumpTriggerTime: 3, flyTriggerSource: FlyToggleKey.jump }, JUMP, true, true, actions), false)
      assert.ok(actions.has('stopFlying'))
    })

    it('toggles on change height too, and re-arms when the keys alternate', () => {
      const st: BedrockState = { jumpTriggerTime: 3, flyTriggerSource: FlyToggleKey.jump }
      assert.strictEqual(flyTrigger(st, CHANGE_HEIGHT, false, true, new Set()), false)
      assert.strictEqual(st.flyTriggerSource, FlyToggleKey.changeHeight)
      assert.strictEqual(flyTrigger(st, CHANGE_HEIGHT, false, true, new Set()), true)
    })

    it('needs a fresh press, an open window, and the permission to fly', () => {
      assert.strictEqual(flyTrigger({ wasJumping: true, jumpTriggerTime: 3, flyTriggerSource: 1 }, JUMP, false, true, new Set()), false)
      assert.strictEqual(flyTrigger({ wasChangeHeight: true }, CHANGE_HEIGHT, false, true, new Set()), false)
      assert.strictEqual(flyTrigger({}, NONE, false, true, new Set()), false)
      assert.strictEqual(flyTrigger({ jumpTriggerTime: 0, flyTriggerSource: 1 }, JUMP, false, true, new Set()), false)
      assert.strictEqual(flyTrigger({ jumpTriggerTime: 3, flyTriggerSource: 1 }, JUMP, false, false, new Set()), false)
      assert.strictEqual(flyTrigger({ jumpTriggerTime: 3, flyTriggerSource: 1 }, JUMP, false, true, new Set(), true), false, 'a passenger')
      assert.strictEqual(flyTrigger({ jumpTriggerTime: 3, flyTriggerSource: 1 }, JUMP, true, false, new Set()), false, 'a flyer can always stop')
    })

    it('closes the window once a toggle takes effect', () => {
      const st: BedrockState = { jumpTriggerTime: 5 }
      flyToggleApplied(st, new Set(['startFlying']), false)
      assert.strictEqual(st.jumpTriggerTime, 5, 'a start needs the permission')
      flyToggleApplied(st, new Set(['startFlying']), true)
      assert.strictEqual(st.jumpTriggerTime, 0)
      st.jumpTriggerTime = 5
      flyToggleApplied(st, new Set(['stopFlying']), false)
      assert.strictEqual(st.jumpTriggerTime, 0)
    })
  })

  describe('gliding', () => {
    const facts = (over: Partial<GlideFacts> = {}): GlideFacts => ({ jumping: true, elytra: true, onGround: false, wasInWater: false, flyIntent: false, instabuild: false, climbable: false, ...over })

    it('starts on a fresh jump press in the air with an elytra', () => {
      const st: BedrockState = {}
      const actions = new Set<string>()
      assert.strictEqual(glideTriggers(st, facts(), actions), true)
      assert.ok(actions.has('startGliding'))
      assert.deepStrictEqual([st.gliding, st.fallFlyTicks], [true, 1])
    })

    it('does not start without a fresh press in the air, an elytra, or while flying', () => {
      for (const over of [{ jumping: false }, { elytra: false }, { onGround: true }, { flyIntent: true }]) {
        assert.strictEqual(glideTriggers({}, facts(over), new Set()), false)
      }
      assert.strictEqual(glideTriggers({ wasJumping: true }, facts(), new Set()), false)
    })

    it('stops on landing, without an elytra, in water, flying, on a climbable, or a late jump in survival', () => {
      const stops: Array<Partial<GlideFacts>> = [{ onGround: true }, { elytra: false }, { wasInWater: true }, { flyIntent: true }, { climbable: true }]
      for (const over of stops) {
        const st: BedrockState = { gliding: true, fallFlyTicks: 3, wasJumping: true }
        const actions = new Set<string>()
        assert.strictEqual(glideTriggers(st, facts(over), actions), false)
        assert.deepStrictEqual([actions.has('stopGliding'), st.gliding, st.fallFlyTicks], [true, false, 0])
      }
      assert.strictEqual(glideTriggers({ gliding: true, fallFlyTicks: 11 }, facts(), new Set()), false)
    })

    it('keeps gliding through an early jump, a held jump, or any jump in creative', () => {
      const st: BedrockState = { gliding: true, fallFlyTicks: 4 }
      assert.strictEqual(glideTriggers(st, facts(), new Set()), true)
      assert.strictEqual(st.fallFlyTicks, 5)
      assert.strictEqual(glideTriggers({ gliding: true, fallFlyTicks: 20, wasJumping: true }, facts(), new Set()), true)
      assert.strictEqual(glideTriggers({ gliding: true, fallFlyTicks: 20 }, facts({ instabuild: true }), new Set()), true)
      assert.strictEqual(glideTriggers({ gliding: true }, facts({ jumping: false }), new Set()), true)
    })
  })

  describe('vertical fly controls', () => {
    const still = { x: 0, z: 0 }
    const moving = { x: 0, z: 1 }
    const facts = (over = {}) => ({ stick: moving, creative: true, up: false, down: false, upSlow: false, downSlow: false, speed: 1, ...over })

    it('hovers with the stick at rest: 0.375 friction and damping in creative, 0.75 friction in survival', () => {
      assert.deepStrictEqual(verticalFlightControl(0.4, facts({ stick: still })), { y: f(f(0.4 * f(0.375))), override: f(0.375) })
      assert.deepStrictEqual(verticalFlightControl(0.4, facts({ stick: still, creative: false })), { y: f(0.4), override: f(0.75) })
      assert.deepStrictEqual(verticalFlightControl(0.4, facts({ stick: { x: 0.005, z: -0.009 } })).override, f(0.375))
      assert.deepStrictEqual(verticalFlightControl(0.4, facts({ stick: { x: 0.5, z: 0 } })).override, undefined)
    })

    it('does not damp a creative hover with vertical input', () => {
      for (const key of ['up', 'down', 'upSlow', 'downSlow']) {
        const out = verticalFlightControl(0.4, facts({ stick: still, [key]: true }))
        assert.strictEqual(out.override, f(0.375))
        assert.notStrictEqual(out.y, f(0.4 * f(0.375)), key)
      }
    })

    it('sums the vertical keys into an impulse scaled by the fly speed', () => {
      assert.strictEqual(verticalFlightControl(0, facts({ up: true })).y, f(0.15000001))
      assert.strictEqual(verticalFlightControl(0, facts({ down: true, speed: 2 })).y, f(2 * f(-0.22)))
      assert.strictEqual(verticalFlightControl(0.1, facts({ upSlow: true })).y, f(f(0.050000001) + f(0.1)))
      assert.strictEqual(verticalFlightControl(0, facts({ downSlow: true })).y, f(-0.15000001))
      assert.deepStrictEqual(verticalFlightControl(0.3, facts({ up: true, down: true })), { y: 0, override: undefined })
      assert.strictEqual(verticalFlightControl(0.3, facts()).y, f(0.3))
    })
  })

  it('doubles the fly speed while sprinting', () => {
    assert.strictEqual(flyingSpeed(0.05, false), f(0.05))
    assert.strictEqual(flyingSpeed(0.05, true), f(0.1))
  })

  it('nudges a zero vertical velocity to the smallest float32', () => {
    assert.strictEqual(flightLiftoffNudge(0), 1.401298464324817e-45)
    assert.strictEqual(flightLiftoffNudge(-0), 1.401298464324817e-45)
    assert.strictEqual(flightLiftoffNudge(0.1), 0.1)
    assert.ok(Number.isNaN(flightLiftoffNudge(NaN)))
  })

  it('applies a modifier in either mode', () => {
    assert.strictEqual(movementModifier(0.6, 0.5, 0), f(0.3))
    assert.strictEqual(movementModifier(0.6, 0, 1), 1)
    assert.strictEqual(movementModifier(0.6, 1, 1), f(0.6))
    assert.strictEqual(movementModifier(0.6, 5, 1), 0, 'takes more than all of it')
    assert.strictEqual(movementModifier(0.6, -1, 1), 1, 'a negative take is none')
    assert.strictEqual(movementModifier(0.6, 1, 7), 1)
  })

  it('scales a flyer axis, flushing tiny components', () => {
    assert.strictEqual(frictionAxis(1, 0.5), 0.5)
    assert.ok(Object.is(frictionAxis(-1e-9, 0.5), -0))
    assert.ok(Number.isNaN(frictionAxis(NaN, 0.5)))
  })

  it('scales a flyer by the travel friction through the override, the legacy modifier or the air drag', () => {
    assert.strictEqual(flyingFrictionScale(1), f(f(0.91) * 1))
    assert.strictEqual(flyingFrictionScale(0.6), f(f(0.91) * f(0.6)))
    assert.strictEqual(flyingFrictionScale(1, { override: 0.375 }), f(f(0.91) * f(0.375)))
    assert.strictEqual(flyingFrictionScale(1, { legacy: true, frictionModifier: 0.5 }), f(f(0.91) * f(0.5)))
    assert.strictEqual(flyingFrictionScale(1, { airDrag: 0 }), 1)
  })

  it('keeps 0.6 of a flyer vertical velocity', () => {
    assert.strictEqual(flyingDrag(1), f(0.6))
    assert.strictEqual(flyingDrag(1, 0), 1)
  })

  it('lifts a creative glider holding jump after 10 ticks of gliding by 0.1, zeroing a -0 on the sides', () => {
    const facts = { gliding: true, jumping: true, instabuild: true, glideTicks: 11 }
    const vel = { x: -0, y: -0.5, z: 0.3 }
    creativeGlideBoost(vel, facts)
    assert.ok(Object.is(vel.x, 0))
    assert.deepStrictEqual([vel.y, vel.z], [f(-0.5 + f(0.1)), f(0.3)])
    for (const over of [{ gliding: false }, { jumping: false }, { instabuild: false }, { glideTicks: 10 }]) {
      const still = { x: 0, y: -0.5, z: 0 }
      creativeGlideBoost(still, { ...facts, ...over })
      assert.strictEqual(still.y, -0.5)
    }
  })
})
