// The move with collisions, and the step up onto a block the horizontal move ran into.
import { Vec3 } from 'vec3'
import type { Box } from '../math/box.ts'
import type { Vec3Like, World } from '../types.ts'
import type { Mover } from '../world/blocks.ts'
import { collide, FULL_DEPENETRATION, type SweepReport } from './collision.ts'

function horizontalLengthSq (v: Vec3Like): number { return v.x * v.x + v.z * v.z }

// The step candidate: up by the step height then across, and, when the stretched box cannot rise that high, up only
// as far as it can then across; the longer horizontal path wins, and settles back down. Returns `plain` when stepping
// gets no further.
export function tryStep (world: World, box: Box, requested: Vec3Like, plain: Vec3, stepHeight: number, mover: Mover, limit: Vec3Like = FULL_DEPENETRATION): Vec3 {
  let step = collide(world, box.clone(), requested.x, stepHeight, requested.z, mover, limit)
  const stretched = box.clone().extend(requested.x, 0, requested.z)
  const maxStepUp = collide(world, stretched, 0, stepHeight, 0, mover, limit).y
  if (maxStepUp < stepHeight) {
    const raised = box.clone().offset(0, maxStepUp, 0)
    const horizontal = collide(world, raised, requested.x, 0, requested.z, mover, limit)
    if (horizontalLengthSq(horizontal) > horizontalLengthSq(step)) step = new Vec3(horizontal.x, horizontal.y + maxStepUp, horizontal.z)
  }
  if (horizontalLengthSq(step) <= horizontalLengthSq(plain)) return plain
  const stepped = box.clone().offset(step.x, step.y, step.z)
  const remainingY = collide(world, stepped, 0, requested.y - step.y, 0, mover, limit).y
  return new Vec3(step.x, step.y + remainingY, step.z)
}

// Whether a step is tried: the horizontal move was clipped, and the player is on the ground or its fall was stopped.
export function mayStep (onGround: boolean, requested: Vec3Like, applied: Vec3Like): boolean {
  const verticalCollision = applied.y !== requested.y
  const horizontalCollision = applied.x !== requested.x || applied.z !== requested.z
  return (onGround || (verticalCollision && requested.y < 0)) && horizontalCollision
}

// The movement the box can make of `requested`, stepping up where that gets further. `limit` is the depenetration
// limit; `report` receives the plain move's summed clip depths.
export function moveWithCollisions (world: World, box: Box, requested: Vec3Like, onGround: boolean, stepHeight: number, descending: boolean, limit: Vec3Like = FULL_DEPENETRATION, report?: SweepReport, moverFacts: Partial<Mover> = {}): Vec3 {
  const mover: Mover = { ...moverFacts, aabb: box.clone(), descend: descending }
  const applied = collide(world, box.clone(), requested.x, requested.y, requested.z, mover, limit, report)
  if (!mayStep(onGround, requested, applied)) return applied
  const stepped = tryStep(world, box, requested, applied, stepHeight, mover, limit)
  return horizontalLengthSq(stepped) > horizontalLengthSq(applied) ? stepped : applied
}
