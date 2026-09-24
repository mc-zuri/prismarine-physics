// The move: the velocity becomes a requested move (slowed down inside cobweb, powder snow or berry bushes, capped,
// kept off edges while sneaking), the box sweeps through the blocks, and the collisions settle the velocity, the
// landing bounce and the ground flag.
import { Box, type BoxLike } from '../math/box.ts'
import { Vec3 } from 'vec3'
import { f } from '../math/float.ts'
import { moveWithCollisions } from '../movement/auto-step.ts'
import type { SweepReport } from '../movement/collision.ts'
import { DepenetrationBit, depenetrationLimit, PENETRATION_EPSILON, SOLID_ENTITY_REACH, updateDepenetrationBits, withSolidEntityOverride } from '../movement/depenetration.ts'
import { flightLiftoffNudge } from '../movement/flight.ts'
import { applyMovementToBox, catchOnScaffolding } from '../movement/player-box.ts'
import { clampToEdge } from '../movement/sneak-edge.ts'
import type { Ctx, Simulated, Vec3Like, World } from '../types.ts'
import { blockAt, blockName, landedOnCell, restitutionOf } from '../world/blocks.ts'
import { applySlowdown, slowdownBlocksIn, slowdownMultiplier } from '../world/slowdown-blocks.ts'
import type { TickState } from './state.ts'

// Slower landings than this do not bounce on slime (from 1.26.20).
const MIN_BOUNCE_SPEED = f(0.080000117)
const MOVE_CAP = 500
const MAX_MOVE_LENGTH = 16

// A move with any lane beyond 500 (an infinity, not a NaN), or of an immobile player, is dropped.
export function capMoveSpeed (speed: Vec3Like, immobile = false): Vec3Like {
  const over = (lane: number): boolean => Math.abs(f(lane)) > MOVE_CAP
  if (immobile || over(speed.x) || over(speed.y) || over(speed.z)) return { x: 0, y: 0, z: 0 }
  return { x: speed.x, y: speed.y, z: speed.z }
}

// A move longer than 16 is scaled down to 16 (the length summed as y, then x, then z).
export function clampMoveLength (speed: Vec3Like): Vec3Like {
  const lengthSq = f(f(f(speed.y * speed.y) + f(speed.x * speed.x)) + f(speed.z * speed.z))
  if (!(lengthSq > MAX_MOVE_LENGTH * MAX_MOVE_LENGTH)) return speed
  const length = f(Math.sqrt(lengthSq))
  return { x: f(f(speed.x / length) * MAX_MOVE_LENGTH), y: f(f(speed.y / length) * MAX_MOVE_LENGTH), z: f(f(speed.z / length) * MAX_MOVE_LENGTH) }
}

// The slowdown blocks the player was in at the end of the previous tick (on the first tick, the ones it is in now)
// scale this tick's move (cobweb less with the Weaving effect).
export function slowDown (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  tick.slowdowns = st.pendingSlowdowns || slowdownBlocksIn(ctx.world, st.aabb!)
  const slowed = applySlowdown(entity.vel, slowdownMultiplier(tick.slowdowns, entity.weaving! > 0))
  if (slowed) entity.vel.set(slowed.x, slowed.y, slowed.z)
  tick.slowed = !!slowed
}

// The move asked of the sweep: the velocity, nudged off the ground when flying, capped, clamped to 16 long, and kept
// off edges when sneaking on the ground.
export function requestMove (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  if (tick.flying && entity.onGround) entity.vel.y = flightLiftoffNudge(entity.vel.y)
  const capped = capMoveSpeed(entity.vel)
  st.lastRequested = { x: capped.x, y: capped.y, z: capped.z }
  const clamped = clampMoveLength(capped)
  tick.requested = new Vec3(clamped.x, clamped.y, clamped.z)
  if (tick.sneaking && tick.startedOnGround) clampToEdge(ctx.world, st.aabb!, tick.requested, entity.vel, ctx.settings.stepHeight)
}

