// Where a rider lands when it leaves a vehicle: the first free spot with a floor to stand on and room for the rider's
// box. A rider that leaves by itself looks around the vehicle's block, to the sides of the way it is moving first; one
// the server takes off looks only up the vehicle's own column.
import { Box, type BoxLike } from '../math/box.ts'
import { f } from '../math/float.ts'
import type { Block, Vec3Like, World } from '../types.ts'
import { blockAt, blockBounds, blockName } from '../world/blocks.ts'

// Below this squared horizontal displacement the vehicle counts as standing still.
const STATIONARY = f(0.000098010001)

// A block a rider can be placed in even though it has a shape: a climbable.
function passable (block: Block | null | undefined): boolean {
  const name = blockName(block)
  return name.includes('ladder') || name.includes('vine') || name === 'scaffolding'
}

// The rise of the floor under a candidate cell, relative to the cell: a low block in the cell (a slab) to stand on,
// else the top of the block below; none when the cell is a full solid block or there is nothing below.
export function floorClearance (world: World, x: number, y: number, z: number): number | null {
  const here = blockAt(world, x, y, z)
  const shape = blockBounds(here, x, y, z)
  if (shape) {
    const top = f(shape.maxY - y)
    if (top < 1) return top
    if (!passable(here)) return null
  }
  const below = blockAt(world, x, y - 1, z)
  const under = blockBounds(below, x, y - 1, z)
  if (!under || passable(below)) return null
  const rise = f(under.maxY - y)
  return rise >= 0 ? rise : null
}

// Whether a box of the rider's size stands at `pos` (its feet) without meeting a solid block.
export function fitsAt (world: World, pos: Vec3Like, size: Vec3Like): boolean {
  const half = f(Math.min(size.x, 1) * 0.5)
  const body = new Box(f(pos.x - half), pos.y, f(pos.z - half), f(half + pos.x), f(size.y + pos.y), f(pos.z + half))
  for (let x = Math.floor(body.minX); x <= Math.floor(body.maxX); x++) {
    for (let y = Math.floor(body.minY); y <= Math.floor(body.maxY); y++) {
      for (let z = Math.floor(body.minZ); z <= Math.floor(body.maxZ); z++) {
        const block = blockAt(world, x, y, z)
        const box = blockBounds(block, x, y, z)
        if (box && body.intersects(box) && !passable(block)) return false
      }
    }
  }
  return true
}

// The way the vehicle moves (the larger horizontal axis of its last move), and the side to its left; standing still,
// west with north to the side.
export function directionPose (pos: Vec3Like, posPrev: Vec3Like): { forward: Vec3Like, side: Vec3Like } {
  const dx = f(pos.x - posPrev.x)
  const dz = f(pos.z - posPrev.z)
  if (!(f(f(dz * dz) + f(dx * dx)) > STATIONARY)) return { forward: { x: -1, y: 0, z: 0 }, side: { x: 0, y: 0, z: -1 } }
  const keepX = Math.abs(dz) < Math.abs(dx) ? dx : 0
  const keepZ = Math.abs(dx) <= Math.abs(dz) ? dz : 0
  const inv = f(1 / f(Math.sqrt(f(f(keepZ * keepZ) + f(keepX * keepX)))))
  const forward = { x: f(keepX * inv), y: 0, z: f(keepZ * inv) }
  return { forward, side: { x: -forward.z, y: 0, z: forward.x } }
}

// The offset from the vehicle's block centre to the first spot around it with a floor and room, the floor's rise with
// it; null when there is none. Level first, then one up, then one down; sides first, then diagonals, then back and front.
export function searchDismount (world: World, anchor: Vec3Like, size: Vec3Like, forward: Vec3Like, side: Vec3Like): { offset: Vec3Like, rise: number } | null {
  const add = (a: Vec3Like, b: Vec3Like): Vec3Like => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
  const neg = (a: Vec3Like): Vec3Like => ({ x: -a.x, y: -a.y, z: -a.z })
  const around = [side, neg(side), add(side, neg(forward)), add(neg(side), neg(forward)), add(side, forward), add(forward, neg(side)), neg(forward), forward]
  for (const level of [0, 1, -1]) {
    for (const step of around) {
      const offset = { x: step.x, y: step.y + level, z: step.z }
      const at = { x: f(anchor.x + offset.x), y: f(anchor.y + offset.y), z: f(anchor.z + offset.z) }
      const rise = floorClearance(world, Math.floor(at.x), Math.floor(at.y), Math.floor(at.z))
      if (rise === null) continue
      if (fitsAt(world, { x: at.x, y: f(at.y + rise), z: at.z }, size)) return { offset, rise }
    }
  }
  return null
}

// The offset up the vehicle's own column to the first spot with a floor and room (the block itself, then one and two
// up), the floor's rise with it; null when there is none.
export function searchDismountColumn (world: World, anchor: Vec3Like, size: Vec3Like): { offset: Vec3Like, rise: number } | null {
  for (const level of [0, 1, 2]) {
    const at = { x: anchor.x, y: f(anchor.y + level), z: anchor.z }
    const rise = floorClearance(world, Math.floor(at.x), Math.floor(at.y), Math.floor(at.z))
    if (rise === null) continue
    if (fitsAt(world, { x: at.x, y: f(at.y + rise), z: at.z }, size)) return { offset: { x: 0, y: level, z: 0 }, rise }
  }
  return null
}

// The rider's position (feet) after it leaves the vehicle: the seat moved to the free spot, standing on its floor
// (0.001 above); where there is none, where it sits (the rider box's feet). `standing`: whether it stands on a floor.
// `byRider`: the rider leaves by itself (else the server takes it off).
export function dismountPosition (world: World, vehicle: { pos: Vec3Like, posPrev?: Vec3Like | undefined }, seat: Vec3Like, riderBox: BoxLike, byRider = true): Vec3Like & { standing: boolean } {
  const base = vehicle.pos
  const floored = { x: Math.floor(base.x), y: Math.floor(base.y), z: Math.floor(base.z) }
  const anchor = { x: floored.x + 0.5, y: floored.y, z: floored.z + 0.5 }
  const size = { x: f(riderBox.maxX - riderBox.minX), y: f(riderBox.maxY - riderBox.minY), z: f(riderBox.maxZ - riderBox.minZ) }
  const { forward, side } = directionPose(base, vehicle.posPrev ?? base)
  const found = byRider ? searchDismount(world, anchor, size, forward, side) : searchDismountColumn(world, anchor, size)
  if (!found) return { x: seat.x, y: riderBox.minY, z: seat.z, standing: false }
  return { x: f(seat.x + found.offset.x), y: f(f(f(floored.y + found.rise) + found.offset.y) + f(0.001)), z: f(seat.z + found.offset.z), standing: true }
}
