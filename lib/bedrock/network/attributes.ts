// Attribute values: how modifiers fold into a value, and what a server update does to the value the client holds.
// The walking speed is an attribute value and the sprint boost a modifier on it, so "the server sent 0.1" and "the
// value now reads 0.1" can differ by a float32 step.
import { f } from '../math/float.ts'

// The attributes in their registration order. The index decides the MODE: the first six keep their own current
// value when nothing modifies them (mode 0), the rest fall back to the default (mode 1).
export const ATTRIBUTE_NAMES = [
  'minecraft:player.hunger',
  'minecraft:player.saturation',
  'minecraft:player.exhaustion',
  'minecraft:player.level',
  'minecraft:player.experience',
  'minecraft:health',
  'minecraft:follow_range',
  'minecraft:knockback_resistance',
  'minecraft:movement',
  'minecraft:underwater_movement',
  'minecraft:lava_movement',
  'minecraft:attack_damage',
  'minecraft:absorption',
  'minecraft:luck',
  'minecraft:horse.jump_strength',
  'minecraft:friction_modifier',
  'minecraft:bounciness',
  'minecraft:air_drag_modifier'
] as const

// The attributes movement reads.
export const MOVEMENT_ATTRIBUTE_NAMES = [
  'minecraft:movement',
  'minecraft:underwater_movement',
  'minecraft:lava_movement',
  'minecraft:horse.jump_strength',
  'minecraft:health',
  'minecraft:player.hunger',
  'minecraft:friction_modifier',
  'minecraft:bounciness',
  'minecraft:air_drag_modifier'
] as const

// A modifier's operation: add to the base, multiply the base, multiply the running total, or cap the value.
export const ModifierOperation = { add: 0, multiplyBase: 1, multiplyTotal: 2, cap: 3 } as const
// Which value a modifier touches.
export const ModifierOperand = { min: 0, max: 1, value: 2 } as const

// An attribute modifier: its identity (id, name), operation, operand and amount.
export interface Modifier {
  id?: string | undefined
  name?: string | undefined
  operation: number
  operand: number
  amount: number
}

// An attribute: its bounds, current value, defaults and modifiers.
export interface Attribute {
  name: string
  min: number
  max: number
  current: number
  defaultMin: number
  defaultMax: number
  defaultValue: number
  modifiers: Modifier[]
  buffs?: unknown[] | undefined
}

// An attribute's mode: 0 for the first six (their own value when nothing modifies them), 1 for the rest, and for an
// attribute registered after them (a name not listed).
export function attributeMode (name: string): number {
  const index = ATTRIBUTE_NAMES.indexOf(name as (typeof ATTRIBUTE_NAMES)[number])
  return index >= 0 && index <= 5 ? 0 : 1
}

// Whether movement reads the attribute.
export function isMovementAttribute (name: string): boolean {
  return (MOVEMENT_ATTRIBUTE_NAMES as readonly string[]).includes(name)
}

// Whether the attribute takes part in the test a correction is gated on (health and hunger do not).
export function participatesInDivergence (name: string): boolean {
  return isMovementAttribute(name) && name !== 'minecraft:health' && name !== 'minecraft:player.hunger'
}

// The value within bounds: a cap modifier (the lowest wins) beats the maximum and the minimum; the comparison is
// against the incoming value, so a value already below the cap is only raised to the minimum.
export function sanitizeAttribute (attribute: Pick<Attribute, 'max' | 'min' | 'modifiers'>, value: number): number {
  let cap = attribute.max
  for (const modifier of attribute.modifiers) if (modifier.operation === ModifierOperation.cap) cap = Math.min(modifier.amount, cap)
  return cap < value ? cap : Math.max(value, attribute.min)
}

// Whether a modifier's operand names a value it can touch (the minimum, the maximum or the value).
function inRange (modifier: Modifier): modifier is Modifier & { operand: 0 | 1 | 2 } { return modifier.operand >= 0 && modifier.operand < 3 }