// The depenetration limit of a move: from the state the previous moves left, raised to 0.1 with a solid entity (a
// boat) near; a solid entity the player is inside makes it a one-way collider, which engages the push at 0.1.
export function moveDepenetrationLimit (world: World, aabb: BoxLike, bits: number): Vec3Like {
  const R = SOLID_ENTITY_REACH
  const near = world.solidEntityBoxes ? world.solidEntityBoxes(new Box(aabb.minX - R, aabb.minY - R, aabb.minZ - R, aabb.maxX + R, aabb.maxY + R, aabb.maxZ + R)) : []
  if (!near.length) return depenetrationLimit(bits)
  const inside = near.some(b => b.minX < aabb.maxX && b.maxX > aabb.minX && b.minY < aabb.maxY && b.maxY > aabb.minY && b.minZ < aabb.maxZ && b.maxZ > aabb.minZ)
  return withSolidEntityOverride(depenetrationLimit(inside ? bits | DepenetrationBit.alwaysOneWay : bits))
}

// Sweeps the box by the requested move and moves the player with it, with the move's depenetration limit; this move's
// penetration updates the state it comes from. With no-clip the box moves the whole way.
export function sweepMove (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  tick.preMoveY = entity.pos.y
  st.lastPos = { x: entity.pos.x, y: entity.pos.y, z: entity.pos.z }
  if (entity.noClip) {
    tick.applied = { x: tick.requested.x, y: tick.requested.y, z: tick.requested.z }
    tick.moveShapes = []
    applyMovementToBox(entity, tick.applied)
    return
  }
  const bits = st.depenetrationBits || 0
  const report: SweepReport = { totalClip: 0 }
  const aabb = st.aabb!
  const limit = moveDepenetrationLimit(ctx.world, aabb, bits)
  tick.applied = moveWithCollisions(ctx.world, aabb.clone(), tick.requested, !!entity.onGround, ctx.settings.stepHeight, !!st.input!.sneaking, limit, report, { leatherBoots: !!entity.leatherBoots, fallDistance: st.fallDistance || 0 })
  tick.penetrated = report.totalClip >= PENETRATION_EPSILON
  st.depenetrationBits = updateDepenetrationBits(bits, !!st.pushTowardsClosestSpace, tick.penetrated)
  tick.moveShapes = report.shapes!
  applyMovementToBox(entity, tick.applied)
}

// The vertical velocity a landing (not sneaking) leaves: the fall speed times the landed-on block's restitution. From
// 1.26.20 the block is the one landedOnCell picks from the move's collision boxes (slime 1, a bed 0.75, honey
// none), only a fall of at least 0.08 bounces, and the bounce is remembered for the gravity correction; before, only
// slime under the centre of the feet bounced, at any speed.
export function landingBounce (ctx: Ctx, entity: Simulated, tick: TickState): number {
  const { requested, applied } = tick
  if (!(requested.y < 0) || tick.sneaking) return 0
  if (!ctx.bounceCorrection) {
    return blockName(blockAt(ctx.world, entity.pos.x, entity.pos.y - 0.1, entity.pos.z)).startsWith('slime') ? f(-requested.y) : 0
  }
  if (!(-requested.y >= MIN_BOUNCE_SPEED)) return 0
  const cell = landedOnCell(tick.moveShapes, entity.bedrock.aabb!)
  const restitution = cell ? restitutionOf(blockAt(ctx.world, cell.x, cell.y, cell.z)) : 0
  const bounce = f(restitution * -requested.y)
  if (!(bounce > 0)) return 0
  entity.bedrock.bounce = { pre: requested.y, post: applied.y }
  return f(bounce + 0)
}

// The collisions of the move: a blocked axis stops, a vertical collision lands (or bounces); the ground flag is set
// by a landing and kept by a move with no vertical part; a slowed move drops the velocity.
export function settleCollisions (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  const vel = entity.vel
  const { requested, applied } = tick
  const xCollided = applied.x !== requested.x
  const zCollided = applied.z !== requested.z
  const yCollided = applied.y !== requested.y || (!entity.noClip && catchOnScaffolding(ctx.world, entity, {
    requested,
    applied,
    preMoveY: tick.preMoveY,
    startedOnGround: tick.startedOnGround,
    sneaking: tick.sneaking,
    jumping: !!(st.input!.jumping || entity.jumpQueued)
  }))
  if (xCollided) vel.x = 0
  if (zCollided) vel.z = 0
  st.bounce = null
  if (yCollided) vel.y = landingBounce(ctx, entity, tick)
  entity.isCollidedHorizontally = xCollided || zCollided
  entity.isCollidedVertically = yCollided
  entity.onGround = yCollided ? requested.y < 0 : (tick.startedOnGround && requested.y === 0)
  if (tick.slowed) vel.set(0, 0, 0)
  entity.isInWeb = tick.slowdowns.has('web')
}
