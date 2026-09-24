import assert from 'node:assert'
import { attributeMode, calculateAttribute, effectModifier, isMovementAttribute, participatesInDivergence, sameModifier, sanitizeAttribute, updateAttribute, type Attribute } from '../../../../lib/bedrock/network/attributes.ts'

describe('bedrock network/attributes', () => {
  it('keeps its own value unmodified for the first six attributes (mode 0), falls back to the default for the rest', () => {
    assert.strictEqual(attributeMode('minecraft:player.hunger'), 0)
    assert.strictEqual(attributeMode('minecraft:health'), 0)
    assert.strictEqual(attributeMode('minecraft:movement'), 1)
    // one registered after them
    assert.strictEqual(attributeMode('minecraft:unknown'), 1)
  })

  it('knows the attributes movement reads, and which take part in the correction test', () => {
    assert.ok(isMovementAttribute('minecraft:movement'))
    assert.ok(!isMovementAttribute('minecraft:luck'))
    assert.ok(participatesInDivergence('minecraft:movement'))
    assert.ok(!participatesInDivergence('minecraft:health'))
    assert.ok(!participatesInDivergence('minecraft:player.hunger'))
    assert.ok(!participatesInDivergence('minecraft:luck'))
  })

  it('caps a value by the lowest cap modifier, and floors it at the minimum', () => {
    const attribute = { min: 0, max: 10, modifiers: [{ operation: 3, operand: 2, amount: 5 }, { operation: 3, operand: 2, amount: 7 }] }
    assert.strictEqual(sanitizeAttribute(attribute, 8), 5)
    assert.strictEqual(sanitizeAttribute(attribute, -1), 0)
    assert.strictEqual(sanitizeAttribute({ min: 2, max: 10, modifiers: [] }, 11), 10)
  })

  it('creates an attribute from a first packet, and keeps a value the packet agrees with', () => {
    const map = new Map<string, Attribute>()
    const packet: Attribute = { name: 'minecraft:movement', min: 0, max: 100, current: 0.1, defaultMin: 0, defaultMax: 100, defaultValue: 0.1, modifiers: [] }
    const first = updateAttribute(map, packet)
    assert.strictEqual(first.current, 0.1)
    assert.strictEqual(map.get('minecraft:movement'), first)
    assert.strictEqual(updateAttribute(map, packet).current, 0.1)
  })

  it('gives the modifier of an effect level, with the per-level amount where it differs', () => {
    assert.strictEqual(effectModifier(1, 1)!.amount, Math.fround(0.4))
    assert.strictEqual(effectModifier(5, 0)!.amount, Math.fround(1.3))
    assert.strictEqual(effectModifier(99, 0), null)
  })
  const movement = (over: Partial<Attribute> = {}): Attribute =>
    ({ name: 'minecraft:movement', min: 0, max: 100, current: 0.5, defaultMin: 0, defaultMax: 100, defaultValue: 0.5, modifiers: [], ...over })

  it('adds onto the defaults, then multiplies the base, then the running total, ignoring an operand out of range', () => {
    const attribute = movement({
      modifiers: [
        { operation: 2, operand: 2, amount: 0.5 },
        { operation: 1, operand: 2, amount: 1 },
        { operation: 0, operand: 2, amount: 0.25 },
        { operation: 0, operand: 1, amount: 10 },
        { operation: 0, operand: 3, amount: 99 },
        { operation: 1, operand: -1, amount: 99 },
        { operation: 2, operand: 3, amount: 99 }
      ]
    })
    // (0.5 + 0.25) = 0.75; + 0.75 * 1 = 1.5; * 1.5 = 2.25
    assert.strictEqual(calculateAttribute(attribute), 2.25)
    assert.strictEqual(attribute.max, 110)
    assert.strictEqual(attribute.min, 0)
  })

  it('keeps the current value when the modifiers leave the default, or when none modify a mode 0 attribute', () => {
    assert.strictEqual(calculateAttribute(movement({ current: 0.75, modifiers: [{ operation: 3, operand: 2, amount: 1 }] })), 0.75)
    assert.strictEqual(calculateAttribute(movement({ current: 0.75 })), 0.5)
    assert.strictEqual(calculateAttribute(movement({ name: 'minecraft:health', current: 7 })), 7)
  })

  it('tells a modifier by its id (dashes and case ignored), name, operation and operand, not its amount', () => {
    const one = { id: 'AB-cd', name: 'Speed', operation: 2, operand: 2, amount: 0.2 }
    assert.ok(sameModifier(one, { ...one, id: 'abcd', amount: 0.4 }))
    assert.ok(!sameModifier(one, { ...one, operand: 1 }))
    assert.ok(!sameModifier(one, { ...one, name: 'Slow' }))
  })

  it('refolds the packet modifiers over a held attribute, skips a repeated one, and moves the value by a float32 delta', () => {
    const speed = { id: 'speed', name: 'Speed', operation: 2, operand: 2, amount: 0.5 }
    const map = new Map<string, Attribute>([['minecraft:movement', movement({ current: 0.75, modifiers: [{ ...speed }] })]])
    const agreed = updateAttribute(map, movement({ current: 0.75, modifiers: [speed, { ...speed, amount: 1 }] }))
    assert.strictEqual(agreed.current, 0.75)
    assert.deepStrictEqual(agreed.modifiers, [speed])
    const moved = updateAttribute(map, movement({ current: 0.8, modifiers: [speed] }))
    assert.strictEqual(moved.current, Math.fround(0.75 + Math.fround(0.8 - 0.75)))
  })
})
