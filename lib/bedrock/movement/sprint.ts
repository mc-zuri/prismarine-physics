// Sprinting: when a sprint starts and stops, what may sprint, and the input the next tick's triggers compare with.
import { f } from '../math/float.ts'
import type { BedrockState, CookedInput, Vec3Like, XZ } from '../types.ts'

// The move's forward component a sprint needs (float32: an exact diagonal passes).
export const SPRINT_FORWARD_GATE = f(0.70710677)
const POSITION_EPSILON = f(0.000049999999)
// The double-tap window, in ticks.
const DOUBLE_TAP_TICKS = 7
const HUNGER_LIMIT = 6

// The facts of the tick the sprint decision reads.
export interface SprintFacts {
  move: XZ
  sprintDown: boolean
  usingItem?: boolean | undefined
  blindness?: boolean | undefined
  food?: number | undefined
  mayFly?: boolean | undefined
  onGround?: boolean | undefined
  wasInWater?: boolean | undefined
  flying?: boolean | undefined
  swimming?: boolean | undefined
  pos: Vec3Like
  // a touch client stops a sprint started from the input when the input drops
  touch?: boolean | undefined
  // false for a rider whose vehicle cannot sprint (on foot the sprint is always allowed)
  allowed?: boolean | undefined
  // overrides the hunger limit derived from food and mayFly
  hungerLimited?: boolean | undefined
}

// The sprint decision: sprinting after it, a stop requested, a touch cancel, and the start / stop actions raised.
export interface SprintRequest {
  isSprinting: boolean
  stopSprinting: boolean
  sprintCanceled: boolean
  start: boolean
  stop: boolean
}

// What may sprint. A rider may only from a controlling seat of a vehicle that can sprint, and is never limited by
// hunger; on foot the sprint is always allowed and limited at a hunger of 6 or below (a missing hunger reads 0, NaN is
// not limited) unless the player may fly.
export function sprintPermission ({ hunger, mayFly, ride = null }: { hunger?: number | undefined, mayFly?: boolean | undefined, ride?: { controlling?: boolean, canSprint?: boolean } | null }): { riding: boolean, allowed: boolean, hungerLimited: boolean } {
  if (ride) return { riding: true, allowed: !!(ride.controlling && ride.canSprint), hungerLimited: false }
  return { riding: false, allowed: true, hungerLimited: f(HUNGER_LIMIT) >= f(hunger === undefined ? 0 : hunger) && !mayFly }
}

// The hunger limit for a caller that may not know the food level: unknown is a full bar.
export function hungerLimited (food: number | undefined, mayFly: boolean | undefined): boolean {
  return sprintPermission({ hunger: typeof food === 'number' ? food : 20, mayFly }).hungerLimited
}

// Whether a sprint may start this tick: forward enough, allowed, not hungry, not already sprinting, not using an item,
// not blind. It starts from the sprint key, or from a second forward press within the double-tap window while on the
// ground, in water or flying; a first press opens the window instead.
function tryStart (st: BedrockState, facts: SprintFacts, allowed: boolean, limited: boolean): { started: boolean, onInput: boolean } {
  const no = { started: false, onInput: false }
  if (facts.usingItem || !(facts.move.z >= SPRINT_FORWARD_GATE) || !allowed || limited || st.sprinting || facts.blindness) return no
  if (facts.sprintDown) return { started: true, onInput: true }
  if (!facts.onGround && !facts.wasInWater && !facts.flying) return no
  if (st.wasSneaking || st.wasRunning) return no
  if (!(st.sprintTriggerTime! > 0)) {
    st.sprintTriggerTime = DOUBLE_TAP_TICKS
    return no
  }
  return { started: true, onInput: false }
}

// Whether the previous move's dominant axis did not advance the position: the player runs into a wall.
export function obstructed (st: BedrockState, pos: Vec3Like): boolean {
  const last = st.lastRequested || { x: 0, z: 0 }
  const lastPos = st.lastPos || pos
  const absX = Math.abs(last.x)
  const absZ = Math.abs(last.z)
  if (absZ > absX && Math.abs(f(pos.z - lastPos.z)) < POSITION_EPSILON) return true
  return absX > absZ && Math.abs(f(pos.x - lastPos.x)) < POSITION_EPSILON
}

// Whether the move still holds a sprint: long enough, forward, not too sideways, and allowed.
function stillForward (move: XZ, allowed: boolean): boolean {
  return f(Math.sqrt(f(f(move.x * move.x) + f(move.z * move.z)))) >= SPRINT_FORWARD_GATE && move.z > 0 &&
    Math.abs(move.x) <= SPRINT_FORWARD_GATE && allowed
}

// The sprint decision of the tick. Applies it to `st.sprinting` (a start and a stop on the same tick leave it off),
// records the start / stop actions, and returns the request the swim trigger reads.
export function sprintTrigger (st: BedrockState, facts: SprintFacts): SprintRequest {
  const limited = typeof facts.hungerLimited === 'boolean' ? facts.hungerLimited : hungerLimited(facts.food, facts.mayFly)
  const allowed = facts.allowed !== false
  const wasSprinting = !!st.sprinting
  const request: SprintRequest = { isSprinting: wasSprinting, stopSprinting: false, sprintCanceled: false, start: false, stop: false }
  const { started, onInput } = tryStart(st, facts, allowed, limited)
  if (started) {
    st.sprintingOnInput = onInput
    request.isSprinting = true
    request.start = true
    if (st.actions) st.actions.add('startSprinting')
  }
  if (!started && !wasSprinting) return request

  request.sprintCanceled = !!st.sprintingOnInput && !facts.sprintDown && !!facts.touch
  request.stopSprinting = !stillForward(facts.move, allowed) || obstructed(st, facts.pos) || request.sprintCanceled

  let stop: boolean
  if (facts.swimming) stop = !facts.wasInWater
  else if (facts.wasInWater && st.jumpingFlag) stop = true
  else stop = request.stopSprinting || limited
  if (stop) {
    st.sprintingOnInput = false
    request.stop = true
    if (st.actions) st.actions.add('stopSprinting')
  }
  if (request.start) st.sprinting = true
  if (request.stop) st.sprinting = false
  return request
}

// The double-tap windows run down: the sprint's stops at zero, the fly toggle's does not.
export function tickTriggerTimers (st: BedrockState): void {
  if (st.sprintTriggerTime! > 0) st.sprintTriggerTime!--
  st.jumpTriggerTime = (st.jumpTriggerTime || 0) - 1
}

// What the next tick's triggers see as the previous input.
export function storePreviousInput (st: BedrockState, input: CookedInput): void {
  st.wasJumping = input.jumping
  st.wasChangeHeight = input.keys.changeHeight
  st.wasSneaking = input.sneaking
  st.wasRunning = input.move.z >= SPRINT_FORWARD_GATE
}
