// Block lookups and collision shapes.
import { Vec3 } from 'vec3'
import { Box, type BoxLike } from '../math/box.ts'
import { f, FLT_MAX } from '../math/float.ts'
import type { Block, Shape, Vec3Like, World } from '../types.ts'

// The ground's slipperiness by block; anything else is the default (0.6).
export const BLOCK_FRICTION: Readonly<Record<string, number>> = {
  ice: 0.98,
  packed_ice: 0.98,
  frosted_ice: 0.98,
  blue_ice: 0.989,
  slime: 0.8,
  slime_block: 0.8,
  honey_block: 0.8
}

const FULL_BLOCK: Shape[] = [[0, 0, 0, 1, 1, 1]]
const NO_SHAPE: Shape[] = []
// The collision query pads the searched cells by this much.
const QUERY_PADDING = 1e-7
// A scaffolding top counts as under the feet within this much.
const SCAFFOLDING_TOP_TOLERANCE = f(-1e-6)

// The block of the cell a point is in.
export function blockAt (world: World, x: number, y: number, z: number): Block | null | undefined {
  return world.getBlock(new Vec3(Math.floor(x), Math.floor(y), Math.floor(z)))
}

// A block's name; air when there is none.
export function blockName (block: Block | null | undefined): string {
  return (block && block.name) || 'air'
}

// Whether a block is air (none, named air, or of type 0).
export function isAir (block: Block | null | undefined): boolean {
  return !block || block.name === 'air' || block.type === 0
}

// The ground friction of a block: its slipperiness, or the default.
export function blockFriction (block: Block | null | undefined, defaultSlipperiness: number): number {
  if (isAir(block)) return defaultSlipperiness
  const known = BLOCK_FRICTION[block!.name]
  return known !== undefined ? known : defaultSlipperiness
}

// The block's collision boxes relative to its cell. A ladder always collides as its thin plate, even where the block
// data marks it 'empty'; every other 'empty' block (vines, powder snow, cobweb) and scaffolding have no collision.
export function blockShapes (block: Block | null | undefined): Shape[] {
  if (!block || (block.boundingBox === 'empty' && block.name !== 'ladder')) return NO_SHAPE
  if (block.name === 'scaffolding') return NO_SHAPE
  if (Array.isArray(block.shapes)) return block.shapes
  if (block.boundingBox === 'block') return FULL_BLOCK
  return NO_SHAPE
}

// The mover a collision query is made for: its box before the move, whether it is descending through blocks, and for
// powder snow its leather boots and how far it has fallen.
export interface Mover {
  aabb: BoxLike
  descend: boolean
  // descending through powder snow (the previous tick's sneak over it), where not given the move's own sneak
  descendSnow?: boolean | undefined
  leatherBoots?: boolean | undefined
  fallDistance?: number | undefined
}

// Powder snow's collision for a mover whose feet are at or above the cell's top and that is not descending: a mover
// that has fallen more than 2.5 lands on a 0.9 high box (and sinks in after), one in leather boots stands on the whole
// cube, anything else goes through.
const POWDER_SNOW_TOP_TOLERANCE = f(-1.1920929e-7)
const POWDER_SNOW_FALL = 2.5
const POWDER_SNOW_LANDING: Shape[] = [[0, 0, 0, 1, f(0.9), 1]]
export function powderSnowShapes (mover: Mover, y: number): Shape[] {
  if (f(f(y + 1) + POWDER_SNOW_TOP_TOLERANCE) > mover.aabb.minY || (mover.descendSnow ?? mover.descend)) return NO_SHAPE
  if (mover.fallDistance! > POWDER_SNOW_FALL) return POWDER_SNOW_LANDING
  return mover.leatherBoots ? FULL_BLOCK : NO_SHAPE
}

// A scaffolding cell collides as a full cube for a mover standing on or above its top and over its footprint, unless
// the mover is descending: that is how a player stands on a scaffolding tower it can otherwise climb through.
function scaffoldingSupports (mover: Mover, x: number, y: number, z: number): boolean {
  const a = mover.aabb
  return !mover.descend && a.minY >= f(f(y + 1) + SCAFFOLDING_TOP_TOLERANCE) &&
    a.maxX > x && x + 1 > a.minX && a.maxZ > z && z + 1 > a.minZ
}

// A fence's arm toward each side, relative to its cell: 1.5 high, as its post.
const FENCE_ARMS: ReadonlyArray<[number, number, Shape]> = [
  [-1, 0, [0, 0, 0.375, 0.375, 1.5, 0.625]],
  [1, 0, [0.625, 0, 0.375, 1, 1.5, 0.625]],
  [0, -1, [0.375, 0, 0, 0.625, 1.5, 0.375]],
  [0, 1, [0.375, 0, 0.625, 0.625, 1.5, 1]]
]