// The attribute's value from its defaults and modifiers, in three passes that never interleave: every addition onto
// the defaults, then each base multiplication against those sums, then each total multiplication against the running
// value in list order. A computed value equal to the default is replaced by the current value when the list is not
// empty; an empty list keeps the current value in mode 0. Sets `min` / `max` and returns the value.
export function calculateAttribute (attribute: Attribute, mode = attributeMode(attribute.name)): number {
  const base: [number, number, number] = [f(attribute.defaultMin), f(attribute.defaultMax), f(attribute.defaultValue)]
  for (const modifier of attribute.modifiers) {
    if (modifier.operation === ModifierOperation.add && inRange(modifier)) base[modifier.operand] = f(base[modifier.operand] + modifier.amount)
  }
  const result: [number, number, number] = [...base]
  for (const modifier of attribute.modifiers) {
    if (modifier.operation === ModifierOperation.multiplyBase && inRange(modifier)) result[modifier.operand] = f(result[modifier.operand] + f(base[modifier.operand] * modifier.amount))
  }
  for (const modifier of attribute.modifiers) {
    if (modifier.operation === ModifierOperation.multiplyTotal && inRange(modifier)) result[modifier.operand] = f(f(modifier.amount + 1) * result[modifier.operand])
  }
  let value = result[2]
  const empty = attribute.modifiers.length === 0
  if ((value === attribute.defaultValue && !empty) || (empty && mode === 0)) value = attribute.current
  attribute.min = result[0]
  attribute.max = result[1]
  return sanitizeAttribute(attribute, value)
}

// A modifier's identity is its id (ignoring dashes and case), name, operation and operand -- not its amount.
function modifierIdentity (id: unknown): string { return String(id).split('-').join('').toLowerCase() }
// Whether two modifiers are the same one (their amounts may differ).
export function sameModifier (a: Modifier, b: Modifier): boolean {
  return modifierIdentity(a.id) === modifierIdentity(b.id) && a.name === b.name && a.operation === b.operation && a.operand === b.operand
}

// A server update of one attribute. The packet's modifiers are folded in first (one the attribute already carries is
// skipped, not replaced), each recomputing the value; the value then moves to the packet's by a float32 DELTA
// (current + (packet - current)), sanitised against the OLD bounds; the packet's bounds and defaults are installed and
// the value sanitised again.
export function updateAttribute (map: Map<string, Attribute>, packet: Attribute): Attribute {
  const previous = map.get(packet.name)
  const attribute: Attribute = previous
    ? { ...previous, modifiers: previous.modifiers.map(one => ({ ...one })), buffs: [] }
    : { ...packet, current: packet.defaultValue, modifiers: [], buffs: [] }
  if (attribute.modifiers.length) {
    attribute.modifiers = []
    attribute.current = calculateAttribute(attribute)
  }
  for (const incoming of packet.modifiers) {
    if (attribute.modifiers.some(one => sameModifier(one, incoming))) continue
    attribute.modifiers.push({ ...incoming })
    attribute.current = calculateAttribute(attribute)
  }
  if (attribute.current !== packet.current) {
    attribute.current = sanitizeAttribute(attribute, f(attribute.current + f(packet.current - attribute.current)))
  }
  attribute.min = packet.min
  attribute.max = packet.max
  attribute.defaultMin = packet.defaultMin
  attribute.defaultMax = packet.defaultMax
  attribute.defaultValue = packet.defaultValue
  attribute.current = sanitizeAttribute(attribute, attribute.current)
  map.set(attribute.name, attribute)
  return attribute
}

// The attribute modifiers mob effects carry, by effect id. Speed and slowness both multiply the running movement
// value. `flat` is the per-level amount where it differs from the modifier's.
export const EFFECT_MODIFIERS: Readonly<Record<number, Modifier & { attribute: string, flat?: number }>> = {
  1: { attribute: 'minecraft:movement', operation: 2, operand: 2, amount: 0.2, name: 'MovementSpeed' },
  2: { attribute: 'minecraft:movement', operation: 2, operand: 2, amount: -0.15, name: 'MovementSlowdown' },
  5: { attribute: 'minecraft:attack_damage', operation: 2, operand: 2, amount: 2.5, flat: 1.3, name: 'DamageBoost' },
  18: { attribute: 'minecraft:attack_damage', operation: 0, operand: 2, amount: 2, flat: -0.5, name: 'Weakness' },
  21: { attribute: 'minecraft:health', operation: 0, operand: 1, amount: 4, name: 'HealthBoost' }
}

// The modifier one effect instance contributes. The level is the amplifier plus one in int32 (so the top amplifier
// wraps negative).
export function effectModifier (effectId: number, amplifier: number): (Modifier & { attribute: string, flat?: number }) | null {
  const row = EFFECT_MODIFIERS[effectId]
  if (!row) return null
  const level = (amplifier + 1) | 0
  return { ...row, amount: f(f(row.flat === undefined ? row.amount : row.flat) * level) }
}
