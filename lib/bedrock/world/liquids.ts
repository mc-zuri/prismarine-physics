// Water and lava: which cells hold them, whether a box or a point is in them, and the push of flowing liquid.
import type { BoxLike } from '../math/box.ts'
import { f } from '../math/float.ts'
import type { Block, Vec3Like, World } from '../types.ts'
import { blockAt, blockName, blockShapes } from './blocks.ts'

// The water and lava blocks, by name (bubble columns are water). Names that merely contain the word -- a lily pad
// ('waterlily'), an underwater torch -- are not liquids.
const WATER_NAMES = new Set(['water', 'flowing_water', 'bubble_column'])
const LAVA_NAMES = new Set(['lava', 'flowing_lava'])
// Whether a block name is water.
export function isWaterName (name: string): boolean { return WATER_NAMES.has(name) }
// Whether a block name is lava.
export function isLavaName (name: string): boolean { return LAVA_NAMES.has(name) }

// The liquid a cell holds: its block when that is water or lava, else the liquid in its second layer (a waterlogged
// block's water, such as seagrass'); null when it holds none.
export function cellLiquid (block: Block | null | undefined): Block | null {
  for (const candidate of [block, block?.liquid]) {
    const name = blockName(candidate)
    if (isWaterName(name) || isLavaName(name)) return candidate!
  }
  return null
}

// One axis of a box shrunk by `by` on both faces; an axis too short to shrink collapses to its midpoint (so the
// 0.6-high swim pose samples the plane through its centre).
export function shrinkAxis (min: number, max: number, by: number): [number, number] {
  const lo = f(min + by)
  const hi = f(max - by)
  if (hi < lo) {
    const mid = f(f(min + max) * 0.5)
    return [mid, mid]
  }
  return [lo, hi]
}

// Whether any cell of the box, shrunk by (horizontal, vertical, horizontal), holds a block whose name passes `test`.
// The default shrink is the one the in-water test uses.
export function liquidInInnerBox (world: World, aabb: BoxLike, test: (name: string) => boolean, horizontalShrink = 0.001, verticalShrink = 0.401): boolean {
  const [xa, xb] = shrinkAxis(aabb.minX, aabb.maxX, horizontalShrink)
  const [ya, yb] = shrinkAxis(aabb.minY, aabb.maxY, verticalShrink)
  const [za, zb] = shrinkAxis(aabb.minZ, aabb.maxZ, horizontalShrink)
  for (let x = Math.floor(xa); x <= Math.floor(xb); x++) {
    for (let y = Math.floor(ya); y <= Math.floor(yb); y++) {
      for (let z = Math.floor(za); z <= Math.floor(zb); z++) {
        if (test(blockName(cellLiquid(blockAt(world, x, y, z))))) return true
      }
    }
  }
  return false
}

// The block state's liquid depth (0 = source, 1..7 flowing, 8+ falling) where the world carries it; a world that does
// not reads every liquid cell as a source.
export function liquidDepthOf (block: Block | null | undefined): number {
  const properties = block && (typeof block.getProperties === 'function' ? block.getProperties() : block._properties)
  const depth = properties && properties.liquid_depth
  return Number.isInteger(depth) ? depth as number : 0
}

const LIQUID_SURFACE_OFFSET = f(-0.11111111)

// The height of a liquid cell's surface: the top of the cell less the share the liquid does not fill. A source fills
// it to within float32 rounding of the top, a flowing cell of depth d < 8 stops (d + 1) / 9 short, and a falling one
// counts as a source.
export function liquidSurfaceHeight (depth: number, cellY: number): number {
  const scaled = depth < 8 ? depth + 1 : 1
  return f(f((cellY + 1) | 0) - f(f(scaled / 9) + LIQUID_SURFACE_OFFSET))
}

// Whether a point is under water: its cell must be water AND the point below that cell's surface, so an eye in the
// top of a flowing cell is not under water. The cell is taken after a float32 cast of each coordinate. `waterlogged`:
// whether the water a waterlogged block holds counts (breathing reads the block itself only).
export function pointInWater (world: World, x: number, y: number, z: number, waterlogged = true): boolean {
  const py = f(y)
  const cellY = Math.floor(py)
  const block = blockAt(world, f(x), cellY, f(z))
  const liquid = waterlogged ? cellLiquid(block) : block
  return isWaterName(blockName(liquid)) && liquidSurfaceHeight(liquidDepthOf(liquid), cellY) > py
}