function isFence (block: Block | null | undefined): boolean {
  return /_fence$/.test(blockName(block))
}

function isFullCube (block: Block | null | undefined): boolean {
  const shapes = blockShapes(block)
  return shapes.length === 1 && shapes.every(shape => shape.every((v, i) => v === (i < 3 ? 0 : 1)))
}

// A block's collision boxes in the world: its own, and for a fence an arm toward each neighbouring fence or full cube
// (the connections are the neighbours', not the block's state, up to 1.26.4x; where the state carries them the arms
// repeat boxes it already has).
export function worldShapes (world: World, block: Block | null | undefined, x: number, y: number, z: number): Shape[] {
  const own = blockShapes(block)
  if (!isFence(block)) return own
  const shapes = [...own]
  for (const [dx, dz, arm] of FENCE_ARMS) {
    const other = blockAt(world, x + dx, y, z + dz)
    if (isFence(other) || isFullCube(other)) shapes.push(arm)
  }
  return shapes
}

// The collision boxes intersecting the query box: the blocks' and the solid entities' the world knows. The search covers
// the cells the padded box touches, starting half a block lower (a fence's collision rises above its cell).
export function collisionBoxes (world: World, query: BoxLike, mover?: Mover): Box[] {
  const boxes: Box[] = []
  const minX = Math.floor(query.minX - QUERY_PADDING)
  const minY = Math.floor(query.minY - 0.5 - QUERY_PADDING)
  const minZ = Math.floor(query.minZ - QUERY_PADDING)
  const maxX = Math.floor(query.maxX + QUERY_PADDING)
  const maxY = Math.floor(query.maxY + QUERY_PADDING)
  const maxZ = Math.floor(query.maxZ + QUERY_PADDING)
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const block = blockAt(world, x, y, z)
        if (mover && blockName(block) === 'scaffolding') {
          if (scaffoldingSupports(mover, x, y, z)) {
            const box = new Box(x, y, z, x + 1, y + 1, z + 1)
            if (box.intersects(query)) boxes.push(box)
          }
          continue
        }
        if (mover && blockName(block) === 'powder_snow') {
          for (const shape of powderSnowShapes(mover, y)) {
            const box = new Box(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5]).offset(x, y, z)
            if (box.intersects(query)) boxes.push(box)
          }
          continue
        }
        for (const shape of worldShapes(world, block, x, y, z)) {
          const box = new Box(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5]).offset(x, y, z)
          if (box.intersects(query)) boxes.push(box)
        }
      }
    }
  }
  for (const solid of world.solidEntityBoxes ? world.solidEntityBoxes(query) : []) {
    const box = new Box(f(solid.minX), f(solid.minY), f(solid.minZ), f(solid.maxX), f(solid.maxY), f(solid.maxZ))
    if (box.intersects(query)) boxes.push(box)
  }
  return boxes
}

// The block the box stands on: the one whose collision shape reaches highest in the thin slab under the feet, or the
// cell at the feet when nothing collides there.
export function standingOnBlock (world: World, aabb: BoxLike, pos: { x: number, z: number }): Block | null | undefined {
  const probe = new Box(aabb.minX, aabb.minY - 0.01, aabb.minZ, aabb.maxX, aabb.minY, aabb.maxZ)
  let tallest: Block | null | undefined = null
  let top = -Infinity
  for (let y = Math.floor(probe.minY) - 1; y <= Math.floor(probe.maxY); y++) {
    for (let z = Math.floor(probe.minZ); z <= Math.floor(probe.maxZ); z++) {
      for (let x = Math.floor(probe.minX); x <= Math.floor(probe.maxX); x++) {
        const block = blockAt(world, x, y, z)
        for (const shape of blockShapes(block)) {
          const box = new Box(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5]).offset(x, y, z)
          if (box.intersects(probe) && box.maxY > top) {
            top = box.maxY
            tallest = block
          }
        }
      }
    }
  }
  return tallest || blockAt(world, pos.x, aabb.minY, pos.z)
}

// The union of a block's collision boxes in world coordinates, or null when it has none.
export function blockBounds (block: Block | null | undefined, x: number, y: number, z: number): Box | null {
  const shapes = blockShapes(block)
  if (shapes.length === 0) return null
  const out = new Box(FLT_MAX, FLT_MAX, FLT_MAX, -FLT_MAX, -FLT_MAX, -FLT_MAX)
  for (const s of shapes) {
    out.minX = Math.min(f(s[0] + x), out.minX)
    out.minY = Math.min(f(s[1] + y), out.minY)
    out.minZ = Math.min(f(s[2] + z), out.minZ)
    out.maxX = Math.max(f(s[3] + x), out.maxX)
    out.maxY = Math.max(f(s[4] + y), out.maxY)
    out.maxZ = Math.max(f(s[5] + z), out.maxZ)
  }
  return out.minX < out.maxX && out.minY < out.maxY && out.minZ < out.maxZ ? out : null
}

