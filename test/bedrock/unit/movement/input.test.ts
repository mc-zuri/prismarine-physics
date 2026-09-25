import assert from 'node:assert'
import { cook, direction, readKeys, scaleMove, sneakFactor, SNEAK_INPUT_SCALE, travelInput } from '../../../../lib/bedrock/movement/input.ts'

const f = Math.fround
const DIAGONAL = f(1 / Math.SQRT2)

describe('bedrock movement/input', () => {
  it('reads the key levels from the controls and the raw bits', () => {
    const keys = readKeys({ forward: true, sneak: true, raw: { ascend: true, upLeft: true } })
    assert.strictEqual(keys.up, true)
    assert.strictEqual(keys.sneakDown, true)
    assert.strictEqual(keys.ascend, true)
    assert.strictEqual(keys.upLeft, true)
    assert.strictEqual(keys.down, false)
    assert.strictEqual(readKeys({ back: true, left: true, right: true, jump: true, sprint: true }).sprintDown, true)
  })

  it('derives the jump and sneak edges from the level changes', () => {
    const pressed = readKeys({ jump: true, sneak: true }, {})
    assert.deepStrictEqual([pressed.jumpPressed, pressed.jumpReleased, pressed.jumpCurrent], [true, false, true])
    assert.deepStrictEqual([pressed.sneakPressed, pressed.sneakReleased, pressed.sneakCurrent], [true, false, true])
    const held = readKeys({ jump: true }, pressed)
    assert.deepStrictEqual([held.jumpPressed, held.jumpCurrent, held.sneakReleased], [false, true, true])
    const released = readKeys({}, held)
    assert.deepStrictEqual([released.jumpReleased, released.jumpCurrent], [true, false])
    assert.strictEqual(readKeys({ raw: { wantUpSlow: true } }).jumpPressed, true, 'any jump-like key')
    assert.strictEqual(readKeys({ raw: { descendBlock: true } }).sneakPressed, true, 'any sneak-like key')
  })

  it('takes the edges given in the raw bits over the derived ones', () => {
    const keys = readKeys({ jump: true, raw: { jumpPressed: false, sneakCurrent: true } }, {})
    assert.strictEqual(keys.jumpPressed, false)
    assert.strictEqual(keys.sneakCurrent, true)
  })

  it('normalises the direction keys, a diagonal adding to both cardinals', () => {
    assert.deepStrictEqual(direction({ up: true }), { x: 0, z: 1 })
    assert.deepStrictEqual(direction({ down: true, right: true }), { x: -DIAGONAL, z: -DIAGONAL })
    assert.deepStrictEqual(direction({ left: true }), { x: 1, z: 0 })
    assert.deepStrictEqual(direction({ upLeft: true }), { x: DIAGONAL, z: DIAGONAL })
    assert.deepStrictEqual(direction({ upRight: true }), { x: -DIAGONAL, z: DIAGONAL })
    assert.deepStrictEqual(direction({ downLeft: true }), { x: DIAGONAL, z: -DIAGONAL })
    assert.deepStrictEqual(direction({ downRight: true }), { x: -DIAGONAL, z: -DIAGONAL })
    assert.deepStrictEqual(direction({ up: true, upLeft: true }), { x: f(1 / Math.sqrt(5)), z: f(2 / Math.sqrt(5)) })
    assert.deepStrictEqual(direction({ up: true, down: true }), { x: 0, z: 0 })
    assert.deepStrictEqual(direction({}), { x: 0, z: 0 })
  })

  it('takes an off-centre stick, clamped to unit length', () => {
    assert.deepStrictEqual(direction({ up: true }, { x: 0.3, z: 0.4 }), { x: f(0.3), z: f(0.4) })
    assert.deepStrictEqual(direction({}, { x: 3, z: 4 }), { x: f(0.6), z: f(0.8) })
    assert.deepStrictEqual(direction({ up: true }, { x: 0, z: 0 }), { x: 0, z: 1 }, 'a centred stick is ignored')
  })

  it('scales a sneaking move by 0.3, raised by Swift Sneak', () => {
    assert.strictEqual(sneakFactor({}), SNEAK_INPUT_SCALE)
    assert.strictEqual(sneakFactor({ swiftSneak: 2 }), f(f(2 * f(0.15)) + SNEAK_INPUT_SCALE))
    assert.strictEqual(sneakFactor({ swiftSneak: 9 }), 1)
    assert.strictEqual(sneakFactor({ sneakingFactor: 0.45 }), f(0.45))
    const move = { x: 0, z: 1 }
    assert.deepStrictEqual(scaleMove(move, { sneakDown: true }, {}), { x: 0, z: SNEAK_INPUT_SCALE })
    assert.deepStrictEqual(scaleMove(move, { descend: true }, {}), { x: 0, z: SNEAK_INPUT_SCALE })
    assert.deepStrictEqual(scaleMove(move, {}, { sneaking: true }), { x: 0, z: SNEAK_INPUT_SCALE })
    assert.deepStrictEqual(scaleMove(move, {}, { crawling: true }), { x: 0, z: SNEAK_INPUT_SCALE })
  })

  it('does not scale while flying, swimming, just out of water, or not sneaking', () => {
    const move = { x: 0, z: 1 }
    for (const pose of [{ flying: true }, { swimming: true }, { wasInWater: true }]) {
      assert.deepStrictEqual(scaleMove(move, { sneakDown: true }, pose), move)
    }
    assert.deepStrictEqual(scaleMove(move, {}, {}), move)
  })

  it('cooks the input: keys, move, raw direction, stick and derived flags', () => {
    const input = cook({ forward: true, sneak: true, jump: true, sprint: true }, undefined, {})
    assert.deepStrictEqual(input.move, { x: 0, z: SNEAK_INPUT_SCALE })
    assert.deepStrictEqual(input.rawMove, { x: 0, z: 1 })
    assert.strictEqual(input.direction, input.rawMove)
    assert.deepStrictEqual(input.analog, { x: 0, z: 0 })
    assert.deepStrictEqual([input.sprinting, input.sneaking, input.jumping, input.wantUp, input.wantDown], [true, true, true, true, true])
    const descend = cook({ raw: { ascend: true, descend: true } }, undefined, {})
    assert.deepStrictEqual([descend.sneaking, descend.jumping, descend.wantUp, descend.wantDown], [true, false, true, true])
  })

  it('takes a stick from the control state, missing axes as zero', () => {
    assert.deepStrictEqual(cook({ analogMoveVector: { x: 0.5 } }, undefined, {}).analog, { x: 0.5, z: 0 })
    assert.deepStrictEqual(cook({ analogMoveVector: { z: 0.5 } }, undefined, {}).rawMove, { x: 0, z: 0.5 })
  })

  it('takes an already cooked move as given, normalised when longer than 1', () => {
    assert.deepStrictEqual(cook({ moveVector: { x: 0.1, z: 0.2 }, sneak: true }, undefined, {}).move, { x: f(0.1), z: f(0.2) })
    assert.deepStrictEqual(cook({ moveVector: { x: 3, z: 4 } }, undefined, {}).move, { x: f(0.6), z: f(0.8) })
    assert.deepStrictEqual(cook({ moveVector: {} }, undefined, {}).move, { x: 0, z: 0 })
  })

  it('clears the input while a screen is open, keeping the persisted sneak and the previous sneaking and sprinting', () => {
    const before = cook({ forward: true, sneak: true, sprint: true }, undefined, {})
    const control = { forward: true, jump: true, sneak: true, analogMoveVector: { x: 1 }, raw: { sneakToggleDown: true, wantUpSlow: true } }
    const held = cook({ ...control, screen: true, persistSneak: true }, before.keys, {}, before)
    assert.deepStrictEqual([held.move, held.rawMove, held.analog], [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }])
    assert.deepStrictEqual([held.sprinting, held.sneaking, held.jumping, held.wantUp, held.wantDown, held.persistSneak], [true, true, false, false, false, true])
    assert.deepStrictEqual([held.keys.up, held.keys.jumpDown, held.keys.sneakDown, held.keys.sneakToggleDown, held.keys.wantUpSlow, held.keys.jumpPressed], [false, false, true, true, true, true])
    const dropped = cook({ ...control, screen: true }, before.keys, {})
    assert.deepStrictEqual([dropped.keys.sneakDown, dropped.sneaking, dropped.sprinting, dropped.persistSneak], [false, false, false, false])
    assert.deepStrictEqual([before.inputMode, cook({ inputMode: 'game_pad', screen: true }, undefined, {}).inputMode], ['mouse', 'game_pad'])
  })

  it('damps the move for the travel by 0.98', () => {
    const input = cook({ forward: true, left: true }, undefined, {})
    assert.deepStrictEqual(travelInput(input), { x: f(DIAGONAL * f(0.98)), z: f(DIAGONAL * f(0.98)) })
  })
})
