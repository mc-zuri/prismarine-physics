// A boat the player steers: the paddles from the rider's input, the friction of what the boat is in or on, and the
// turn and thrust the paddles give. The move itself and the buoyancy are the vehicle tick's (tick/vehicle.ts).
import { f } from '../math/float.ts'
import type { Trig } from '../math/crt.ts'
import type { Block, Vec3Like, World, XZ } from '../types.ts'
import { blockAt, blockFriction, blockName, blockShapes } from '../world/blocks.ts'
import { isWaterName, liquidDepthOf, liquidSurfaceHeight } from '../world/liquids.ts'

// A boat's box and the height of its position above the box's floor.
export const BOAT_WIDTH = f(1.4)
export const BOAT_HEIGHT = f(0.455)
export const BOAT_HEIGHT_OFFSET = f(0.375)
// Friction in and on water.
export const WATER_FRICTION = f(0.9)
// Ticks a boat stays controllable while it has to resurface.
export const OUT_OF_CONTROL_LIMIT = 24

// One paddle: its force, the tick of its last stroke (-1: none), where the last stroke started and its row time.
export interface Paddle {
  force: number
  lastStrokeTick: number
  position: number
  rowTime: number
}

export function newPaddle (): Paddle {
  return { force: 0, lastStrokeTick: -1, position: 0, rowTime: 0 }
}

// The paddle forces a rider's move vector asks for: the forward push (full with the up key) split between the paddles
// by the strafe, a backward push at -0.15 with the strafe mirrored.
export function paddleForces (move: XZ, up: boolean): [number, number] {
  const strafe = f(move.x)
  const forward = up ? 1 : f(move.z)
  const clamped = forward > 1 ? 1 : (forward > -1 ? forward : -1)
  let magnitude = f(Math.sqrt(f(f(clamped * clamped) + f(strafe * strafe))))
  const signedStrafe = clamped < 0 ? f(-strafe) : strafe
  if (clamped < 0) magnitude = f(magnitude * f(-0.15000001))
  const left = signedStrafe > 1 ? 0 : (signedStrafe > 0 ? f(1 - signedStrafe) : 1)
  const right = signedStrafe > 0 ? 1 : f((signedStrafe > -1 ? signedStrafe : -1) + 1)
  return [f(magnitude * left), f(magnitude * right)]
}

// A paddle driven by a force: three times it, a stroke at most every 10 ticks; between strokes the force eases 0.1 off.
export function paddleWithForce (paddle: Paddle, tick: number, rawForce: number): void {
  const force = f(rawForce)
  if (force === 0) {
    paddle.force = force
    return
  }
  const scaled = f(3 * force)
  if (((tick - paddle.lastStrokeTick) | 0) >= 10) {
    paddle.force = scaled
    paddle.lastStrokeTick = tick
    return
  }
  const eased = f(Math.abs(scaled) + -0.1)
  const magnitude = eased < 0 ? 0 : eased
  paddle.force = force < 0 ? f(-magnitude) : magnitude
}

// A paddle rowed with a button: a stroke starts at 3 (2.5 or more if the last one was within 9 ticks) and holds for 9
// ticks, then eases 0.05 a tick down to 2.5; released, the force halves away.
export function paddleRowing (paddle: Paddle, tick: number, rowing: boolean): void {
  const started = paddle.lastStrokeTick
  if (!rowing) {
    if (started >= 0) {
      paddle.position = started
      paddle.lastStrokeTick = -1
    }
    paddle.force = paddle.force > f(0.01) ? f(paddle.force * 0.5) : 0
    return
  }
  const eased = (): number => { const v = f(paddle.force + -0.05); return v < 2.5 ? 2.5 : v }
  if (started < 0) {
    paddle.force = ((tick - paddle.position) | 0) > 9 ? 3 : eased()
    paddle.rowTime = 0
    paddle.lastStrokeTick = tick
    return
  }
  paddle.force = ((tick - started) | 0) > 9 ? eased() : 3
}

// Whether a block is one the boat floats in.
function floatsIn (block: Block | null | undefined): boolean {
  return isWaterName(blockName(block)) && blockName(block) !== 'bubble_column'
}

// What the boat is in or on: `invFriction` scales its horizontal velocity and turn this tick, `inAir` stops the paddles
// turning or pushing it, `resurfacing` counts a tick under water.
export interface BoatFriction { invFriction: number, inAir: boolean, floating: boolean, resurfacing: boolean }

