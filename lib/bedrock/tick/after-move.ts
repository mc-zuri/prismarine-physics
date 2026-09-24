// The velocity after the move: gravity, drag and friction for the travel type, levitation, and the pushes that act
// on the moved player (bubble columns, standing on slime or honey).
import { f, VELOCITY_EPSILON } from '../math/float.ts'
import { flyingDrag, flyingFrictionScale, frictionAxis } from '../movement/flight.ts'
import { AIR_FRICTION_XZ, depthStriderLevel, DEPTH_STRIDER_MAX, GROUND_FRICTION } from '../movement/travel.ts'
import type { Ctx, Simulated, Vec3Like } from '../types.ts'
import { blockAt, blockName, standingOnCell } from '../world/blocks.ts'
import { applyBubbleColumns } from '../world/bubble-columns.ts'
import { honeyCellsIn, honeySlide } from '../world/honey.ts'
import type { TickState } from './state.ts'

const Y_DECAY = f(0.98)
const WATER_DRAG = f(0.8)
const WATER_SPRINT_DRAG = f(0.9)
const WATER_SINK_RATE = f(0.005)
const LAVA_DRAG = f(0.5)
const LAVA_GRAVITY = f(0.02)
const LEVITATION_DAMP = f(0.8)
const LEVITATION_PER_LEVEL = f(0.0099999998)
const STICKY_BLOCKS = new Set(['honey_block', 'slime', 'slime_block'])
const STAND_ON_BASE = f(0.40000001)
const STAND_ON_PER_SPEED = f(0.2)

// A velocity component scaled by the friction. One within 2^-23 of zero is scaled by zero instead, which keeps its
// sign; a NaN stays a NaN.
export function applyFriction (v: number, k: number): number {
  const v32 = f(v)
  return f((Math.abs(v32) <= VELOCITY_EPSILON ? 0 : f(k)) * v32)
}

// Levitation damps the vertical velocity to 0.8 and adds 0.01 per level.
export function levitate (vel: Vec3Like, level: number): void {
  vel.y = f(f(vel.y * LEVITATION_DAMP) + f(LEVITATION_PER_LEVEL * (level | 0)))
}

// The horizontal friction: the ground block's slipperiness when the tick started on the ground (else 1), times the
// hover's override when flying, times 0.91.
export function horizontalFriction (entity: Simulated, tick: TickState): void {
  let friction = tick.startedOnGround ? f(tick.groundFriction) : 1
  const override = entity.bedrock.flightFrictionOverride
  if (override !== undefined) friction = f(friction * override)
  const k = f(friction * AIR_FRICTION_XZ)
  entity.vel.x = applyFriction(entity.vel.x, k)
  entity.vel.z = applyFriction(entity.vel.z, k)
}

// The gravity of a landing tick on slime: the part of the fall spent travelling to the block is not charged again.
export function bounceGravity (gravity: number, bounce: { pre: number, post: number }, vy: number): number {
  const g = f(gravity)
  const pre = f(bounce.pre)
  const post = f(bounce.post)
  const travelled = f(Math.sqrt(f(f(f(g + g) * Math.abs(post)) + f(pre * pre))))
  const overshoot = Math.abs(f(f(Math.abs(pre) - travelled) / -g))
  return f(f(g * f(Math.sign(pre) * f(1 - overshoot))) + vy)
}

// The gravity of a tick on land: slow falling's 0.01 while falling, else the full 0.08.
export function gravityOf (vy: number, slowFalling: boolean, gravity: number, slowFallingGravity: number): number {
  return slowFalling && vy < 0 ? slowFallingGravity : gravity
}

// The vertical velocity after gravity.
export function applyGravity (vy: number, gravity: number): number {
  return f(vy - f(gravity))
}

// The vertical velocity keeps 0.98 of itself each tick on land.
export function verticalDecay (vy: number): number {
  return f(vy * Y_DECAY)
}

// Lava halves the velocity on every axis.
export function lavaDrag (vel: Vec3Like): void {
  vel.x = f(vel.x * LAVA_DRAG)
  vel.y = f(vel.y * LAVA_DRAG)
  vel.z = f(vel.z * LAVA_DRAG)
}

// Gravity in lava: 0.02.
export function lavaGravity (vy: number): number {
  return f(vy - LAVA_GRAVITY)
}

// Water keeps 0.8 of the vertical velocity and of the horizontal (0.9 sprinting), the horizontal lerped toward 0.546
// by the Depth Strider level over 3 unless a dolphin's boost multiplies the swim speed.
export function waterDrag (vel: Vec3Like, sprinting: boolean, depthStrider: number, swimSpeedMultiplier = 1): void {
  const drag = sprinting ? WATER_SPRINT_DRAG : WATER_DRAG
  const xzDrag = swimSpeedMultiplier > 1 ? drag : f(f(f(GROUND_FRICTION - drag) * f(depthStrider / DEPTH_STRIDER_MAX)) + drag)
  vel.x = f(vel.x * xzDrag)
  vel.y = f(vel.y * WATER_DRAG)
  vel.z = f(vel.z * xzDrag)
}