function centreOf (box: BoxLike): Vec3Like {
  return {
    x: f(box.minX + f(f(box.maxX - box.minX) * 0.5)),
    y: f(box.minY + f(f(box.maxY - box.minY) * 0.5)),
    z: f(box.minZ + f(f(box.maxZ - box.minZ) * 0.5))
  }
}

function distanceSquared (a: Vec3Like, b: Vec3Like): number {
  return f(f(f(a.z - b.z) * f(a.z - b.z)) + f(f(f(a.y - b.y) * f(a.y - b.y)) + f(f(a.x - b.x) * f(a.x - b.x))))
}

// The cell of the block the box stands on, as the stand-on effects (slime, honey) see it: of the blocks whose
// collision bounds cross the plane 0.2 below the feet, under the box's footprint, the one reaching highest (the one
// nearest the plane's centre on a tie), else the cell at the position. Each column is searched downward from a block
// above the plane, and stops below the top of the best block found so far.
export function standingOnCell (world: World, pos: Vec3Like, aabb: BoxLike): Vec3Like {
  const planeY = f(aabb.minY + f(-0.2))
  const plane = new Box(aabb.minX, planeY, aabb.minZ, aabb.maxX, planeY, aabb.maxZ)
  const centre = centreOf(plane)
  let best: Box | null = null
  let bestDistSq = FLT_MAX
  for (let x = Math.floor(f(plane.minX - 1)); x <= Math.floor(f(plane.maxX + 1)); x++) {
    for (let z = Math.floor(f(plane.minZ - 1)); z <= Math.floor(f(plane.maxZ + 1)); z++) {
      let floorY = Math.floor(f(planeY - 1))
      for (let y = Math.floor(f(planeY + 1)); y >= floorY; y--) {
        const bounds = blockBounds(blockAt(world, x, y, z), x, y, z)
        if (!bounds || !plane.intersects(bounds)) continue
        const distSq = distanceSquared(centre, centreOf(bounds))
        if (!best || bounds.maxY > best.maxY || (bounds.maxY === best.maxY && distSq < bestDistSq)) {
          best = bounds
          bestDistSq = distSq
        }
        floorY = Math.max(best.maxY, floorY)
      }
    }
  }
  const corner = best ? { x: best.minX, y: best.minY, z: best.minZ } : pos
  return { x: Math.floor(corner.x), y: Math.floor(corner.y), z: Math.floor(corner.z) }
}

// How a block bounces a landing: slime fully, a bed three quarters; honey (-1) takes a bounce away.
export function restitutionOf (block: Block | null | undefined): number {
  const name = blockName(block)
  if (name === 'slime' || name === 'slime_block') return 1
  if (name === 'bed') return 0.75
  if (name === 'honey_block') return -1
  return 0
}

// The cell of the collision box a landing stands on, among the boxes of the move: the one whose centre is nearest
// below the plane 0.2 under the feet (the nearest to the plane's centre on a tie, the earlier one on an exact tie);
// null when none is below.
export function landedOnCell (shapes: readonly BoxLike[], aabb: BoxLike): Vec3Like | null {
  const planeY = f(aabb.minY + f(-0.2))
  const probe = centreOf(new Box(aabb.minX, planeY, aabb.minZ, aabb.maxX, planeY, aabb.maxZ))
  let best = FLT_MAX
  let won: BoxLike | null = null
  for (const shape of shapes) {
    const centre = centreOf(shape)
    const d = f(planeY - centre.y)
    if (!(d >= 0)) continue
    if (best > d) {
      best = d
      won = shape
    } else if (won && d === best && distanceSquared(centreOf(won), probe) > distanceSquared(centre, probe)) {
      won = shape
    }
  }
  if (!won || !(won.minX < won.maxX && won.minY < won.maxY && won.minZ < won.maxZ)) return null
  return { x: Math.floor(won.minX), y: Math.floor(won.minY), z: Math.floor(won.minZ) }
}

// Calls `visit(x, y, z)` for every cell the box, shrunk by `inset` on each face, overlaps; stops at the first `true`.
export function someCell (aabb: BoxLike, inset: number, visit: (x: number, y: number, z: number) => boolean): boolean {
  for (let x = Math.floor(aabb.minX + inset); x <= Math.floor(aabb.maxX - inset); x++) {
    for (let y = Math.floor(aabb.minY + inset); y <= Math.floor(aabb.maxY - inset); y++) {
      for (let z = Math.floor(aabb.minZ + inset); z <= Math.floor(aabb.maxZ - inset); z++) {
        if (visit(x, y, z)) return true
      }
    }
  }
  return false
}
