// The push toward free space: a player the server asks to push out of blocks, whose move ended inside some, gets a
// small velocity away from them (0.1 along the way out), unless it already moves faster that way.
import { Box, type BoxLike } from '../math/box.ts'
import { f } from '../math/float.ts'
import type { Vec3Like } from '../types.ts'

const EPSILON = f(1.1920929e-7)
const SMALL = f(0.0001)
const PUSH = f(0.1)

// The centre of a box, as min + half the size.
function centre (box: BoxLike): { x: number, z: number } {
  return { x: f(box.minX + f(f(box.maxX - box.minX) * 0.5)), z: f(box.minZ + f(f(box.maxZ - box.minZ) * 0.5)) }
}

// A box with its leading faces pushed out along x and z.
function extended (box: BoxLike, x: number, z: number): Box {
  return new Box(x < 0 ? f(box.minX + x) : box.minX, box.minY, z < 0 ? f(box.minZ + z) : box.minZ, x > 0 ? f(box.maxX + x) : box.maxX, box.maxY, z > 0 ? f(box.maxZ + z) : box.maxZ)
}

// The box the search for blocks around the player covers: a block out on each horizontal side.
export function closestSpaceReach (box: BoxLike): Box {
  return new Box(f(box.minX + -1), box.minY, f(box.minZ + -1), f(box.maxX + 1), box.maxY, f(box.maxZ + 1))
}

// Pushes `vel` (x and z only) away from the block boxes `shapes` (those near the player's `box`) that it is inside:
// from their mean centre toward the player's, turned back on an axis a block blocks (and dropped when both ways are).
export function pushTowardsClosestSpace (box: BoxLike, shapes: readonly BoxLike[], vel: Vec3Like): void {
  const at = new Box(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ)
  const inside = shapes.filter(shape => at.intersects(shape))
  if (!inside.length) return
  const around = shapes.filter(shape => !at.intersects(shape))
  let sumX = 0
  let sumZ = 0
  for (const shape of inside) {
    const c = centre(shape)
    sumX = f(sumX + c.x)
    sumZ = f(sumZ + c.z)
  }
  const inverse = f(1 / inside.length)
  const ax = f(sumX * inverse)
  const az = f(sumZ * inverse)
  const halfX = f(0.5 * f(box.maxX - box.minX))
  const halfZ = f(0.5 * f(box.maxZ - box.minZ))
  const target = { minX: f(ax - halfX), minY: box.minY, minZ: f(az - halfZ), maxX: f(ax + halfX), maxY: box.maxY, maxZ: f(az + halfZ) }
  const own = centre(box)
  let dx = f(own.x - ax)
  let dz = f(own.z - az)
  if (Math.abs(dx) < EPSILON && Math.abs(dz) < EPSILON) {
    dx = 1
    dz = 1
  }
  const blocked = (x: number, z: number): boolean => { const moved = extended(target, x, z); return around.some(shape => moved.intersects(shape)) }
  const signX = Math.sign(dx)
  if (blocked(signX, 0)) dx = blocked(-signX, 0) ? 0 : f(-dx)
  const signZ = Math.sign(dz)
  if (blocked(0, signZ)) dz = blocked(0, -signZ) ? 0 : f(-dz)
  if (Math.abs(dx) < EPSILON && Math.abs(dz) < EPSILON) return
  const length = f(Math.sqrt(f(f(dx * dx) + f(dz * dz))))
  const nx = length < SMALL ? 0 : f(dx / length)
  const nz = length < SMALL ? dz : f(dz / length)
  const px = f(nx * PUSH)
  const pz = f(nz * PUSH)
  // each axis takes the push only where it is stronger than the velocity, and no further than the push itself
  const magX = Math.abs(px)
  if (magX > Math.abs(vel.x)) { const sum = f(vel.x + px); vel.x = sum > magX ? magX : Math.max(sum, -magX) }
  const magZ = Math.abs(pz)
  if (magZ > Math.abs(vel.z)) { const sum = f(vel.z + pz); vel.z = sum > magZ ? magZ : Math.max(sum, -magZ) }
}
