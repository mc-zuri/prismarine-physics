// The input of a tick: the raw key state read from the control state, cooked into the move vector and the flags the
// movement and the input packet read.
//
// mineflayer's booleans (forward/back/left/right/jump/sneak/sprint) are the key levels; `control.raw` may carry any of
// the other key bits and the six jump / sneak edge bits, which are otherwise derived from the level changes since the
// previous tick. `control.analogMoveVector` is a stick (x = left, z = forward); `control.moveVector` an already cooked
// move (normalised, sneak scale applied) that bypasses the cook.
import { f } from '../math/float.ts'
import type { Control, CookedInput, Keys, RawKeys, XZ } from '../types.ts'

// The move scale while sneaking or crawling, before Swift Sneak.
export const SNEAK_INPUT_SCALE = f(0.30000001)
const SWIFT_SNEAK_STEP = f(0.15)
// The move a tick hands the travel is the cooked move damped by this.
export const TRAVEL_INPUT_DAMP = f(0.98)

// The key bits that are levels (held or not).
export const LEVEL_KEYS = ['up', 'down', 'left', 'right', 'jumpDown', 'sneakDown', 'sprintDown', 'ascend', 'descend',
  'changeHeight', 'wantUpSlow', 'wantDownSlow', 'ascendBlock', 'descendBlock', 'sneakToggleDown', 'upLeft', 'upRight',
  'downLeft', 'downRight'] as const
// The jump and sneak edge bits: pressed this tick, released this tick, held.
export const EDGE_KEYS = ['jumpPressed', 'jumpReleased', 'jumpCurrent', 'sneakPressed', 'sneakReleased', 'sneakCurrent'] as const

// Any jump-like key (jump, ascend, fly up slow, ascend block) and any sneak-like key (sneak, sneak toggle, descend,
// fly down slow, descend block): the edge bits follow these.
function jumpLevel (keys: RawKeys): boolean { return !!(keys.jumpDown || keys.ascend || keys.wantUpSlow || keys.ascendBlock) }
function sneakLevel (keys: RawKeys): boolean { return !!(keys.sneakDown || keys.sneakToggleDown || keys.descend || keys.wantDownSlow || keys.descendBlock) }

// The raw key state of this tick: the levels from the controls, the edges from the level changes unless supplied.
export function readKeys (control: Control, previous?: RawKeys): Keys {
  const raw = control.raw || {}
  const keys = {} as Keys
  for (const key of LEVEL_KEYS) keys[key] = !!raw[key]
  keys.up = keys.up || !!control.forward
  keys.down = keys.down || !!control.back
  keys.left = keys.left || !!control.left
  keys.right = keys.right || !!control.right
  keys.jumpDown = keys.jumpDown || !!control.jump
  keys.sneakDown = keys.sneakDown || !!control.sneak
  keys.sprintDown = keys.sprintDown || !!control.sprint
  const prev = previous || {}
  const jump = jumpLevel(keys)
  const sneak = sneakLevel(keys)
  const derived: Record<(typeof EDGE_KEYS)[number], boolean> = {
    jumpPressed: jump && !jumpLevel(prev),
    jumpReleased: !jump && jumpLevel(prev),
    jumpCurrent: jump,
    sneakPressed: sneak && !sneakLevel(prev),
    sneakReleased: !sneak && sneakLevel(prev),
    sneakCurrent: sneak
  }
  for (const key of EDGE_KEYS) keys[key] = typeof raw[key] === 'boolean' ? raw[key] : derived[key]
  return keys
}

// A vector normalised when longer than 1 (a zero-length one stays zero).
function clampToUnit (x: number, z: number): XZ {
  const lengthSq = f(f(z * z) + f(x * x))
  if (lengthSq > 1) {
    const length = f(Math.sqrt(lengthSq))
    return { x: f(x / length), z: f(z / length) }
  }
  return { x, z }
}

// The move direction, x = left, z = forward: the stick when it is off centre (clamped to unit length), else the eight
// direction keys (a diagonal adds to both of its cardinals) normalised.
export function direction (keys: RawKeys, analog?: XZ): XZ {
  if (analog && (analog.x !== 0 || analog.z !== 0)) return clampToUnit(f(analog.x), f(analog.z))
  let x = 0
  let z = 0
  if (keys.up) z += 1
  if (keys.down) z -= 1
  if (keys.left) x += 1
  if (keys.right) x -= 1
  if (keys.upLeft) { x += 1; z += 1 }
  if (keys.upRight) { x -= 1; z += 1 }
  if (keys.downLeft) { x += 1; z -= 1 }
  if (keys.downRight) { x -= 1; z -= 1 }
  if (x === 0 && z === 0) return { x: 0, z: 0 }
  const length = f(Math.sqrt(f(f(z * z) + f(x * x))))
  return { x: f(x / length), z: f(z / length) }
}