// In water, in lava.
// Whether any cell the box covers holds water or lava. A cell counts when the box reaches into it: the range is
// [floor(min), ceil(max)) on each axis, so a face lying on a cell boundary does not take in the cell beyond it.
export function containsLiquid (world: World, box: BoxLike): boolean {
  for (let x = Math.floor(box.minX); x < Math.ceil(box.maxX); x++) {
    for (let z = Math.floor(box.minZ); z < Math.ceil(box.maxZ); z++) {
      for (let y = Math.floor(box.minY); y < Math.ceil(box.maxY); y++) {
        if (cellLiquid(blockAt(world, x, y, z))) return true
      }
    }
  }
  return false
}

export interface LiquidSense { isInWater: boolean, isInLava: boolean }

// In water, else in lava, on the box (water wins).
export function senseLiquids (world: World, aabb: BoxLike): LiquidSense {
  const isInWater = liquidInInnerBox(world, aabb, isWaterName)
  return { isInWater, isInLava: !isInWater && liquidInInnerBox(world, aabb, isLavaName) }
}

// ---- flowing liquid -----------------------------------------------------------------------------------------------
// A liquid pushes along the direction it flows: each liquid cell of the box flows from its depth toward shallower
// neighbours (and toward a drop into liquid below an open neighbour); a falling cell beside a wall also flows down.
// The cells' directions are summed and the sum's direction, times 0.014 in water or 0.0035 in lava, is added to the
// velocity. Nothing flows unless one of the cells, or a liquid cell just outside the box, is flowing.

export type Liquid = 'water' | 'lava'

const FLOW_SCALE: Readonly<Record<Liquid, number>> = { water: f(0.014), lava: f(0.0035000001) }
const FLOW_EPSILON = f(0.000099999997)
const FALLING_PULL = f(-6)
// The horizontal neighbours in the order they are read: north, east, south, west.
const FACES: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]]

function isLiquid (name: string, liquid: Liquid): boolean {
  return liquid === 'water' ? isWaterName(name) : isLavaName(name)
}

// The liquid depth of a cell of that liquid (0 source, 1..7 flowing, 8+ falling), or -1 when the cell holds another.
export function depthAt (world: World, x: number, y: number, z: number, liquid: Liquid): number {
  const held = cellLiquid(blockAt(world, x, y, z))
  return isLiquid(blockName(held), liquid) ? liquidDepthOf(held) : -1
}

function blocksMotion (world: World, x: number, y: number, z: number): boolean {
  return blockShapes(blockAt(world, x, y, z)).length > 0
}

// A vector scaled to unit length, or zero when it is shorter than 1e-4.
export function unitOrZero (x: number, y: number, z: number): Vec3Like {
  const length = f(Math.sqrt(f(f(z * z) + f(f(y * y) + f(x * x)))))
  if (!(length >= FLOW_EPSILON)) return { x: 0, y: 0, z: 0 }
  return { x: f(x / length), y: f(y / length), z: f(z / length) }
}

// A depth as the flow reads it: a falling cell (8 and up) counts as a source.
function settled (depth: number): number {
  return depth >= 8 ? 0 : depth
}

// The unit direction a liquid cell flows in.
export function cellFlow (world: World, x: number, y: number, z: number, liquid: Liquid): Vec3Like {
  const depth = settled(depthAt(world, x, y, z, liquid))
  let fx = 0
  let fz = 0
  for (const [dx, dz] of FACES) {
    const nx = x + dx
    const nz = z + dz
    const neighbour = settled(depthAt(world, nx, y, nz, liquid))
    if (neighbour >= 0 && !blocksMotion(world, nx, y, nz) && !blocksMotion(world, x, y, z)) {
      fx = f(fx + (neighbour - depth) * dx)
      fz = f(fz + (neighbour - depth) * dz)
      continue
    }
    if (blocksMotion(world, nx, y, nz)) continue
    const under = settled(depthAt(world, nx, y - 1, nz, liquid))
    if (under < 0) continue
    fx = f(fx + (under - depth + 8) * dx)
    fz = f(fz + (under - depth + 8) * dz)
  }
  let fy = 0
  if (depthAt(world, x, y, z, liquid) >= 8) {
    for (const [dx, dz] of FACES) {
      if (!blocksMotion(world, x + dx, y, z + dz) && !blocksMotion(world, x + dx, y + 1, z + dz)) continue
      const unit = unitOrZero(fx, fy, fz)
      fx = unit.x
      fz = unit.z
      fy = f(unit.y + FALLING_PULL)
      break
    }
  }
  return unitOrZero(fx, fy, fz)
}

