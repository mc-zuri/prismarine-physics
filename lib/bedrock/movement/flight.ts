// Creative flight and elytra gliding: the double-tap fly toggle, the glide start / stop, the vertical fly controls,
// and the flying speed, drag and friction.
import { f, FLOAT32_MIN_SUBNORMAL, VELOCITY_EPSILON } from '../math/float.ts'
import type { BedrockState, Keys, Vec3Like, XZ } from '../types.ts'

// The double-tap window, in ticks, and the key that opened it.
const DOUBLE_TAP_TICKS = 7
// The key that opened the fly toggle's double-tap window: a second press of the same key toggles.
export const FlyToggleKey = { jump: 1, changeHeight: 2 } as const
// A jump press stops a survival glide only after this many ticks of it.
const GLIDE_STOP_JUMP_TICKS = 10

// A second press of jump (or change height) within the window toggles the fly intent of a player that may fly, and
// raises the start / stop flying action; a first press opens the window (a press of the other key re-arms it).
// Returns the fly intent after the tick.
export function flyTrigger (st: BedrockState, keys: Keys, flyIntent: boolean, mayFly: boolean, actions: Set<string>, passenger = false): boolean {
  if (!flyIntent && (!mayFly || passenger)) return flyIntent
  let source: number
  if (!st.wasJumping && keys.jumpDown) source = FlyToggleKey.jump
  else if (!st.wasChangeHeight && keys.changeHeight) source = FlyToggleKey.changeHeight
  else return flyIntent
  if (st.jumpTriggerTime! > 0 && st.flyTriggerSource === source) {
    actions.add(flyIntent ? 'stopFlying' : 'startFlying')
    return !flyIntent
  }
  st.jumpTriggerTime = DOUBLE_TAP_TICKS
  st.flyTriggerSource = source
  return flyIntent
}

// A toggle that took effect closes the window. A start needs the fly permission; a stop does not.
export function flyToggleApplied (st: BedrockState, actions: ReadonlySet<string>, permitted: boolean): void {
  if ((actions.has('startFlying') && permitted) || actions.has('stopFlying')) st.jumpTriggerTime = 0
}

// The facts the glide start and stop read.
export interface GlideFacts {
  jumping: boolean
  // wearing a working elytra
  elytra: boolean
  onGround: boolean
  wasInWater: boolean
  flyIntent: boolean
  instabuild: boolean
  climbable: boolean
}

// Why a glide stops: landing, no elytra, water, flying, a fresh jump press after 10 ticks in survival, or a climbable.
function glideStops (st: BedrockState, facts: GlideFacts): boolean {
  if (facts.onGround || !facts.elytra || facts.wasInWater || facts.flyIntent) return true
  if (facts.jumping && !st.wasJumping && !facts.instabuild && st.fallFlyTicks! > GLIDE_STOP_JUMP_TICKS) return true
  return facts.climbable
}

// A fresh jump press in the air with an elytra (and no fly intent) starts gliding; a glide that meets a stop rule
// ends. Applies the actions to `st.gliding`, counts the ticks spent gliding, and returns the glide intent.
export function glideTriggers (st: BedrockState, facts: GlideFacts, actions: Set<string>): boolean {
  let glideIntent = !!st.gliding
  if (facts.elytra && !facts.onGround && facts.jumping && !st.wasJumping && !glideIntent && !facts.flyIntent) {
    actions.add('startGliding')
    glideIntent = true
  }
  if (glideIntent && glideStops(st, facts)) {
    actions.add('stopGliding')
    glideIntent = false
  }
  if (actions.has('startGliding')) st.gliding = true
  if (actions.has('stopGliding')) st.gliding = false
  st.fallFlyTicks = st.gliding ? (st.fallFlyTicks || 0) + 1 : 0
  return glideIntent
}

// The facts the vertical fly controls read: the stick, creative mode, the four vertical keys and the vertical fly
// speed.
const CREATIVE_GLIDE_LIFT = f(0.1)

export interface GlideBoostFacts {
  gliding: boolean
  jumping: boolean
  instabuild: boolean
  // the ticks spent gliding before this one
  glideTicks: number
}

// A creative glider holding jump after 10 ticks of gliding rises 0.1. The horizontal components have zero added,
// which turns a -0 into +0.
export function creativeGlideBoost (vel: Vec3Like, facts: GlideBoostFacts): void {
  if (!facts.gliding || !facts.jumping || !facts.instabuild || !(facts.glideTicks > GLIDE_STOP_JUMP_TICKS)) return
  vel.x = f(vel.x + 0)
  vel.y = f(vel.y + CREATIVE_GLIDE_LIFT)
  vel.z = f(vel.z + 0)
}