// The friction of the boat at `pos` (its position, the box floor plus the height offset): water it floats on or has to
// resurface from, else on the ground the friction of the block it is on (the block in its cell when that has a collision
// shape, else the one below), else in the air none.
export function boatFriction (world: World, pos: Vec3Like, onGround: boolean): BoatFriction {
  const x = Math.floor(f(pos.x))
  const y = Math.floor(f(pos.y))
  const z = Math.floor(f(pos.z))
  const here = blockAt(world, x, y, z)
  const above = blockAt(world, x, y + 1, z)
  if (floatsIn(here) && !floatsIn(above) && liquidSurfaceHeight(liquidDepthOf(here), y) > f(pos.y)) {
    return { invFriction: WATER_FRICTION, inAir: false, floating: true, resurfacing: false }
  }
  if (floatsIn(here) && floatsIn(above)) return { invFriction: WATER_FRICTION, inAir: false, floating: false, resurfacing: true }
  const name = blockName(here)
  const below = blockAt(world, x, y - 1, z)
  if (!isWaterName(name) && name !== 'air' && name !== 'snow_layer') {
    if (!onGround) return { invFriction: 1, inAir: true, floating: false, resurfacing: false }
    const solid = blockShapes(here).some(s => s[0] < s[3] && s[1] < s[4] && s[2] < s[5])
    return { invFriction: f(blockFriction(solid ? here : below, 0.6)), inAir: false, floating: false, resurfacing: false }
  }
  if (!isWaterName(name)) {
    if (onGround) return { invFriction: f(blockFriction(below, 0.6)), inAir: false, floating: false, resurfacing: false }
    if (!isWaterName(blockName(below))) return { invFriction: 1, inAir: true, floating: false, resurfacing: false }
  }
  return { invFriction: WATER_FRICTION, inAir: false, floating: false, resurfacing: false }
}

// The boat's motion between ticks: velocity, yaw and its turn rate.
export interface BoatMotion { vel: Vec3Like, yaw: number, yRotD: number }

// The friction scales the horizontal velocity and the turn rate before the paddles act.
export function applyBoatFriction (motion: BoatMotion, invFriction: number): void {
  motion.vel.x = f(invFriction * motion.vel.x)
  motion.vel.z = f(invFriction * motion.vel.z)
  motion.yRotD = f(invFriction * motion.yRotD)
}

// The paddles' turn and thrust (none in the air; the left paddle turns right), a sharper turn from a near standstill,
// the yaw, and the thrust along the new heading; the horizontal velocity takes the friction again.
export function boatControl (motion: BoatMotion, paddles: readonly Paddle[], friction: { invFriction: number, inAir: boolean }, trig: Trig): void {
  let turn = 0
  let thrust = 0
  for (const [i, paddle] of paddles.entries()) {
    const angle = f(paddle.force * f(0.01375))
    if (angle === 0) {
      paddle.rowTime = 0
      paddle.lastStrokeTick = -1
      continue
    }
    if (!friction.inAir) {
      turn = f(turn + f(f(i === 0 ? 3 : -3) * angle))
      thrust = f(thrust + angle)
    }
    const rowTime = f(angle + paddle.rowTime)
    paddle.rowTime = rowTime > 1000 ? f(rowTime + -1000) : rowTime
  }
  const vel = motion.vel
  const speedSquared = f(f(vel.z * vel.z) + f(vel.x * vel.x))
  if (f(0.010000001) > speedSquared && turn !== 0) {
    turn = f(turn * f(1.6))
    thrust = f(thrust * friction.invFriction)
  }
  motion.yRotD = f(f(f(turn * 10) + motion.yRotD) * friction.invFriction)
  motion.yaw = f(motion.yRotD + motion.yaw)
  const heading = f(90 - motion.yaw)
  const cosine = trig.cosDeg(heading)
  const sine = trig.sinDeg(heading)
  const alongX = f(f(thrust * sine) + f(0 * cosine))
  const alongZ = f(f(thrust * cosine) - f(0 * sine))
  vel.x = f(f(alongX + vel.x) * friction.invFriction)
  vel.y = f(0 + vel.y)
  vel.z = f(f(alongZ + vel.z) * friction.invFriction)
}