// What the sneak scale depends on.
export interface SneakPose {
  flying?: boolean | undefined
  wasInWater?: boolean | undefined
  swimming?: boolean | undefined
  sneaking?: boolean | undefined
  crawling?: boolean | undefined
  // the Swift Sneak level
  swiftSneak?: number | undefined
  // the sneak factor itself, when the caller has it
  sneakingFactor?: number | undefined
}

// The sneak scale: 0.3, raised by 0.15 per Swift Sneak level up to 1.
export function sneakFactor (pose: SneakPose): number {
  if (typeof pose.sneakingFactor === 'number') return f(pose.sneakingFactor)
  return pose.swiftSneak && pose.swiftSneak > 0 ? Math.min(f(f(pose.swiftSneak * SWIFT_SNEAK_STEP) + SNEAK_INPUT_SCALE), 1) : SNEAK_INPUT_SCALE
}

// The move scaled for sneaking: when the sneak key or descend is down, or the player already sneaks or crawls (so it
// holds for the tick the key is released), and never while flying, swimming or on the tick after being in water.
export function scaleMove (move: XZ, keys: RawKeys, pose: SneakPose): XZ {
  const wantsSlow = keys.sneakDown || keys.descend || !!pose.sneaking || !!pose.crawling
  const scale = !pose.flying && wantsSlow && !pose.wasInWater && !pose.swimming ? sneakFactor(pose) : 1
  return { x: f(move.x * scale), z: f(move.z * scale) }
}

// An already cooked move vector from the caller: normalised when longer than 1, otherwise as given.
function precookedMove (move: Partial<XZ>): XZ {
  let x = f(move.x || 0)
  let z = f(move.z || 0)
  const lengthSq = x * x + z * z
  if (lengthSq > 1) {
    const length = Math.sqrt(lengthSq)
    x = f(x / length)
    z = f(z / length)
  }
  return { x, z }
}

// The keys an input clear leaves: the sneak toggle, the slow fly keys and the six edge bits, and the sneak key where
// the client persists it.
const KEPT_BY_CLEAR = ['sneakToggleDown', 'wantDownSlow', 'wantUpSlow', ...EDGE_KEYS] as const

// A screen open: the input of the tick cleared as the client clears it. No move and no want up, want down or jumping;
// the sneaking and sprinting of the previous tick stand, as nothing decides them again.
function clearedInput (keys: Keys, persistSneak: boolean, inputMode: string, previous: CookedInput | undefined): CookedInput {
  const kept = {} as Keys
  for (const key of LEVEL_KEYS) kept[key] = false
  for (const key of KEPT_BY_CLEAR) kept[key] = keys[key]
  kept.sneakDown = persistSneak && keys.sneakDown
  const zero = { x: 0, z: 0 }
  return {
    keys: kept,
    move: zero,
    rawMove: zero,
    analog: zero,
    direction: zero,
    sprinting: !!previous?.sprinting,
    sneaking: !!previous?.sneaking,
    jumping: false,
    wantUp: false,
    wantDown: false,
    persistSneak,
    inputMode
  }
}

// One tick of input: the keys, the move vector (the packet's move_vector), the raw direction (raw_move_vector), the
// stick, and the derived flags. `previous` is the input of the tick before, which a screen's clear keeps flags from.
export function cook (control: Control, previousKeys: RawKeys | undefined, pose: SneakPose, previous?: CookedInput): CookedInput {
  const keys = readKeys(control, previousKeys)
  const persistSneak = !!control.persistSneak
  const inputMode = control.inputMode ?? 'mouse'
  if (control.screen) return clearedInput(keys, persistSneak, inputMode, previous)
  const stick = control.analogMoveVector
  const analog = stick ? { x: f(stick.x || 0), z: f(stick.z || 0) } : { x: 0, z: 0 }
  const rawMove = direction(keys, analog)
  const move = control.moveVector ? precookedMove(control.moveVector) : scaleMove(rawMove, keys, pose)
  return {
    keys,
    move,
    rawMove,
    analog,
    direction: rawMove,
    sprinting: keys.sprintDown,
    sneaking: keys.sneakDown || keys.descend,
    jumping: keys.jumpDown,
    wantUp: keys.jumpDown || keys.ascend,
    wantDown: keys.sneakDown || keys.descend,
    persistSneak,
    inputMode
  }
}

// Using an item (eating, drinking, drawing a bow) scales the move to 0.1225 (0.35 squared) -- the move the packet
// reports and the one the sprint decision reads.
export const USING_ITEM_MOVE = f(0.122499995)
export function usingItemMove (move: XZ): XZ {
  return { x: f(move.x * USING_ITEM_MOVE), z: f(move.z * USING_ITEM_MOVE) }
}

// The move the travel uses: the cooked move damped by 0.98.
export function travelInput (input: CookedInput): XZ {
  return { x: f(input.move.x * TRAVEL_INPUT_DAMP), z: f(input.move.z * TRAVEL_INPUT_DAMP) }
}
