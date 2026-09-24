// Honey: a player in a honey block's cell (against its side, since its shape is inset) slides down slowly.
import type { BoxLike } from '../math/box.ts'
import { f } from '../math/float.ts'
import type { Vec3Like, World } from '../types.ts'
import { blockAt, blockName } from './blocks.ts'

const INSET = f(0.001)
// The slowest the slide lets the player fall, and what it keeps of the horizontal velocity per block.
export const HONEY_SLIDE_FALL = f(-0.12)
export const HONEY_SLIDE_DRAG = f(0.40000001)
// Above this height in the block's cell the player is on top of it, not on its side.
const HONEY_TOP = f(0.9375)
// How far past the block's centre, beyond half the player's width, the player hangs on its side.
const HONEY_SIDE = f(0.43125001)

// The honey block cells of the box shrunk by 0.001, in x, y, z order.
export function honeyCellsIn (world: World, aabb: BoxLike): Vec3Like[] {
  const cells: Vec3Like[] = []
  for (let x = Math.floor(f(aabb.minX + INSET)); x <= Math.floor(f(aabb.maxX + -INSET)); x++) {
    for (let y = Math.floor(f(aabb.minY + INSET)); y <= Math.floor(f(aabb.maxY + -INSET)); y++) {
      for (let z = Math.floor(f(aabb.minZ + INSET)); z <= Math.floor(f(aabb.maxZ + -INSET)); z++) {
        if (blockName(blockAt(world, x, y, z)) === 'honey_block') cells.push({ x, y, z })
      }
    }
  }
  return cells
}

// Each honey cell keeps 0.4 of the horizontal velocity and slows a fall to 0.12. A falling player hanging on a
// block's side (not above its top) has its fall distance reset; returns whether one did.
export function honeySlide (vel: Vec3Like, pos: Vec3Like, width: number, cells: Vec3Like[]): boolean {
  let reset = false
  for (const cell of cells) {
    const y = HONEY_SLIDE_FALL > vel.y ? HONEY_SLIDE_FALL : vel.y
    vel.x = f(vel.x * HONEY_SLIDE_DRAG)
    vel.y = y
    vel.z = f(vel.z * HONEY_SLIDE_DRAG)
    if (pos.y > f(cell.y + HONEY_TOP) || !(y < 0)) continue
    const threshold = f(f(width * 0.5) + HONEY_SIDE)
    const dx = Math.abs(f(f(cell.x + 0.5) - pos.x))
    const dz = Math.abs(f(f(cell.z + 0.5) - pos.z))
    if (threshold < dx || threshold < dz) reset = true
  }
  return reset
}