// A player not swimming sinks 0.005 each tick in water.
export function waterGravity (vy: number, swimming: boolean): number {
  return swimming ? vy : f(vy - WATER_SINK_RATE)
}

// In lava: the drag, then levitation or lava gravity.
export function lavaVelocity (entity: Simulated): void {
  lavaDrag(entity.vel)
  if (entity.levitation! > 0) levitate(entity.vel, entity.levitation!)
  else entity.vel.y = lavaGravity(entity.vel.y)
}

// In water: the drag (Depth Strider halved off the ground), then levitation or the sink.
export function waterVelocity (entity: Simulated, tick: TickState): void {
  waterDrag(entity.vel, tick.sprinting, depthStriderLevel(entity.depthStrider, !!entity.onGround), tick.swimSpeedMultiplier)
  if (entity.levitation! > 0) levitate(entity.vel, entity.levitation!)
  else entity.vel.y = waterGravity(entity.vel.y, !!entity.bedrock.swimming)
}

// On land: gravity (none while descending scaffolding, the bounce-corrected gravity on a slime landing, levitation
// instead when levitating), the vertical decay, then the friction. A climb on push replaces gravity and the decay.
export function landVelocity (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  const vel = entity.vel
  const levitating = entity.levitation! > 0
  if (tick.autoClimb) {
    if (levitating) levitate(vel, entity.levitation!)
    horizontalFriction(entity, tick)
    return
  }
  if (st.scaffoldDescend) {
    // descending through scaffolding: no gravity this tick
  } else if (st.bounce) {
    vel.y = bounceGravity(ctx.settings.gravity, st.bounce, vel.y)
  } else if (levitating) {
    levitate(vel, entity.levitation!)
  } else {
    vel.y = applyGravity(vel.y, gravityOf(vel.y, entity.slowFalling! > 0, ctx.settings.gravity, ctx.settings.slowFallingGravity))
  }
  vel.y = verticalDecay(vel.y)
  horizontalFriction(entity, tick)
}

// A flyer: the vertical drag (0.6), then the flying friction (the hover's override when it set one).
export function flightVelocity (entity: Simulated, tick: TickState): void {
  const vel = entity.vel
  vel.y = flyingDrag(vel.y)
  const scale = flyingFrictionScale(tick.startedOnGround ? f(tick.groundFriction) : 1, { override: entity.bedrock.flightFrictionOverride })
  vel.x = frictionAxis(vel.x, scale)
  vel.z = frictionAxis(vel.z, scale)
}

// The velocity after the move for the travel type: a glider only levitates, a flyer has its drag, else lava, water or
// land.
export function velocityAfterMove (ctx: Ctx, entity: Simulated, tick: TickState): void {
  if (tick.gliding) {
    if (entity.levitation! > 0) levitate(entity.vel, entity.levitation!)
  } else if (tick.flying) {
    flightVelocity(entity, tick)
  } else if (entity.isInLava) {
    lavaVelocity(entity)
  } else if (entity.isInWater) {
    waterVelocity(entity, tick)
  } else {
    landVelocity(ctx, entity, tick)
  }
}

// Bubble columns push the moved player, unless it flies (as the client holds it).
export function bubbleColumns (ctx: Ctx, entity: Simulated): void {
  if (entity.bedrock.flying) return
  applyBubbleColumns(ctx.world, entity.bedrock.aabb!, entity.vel, ctx.settings.bubbleColumnDrag, ctx.settings.bubbleColumnSurfaceDrag)
}

// Honey blocks the moved player is in slow it, unless it was in water; hanging on one's side resets the fall.
export function honeyBlocks (ctx: Ctx, entity: Simulated): void {
  if (entity.bedrock.wasInWater) return
  const cells = honeyCellsIn(ctx.world, entity.bedrock.aabb!)
  if (honeySlide(entity.vel, entity.pos, f(ctx.settings.playerHalfWidth * 2), cells)) entity.bedrock.fallDistance = 0
}

// Standing (not sneaking) on slime or honey -- the block stood on, as standingOnCell finds it -- scales the horizontal
// velocity by 0.4 + 0.2|vy| while vy < 0.1 (a fast fall onto the block counts too).
export function standOnSticky (ctx: Ctx, entity: Simulated, tick: TickState): void {
  if (!entity.onGround || tick.sneaking) return
  const cell = standingOnCell(ctx.world, entity.pos, entity.bedrock.aabb!)
  if (!STICKY_BLOCKS.has(blockName(blockAt(ctx.world, cell.x, cell.y, cell.z)))) return
  if (!(entity.vel.y < 0.1)) return
  const k = f(f(Math.abs(entity.vel.y) * STAND_ON_PER_SPEED) + STAND_ON_BASE)
  entity.vel.x = f(entity.vel.x * k)
  entity.vel.z = f(entity.vel.z * k)
}
