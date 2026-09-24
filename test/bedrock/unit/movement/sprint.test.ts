import assert from 'node:assert'
import {
  hungerLimited, obstructed, sprintPermission, sprintTrigger, SPRINT_FORWARD_GATE, storePreviousInput, tickTriggerTimers,
  type SprintFacts
} from '../../../../lib/bedrock/movement/sprint.ts'
import { cook } from '../../../../lib/bedrock/movement/input.ts'
import type { BedrockState } from '../../../../lib/bedrock/types.ts'

const FORWARD = { x: 0, z: 1 }
const facts = (over: Partial<SprintFacts> = {}): SprintFacts => ({ move: FORWARD, sprintDown: true, onGround: true, pos: { x: 0, y: 0, z: 0 }, ...over })
const fresh = (over: BedrockState = {}): BedrockState => ({ actions: new Set(), ...over })

describe('bedrock movement/sprint', () => {
  it('allows a rider to sprint only from a controlling seat of a sprinting vehicle', () => {
    assert.deepStrictEqual(sprintPermission({ ride: { controlling: true, canSprint: true } }), { riding: true, allowed: true, hungerLimited: false })
    assert.deepStrictEqual(sprintPermission({ ride: { controlling: false, canSprint: true } }), { riding: true, allowed: false, hungerLimited: false })
  })

  it('limits the sprint at a hunger of 6 or below unless the player may fly', () => {
    assert.strictEqual(sprintPermission({ hunger: 6 }).hungerLimited, true)
    assert.strictEqual(sprintPermission({ hunger: 7 }).hungerLimited, false)
    assert.strictEqual(sprintPermission({ hunger: 2, mayFly: true }).hungerLimited, false)
    assert.strictEqual(sprintPermission({}).hungerLimited, true, 'a missing hunger reads 0')
    assert.strictEqual(sprintPermission({ hunger: NaN }).hungerLimited, false)
    assert.strictEqual(hungerLimited(undefined, false), false, 'an unknown food level is a full bar')
    assert.strictEqual(hungerLimited(3, false), true)
  })

  it('starts a sprint from the sprint key when moving forward', () => {
    const st = fresh()
    const request = sprintTrigger(st, facts())
    assert.deepStrictEqual(request, { isSprinting: true, stopSprinting: false, sprintCanceled: false, start: true, stop: false })
    assert.strictEqual(st.sprinting, true)
    assert.strictEqual(st.sprintingOnInput, true)
    assert.ok(st.actions!.has('startSprinting'))
  })

  it('does not start with an item in use, sideways, not allowed, hungry, blind or already sprinting', () => {
    const blocked: Array<[string, Partial<SprintFacts>, BedrockState?]> = [
      ['item', { usingItem: true }],
      ['sideways', { move: { x: 1, z: 0 } }],
      ['barely forward', { move: { x: 0, z: 0.7 } }],
      ['not allowed', { allowed: false }],
      ['hungry', { food: 2 }],
      ['hunger given', { hungerLimited: true }],
      ['blind', { blindness: true }]
    ]
    for (const [name, over] of blocked) {
      const st = fresh()
      assert.strictEqual(sprintTrigger(st, facts(over)).start, false, name)
      assert.ok(!st.sprinting, name)
    }
    const running = fresh({ sprinting: true })
    assert.strictEqual(sprintTrigger(running, facts()).start, false)
  })

  it('starts on the second forward press within the double-tap window', () => {
    const st = fresh()
    assert.strictEqual(sprintTrigger(st, facts({ sprintDown: false })).start, false, 'the first press opens the window')
    assert.strictEqual(st.sprintTriggerTime, 7)
    const request = sprintTrigger(st, facts({ sprintDown: false }))
    assert.strictEqual(request.start, true)
    assert.strictEqual(st.sprintingOnInput, false)
  })

  it('starts a double tap only on the ground, in water or flying, from a fresh press', () => {
    const inAir = fresh({ sprintTriggerTime: 5 })
    assert.strictEqual(sprintTrigger(inAir, facts({ sprintDown: false, onGround: false })).start, false)
    assert.strictEqual(sprintTrigger(fresh({ sprintTriggerTime: 5 }), facts({ sprintDown: false, onGround: false, wasInWater: true })).start, true)
    assert.strictEqual(sprintTrigger(fresh({ sprintTriggerTime: 5 }), facts({ sprintDown: false, onGround: false, flying: true })).start, true)
    assert.strictEqual(sprintTrigger(fresh({ sprintTriggerTime: 5, wasSneaking: true }), facts({ sprintDown: false })).start, false)
    assert.strictEqual(sprintTrigger(fresh({ sprintTriggerTime: 5, wasRunning: true }), facts({ sprintDown: false })).start, false)
  })

  it('keeps a sprint while moving forward, and stops it when the move turns', () => {
    const st = fresh({ sprinting: true })
    assert.deepStrictEqual(sprintTrigger(st, facts({ sprintDown: false })), { isSprinting: true, stopSprinting: false, sprintCanceled: false, start: false, stop: false })
    const turned = sprintTrigger(st, facts({ move: { x: 0.8, z: 0.6 } }))
    assert.strictEqual(turned.stop, true)
    assert.strictEqual(st.sprinting, false)
    assert.ok(st.actions!.has('stopSprinting'))
    assert.strictEqual(sprintTrigger(fresh({ sprinting: true }), facts({ move: { x: 0, z: -1 } })).stop, true, 'backwards')
    assert.strictEqual(sprintTrigger(fresh({ sprinting: true }), facts({ allowed: false })).stop, true)
  })

  it('stops a sprint that ran into a wall on its main axis', () => {
    const st = fresh({ sprinting: true, lastRequested: { x: 0, y: 0, z: 0.3 }, lastPos: { x: 0, y: 0, z: 5 } })
    assert.ok(obstructed(st, { x: 0, y: 0, z: 5 }))
    assert.strictEqual(sprintTrigger(st, facts({ pos: { x: 0, y: 0, z: 5 } })).stop, true)
    const sideways = { lastRequested: { x: 0.3, y: 0, z: 0 }, lastPos: { x: 2, y: 0, z: 0 } }
    assert.ok(obstructed(sideways, { x: 2, y: 0, z: 1 }))
    assert.ok(!obstructed(sideways, { x: 2.3, y: 0, z: 1 }))
    assert.ok(!obstructed({ lastRequested: { x: 0, y: 0, z: 0.3 }, lastPos: { x: 0, y: 0, z: 0 } }, { x: 0, y: 0, z: 0.3 }))
    assert.ok(!obstructed({}, { x: 1, y: 0, z: 1 }), 'no previous move')
  })

  it('stops a touch sprint when the sprint input drops', () => {
    const st = fresh({ sprinting: true, sprintingOnInput: true })
    const request = sprintTrigger(st, facts({ sprintDown: false, touch: true }))
    assert.deepStrictEqual([request.sprintCanceled, request.stopSprinting, request.stop], [true, true, true])
  })

  it('keeps a swimmer sprinting in water and stops it out of the water', () => {
    assert.strictEqual(sprintTrigger(fresh({ sprinting: true }), facts({ swimming: true, wasInWater: true, move: { x: 1, z: 0 } })).stop, false)
    assert.strictEqual(sprintTrigger(fresh({ sprinting: true }), facts({ swimming: true, wasInWater: false })).stop, true)
  })

  it('stops a sprint jumping in water, and a hungry one', () => {
    assert.strictEqual(sprintTrigger(fresh({ sprinting: true, jumpingFlag: true }), facts({ wasInWater: true })).stop, true)
    assert.strictEqual(sprintTrigger(fresh({ sprinting: true }), facts({ food: 1 })).stop, true)
  })

  it('works without an action set', () => {
    const st: BedrockState = {}
    sprintTrigger(st, facts())
    sprintTrigger(st, facts({ move: { x: 1, z: 0 } }))
    assert.strictEqual(st.sprinting, false)
  })

  it('runs the double-tap windows down, the sprint one stopping at zero', () => {
    const st: BedrockState = { sprintTriggerTime: 1 }
    tickTriggerTimers(st)
    tickTriggerTimers(st)
    assert.strictEqual(st.sprintTriggerTime, 0)
    assert.strictEqual(st.jumpTriggerTime, -2)
  })

  it('stores the input the next tick compares with', () => {
    const st: BedrockState = {}
    storePreviousInput(st, cook({ forward: true, jump: true, sneak: true, raw: { changeHeight: true } }, undefined, { flying: true }))
    assert.deepStrictEqual([st.wasJumping, st.wasChangeHeight, st.wasSneaking, st.wasRunning], [true, true, true, true])
    storePreviousInput(st, cook({ forward: true, sneak: true }, undefined, {}))
    assert.strictEqual(st.wasRunning, false, 'the sneak-scaled move is under the gate')
    assert.ok(SPRINT_FORWARD_GATE > 0.3)
  })
})