interface LiquidCell { x: number, y: number, z: number, depth: number, edges: number }

const EDGE_NORTH = 4
const EDGE_SOUTH = 8
const EDGE_WEST = 16
const EDGE_EAST = 32

// The cells of that liquid in the box's cell range, [floor(min), floor(max + 1)) on each axis (y, then z, then x),
// with the range faces each one is on; returns whether there is one.
function scanLiquid (world: World, box: BoxLike, liquid: Liquid, cells: LiquidCell[] | null): boolean {
  const lo = { x: Math.floor(box.minX), y: Math.floor(box.minY), z: Math.floor(box.minZ) }
  const hi = { x: Math.floor(f(box.maxX + 1)), y: Math.floor(f(box.maxY + 1)), z: Math.floor(f(box.maxZ + 1)) }
  let found = false
  for (let y = lo.y; y < hi.y; y++) {
    for (let z = lo.z; z < hi.z; z++) {
      for (let x = lo.x; x < hi.x; x++) {
        const block = blockAt(world, x, y, z)
        if (!isLiquid(blockName(block), liquid)) continue
        if (!cells) return true
        const edges = (z === lo.z ? EDGE_NORTH : 0) | (z === hi.z - 1 ? EDGE_SOUTH : 0) | (x === lo.x ? EDGE_WEST : 0) | (x === hi.x - 1 ? EDGE_EAST : 0)
        cells.push({ x, y, z, depth: liquidDepthOf(block), edges })
        found = true
      }
    }
  }
  return found
}

function shrunk (aabb: BoxLike, horizontal: number, vertical: number): BoxLike {
  const [minX, maxX] = shrinkAxis(aabb.minX, aabb.maxX, horizontal)
  const [minY, maxY] = shrinkAxis(aabb.minY, aabb.maxY, vertical)
  const [minZ, maxZ] = shrinkAxis(aabb.minZ, aabb.maxZ, horizontal)
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

// Whether a liquid cell just outside the box's range, beside a cell on the range's edge, is flowing.
function flowingBeside (world: World, cells: readonly LiquidCell[], liquid: Liquid): boolean {
  return cells.some(c =>
    ((c.edges & EDGE_NORTH) !== 0 && depthAt(world, c.x, c.y, c.z - 1, liquid) > 0) ||
    ((c.edges & EDGE_EAST) !== 0 && depthAt(world, c.x + 1, c.y, c.z, liquid) > 0) ||
    ((c.edges & EDGE_SOUTH) !== 0 && depthAt(world, c.x, c.y, c.z + 1, liquid) > 0) ||
    ((c.edges & EDGE_WEST) !== 0 && depthAt(world, c.x - 1, c.y, c.z, liquid) > 0))
}

// The push of flowing water or lava on the velocity (lava when the box is in lava, else water). The cells are those of
// the box shrunk as for sensing: by (0.1, 0.4, 0.1) for lava, (0.001, 0.401, 0.001) for water.
export function applyLiquidFlow (world: World, aabb: BoxLike, vel: Vec3Like): void {
  const cells: LiquidCell[] = []
  const inLava = scanLiquid(world, shrunk(aabb, 0.1, 0.4), 'lava', cells)
  const inWater = scanLiquid(world, shrunk(aabb, 0.001, 0.401), 'water', inLava ? null : cells)
  if (!inWater && !inLava) return
  const liquid: Liquid = inLava ? 'lava' : 'water'
  if (!cells.some(c => c.depth > 0) && !flowingBeside(world, cells, liquid)) return
  let fx = 0
  let fy = 0
  let fz = 0
  for (const c of cells) {
    const flow = cellFlow(world, c.x, c.y, c.z, liquid)
    fx = f(fx + flow.x)
    fy = f(fy + flow.y)
    fz = f(fz + flow.z)
  }
  if (!(f(f(fz * fz) + f(f(fy * fy) + f(fx * fx))) > 0)) return
  const unit = unitOrZero(fx, fy, fz)
  const scale = FLOW_SCALE[liquid]
  vel.x = f(vel.x + f(unit.x * scale))
  vel.y = f(vel.y + f(unit.y * scale))
  vel.z = f(vel.z + f(unit.z * scale))
}