// The facts the vertical fly controls read: the stick, creative mode, the four vertical keys and the vertical fly
// speed.
export interface FlightControlFacts {
  stick: XZ
  creative: boolean
  up: boolean
  down: boolean
  upSlow: boolean
  downSlow: boolean
  // the vertical fly speed
  speed: number
}

// The vertical fly controls. With the stick at rest (its larger axis under 0.01) the hover sets the flying friction
// override -- 0.375 in creative, 0.75 otherwise -- and a creative hover with no vertical input also keeps only 0.375
// of the vertical velocity. Up and down together stop vertical motion; otherwise ascend (+0.15), the slow ascend
// (+0.05), descend (-0.22) and the slow descend (-0.15) sum into an impulse scaled by the vertical fly speed.
export function verticalFlightControl (y: number, facts: FlightControlFacts): { y: number, override: number | undefined } {
  const x = Math.abs(f(facts.stick.x))
  const z = Math.abs(f(facts.stick.z))
  const stick = x > z ? x : z
  let override: number | undefined
  if (stick < f(0.01)) {
    override = facts.creative ? f(0.375) : f(0.75)
    if (facts.creative && !facts.up && !facts.down && !facts.upSlow && !facts.downSlow) y = f(y * override)
  }
  if (facts.up && facts.down) return { y: 0, override }
  let impulse = facts.up ? f(0.15000001) : 0
  if (facts.upSlow) impulse = f(impulse + f(0.050000001))
  if (facts.down) impulse = f(impulse + f(-0.22))
  if (facts.downSlow) impulse = f(impulse + f(-0.15000001))
  return { y: f(f(f(facts.speed) * impulse) + y), override }
}

// The flying travel speed: the fly speed, doubled while sprinting.
export function flyingSpeed (speed: number, sprinting: boolean): number {
  return sprinting ? f(f(speed) * 2) : f(speed)
}

// A flying player standing on the ground with no vertical velocity gets the smallest positive float32 of it, which
// lifts the ground flag at the next move. Either zero compares equal; anything else passes through.
export function flightLiftoffNudge (y: number): number {
  return y === 0 ? FLOAT32_MIN_SUBNORMAL : y
}

// How a modifier scales a base: mode 0 multiplies it; mode 1 scales what the base takes away (1 - base), clamped to
// [0, 1], so a modifier of 0 keeps everything; any other mode is 1.
export function movementModifier (base: number, modifier: number, mode: number): number {
  if (mode === 1) {
    const scaled = f(f(1 - f(base)) * f(modifier))
    const kept = f(1 - (scaled < 0 ? 0 : scaled))
    return scaled > 1 ? 0 : kept
  }
  return mode === 0 ? f(f(base) * f(modifier)) : 1
}

// One axis of a flyer's velocity scaled by the friction: a component within 2^-23 of zero is multiplied by zero
// (keeping its sign), anything else (NaN included) by the scale.
export function frictionAxis (axis: number, scale: number): number {
  const v = f(axis)
  return f((Math.abs(v) <= VELOCITY_EPSILON ? 0 : scale) * v)
}

// How a flyer's friction is modified: the hover's override, the legacy friction flag and the two friction attributes.
export interface FlyingFrictionOptions {
  override?: number | undefined
  legacy?: boolean | undefined
  airDrag?: number | undefined
  frictionModifier?: number | undefined
}

// The scale a flyer's horizontal velocity takes from the travel friction (1 in the air, the block's on the ground).
// The hover's override replaces the horizontal modifier outright; the legacy friction flag uses the friction modifier
// attribute the same way; otherwise both terms go through the air drag modifier. Both attributes are 1 by default.
export function flyingFrictionScale (friction: number, { override, legacy = false, airDrag = 1, frictionModifier = 1 }: FlyingFrictionOptions = {}): number {
  let horizontal: number
  let vertical: number
  let mode: number
  if (override !== undefined) {
    horizontal = override
    vertical = 1
    mode = 0
  } else if (legacy) {
    horizontal = frictionModifier
    vertical = 1
    mode = 0
  } else {
    horizontal = airDrag
    vertical = airDrag
    mode = 1
  }
  return f(movementModifier(0.91, vertical, mode) * movementModifier(friction, horizontal, mode))
}

// A flyer's vertical velocity keeps 0.6 of itself, through the air drag modifier.
export function flyingDrag (y: number, airDrag = 1): number {
  return f(movementModifier(0.6, airDrag, 1) * f(y))
}
