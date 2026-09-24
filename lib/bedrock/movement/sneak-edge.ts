// Sneaking on the ground does not walk off an edge: each horizontal axis of the move (then both together) is backed
// off in 0.05 steps until a probe box -- the box shrunk by 0.025 on the sides and dropped just over a step height --
// still finds support.
import { Box, type BoxLike } from '../math/box.ts'
import { f, VELOCITY_EPSILON } from '../math/float.ts'
import type { Vec3Like, World } from '../types.ts'
import { collisionBoxes } from '../world/blocks.ts'

const PROBE_SHRINK = f(0.025)
const PROBE_DROP_PER_STEP = f(-1.01)
const APPROACH_STEP = f(0.050000001)

// One float32 step of 0.05 of a move component toward zero, never past it (a NaN becomes 0).
export function sneakApproach (value: number): number {
  if (!(value < 0)) {
    const moved = f(value - APPROACH_STEP)
    return moved > 0 ? moved : 0
  }
  const moved = f(APPROACH_STEP + value)
  const clamped = moved > value ? moved : value
  return moved > 0 ? 0 : clamped
}

function hasSupport (world: World, probe: BoxLike, dx: number, dz: number): boolean {
  return collisionBoxes(world, new Box(f(probe.minX + dx), probe.minY, f(probe.minZ + dz), f(probe.maxX + dx), probe.maxY, f(probe.maxZ + dz))).length > 0
}

// Backs `requested` (in place) off the edges; a component backed off to nothing also stops that axis of `vel`. The
// probe drops 1.01 times the step height.
export function clampToEdge (world: World, aabb: BoxLike, requested: Vec3Like, vel: Vec3Like, stepHeight = 0.5625): void {
  const drop = f(f(stepHeight) * PROBE_DROP_PER_STEP)
  const probe = {
    minX: f(aabb.minX + PROBE_SHRINK),
    maxX: f(aabb.maxX - PROBE_SHRINK),
    minZ: f(aabb.minZ + PROBE_SHRINK),
    maxZ: f(aabb.maxZ - PROBE_SHRINK),
    minY: f(aabb.minY + drop),
    maxY: f(aabb.maxY + drop)
  }
  while (requested.x !== 0 && !hasSupport(world, probe, requested.x, 0)) requested.x = sneakApproach(requested.x)
  while (requested.z !== 0 && !hasSupport(world, probe, 0, requested.z)) requested.z = sneakApproach(requested.z)
  while ((requested.x !== 0 || requested.z !== 0) && !hasSupport(world, probe, requested.x, requested.z)) {
    requested.x = sneakApproach(requested.x)
    requested.z = sneakApproach(requested.z)
  }
  if (Math.abs(requested.x) <= VELOCITY_EPSILON) vel.x = 0
  if (Math.abs(requested.z) <= VELOCITY_EPSILON) vel.z = 0
}
