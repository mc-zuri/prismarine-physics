// Blocks that slow a move down while the player is inside them: the requested move is scaled lane by lane and the
// velocity is dropped after the move.
import type { BoxLike } from '../math/box.ts'
import { f, VELOCITY_EPSILON } from '../math/float.ts'
import type { SlowdownBlock, Vec3Like, World } from '../types.ts'
import { blockAt, blockName, someCell } from './blocks.ts'

// The move multiplier of each slowdown block, per axis.
export const SLOWDOWN_MULTIPLIERS: Readonly<Record<SlowdownBlock, Vec3Like>> = {
  powder_snow: { x: f(0.9), y: f(1.5), z: f(0.9) },
  web: { x: f(0.25), y: f(0.05), z: f(0.25) },
  sweet_berry_bush: { x: f(0.80000001), y: f(0.75), z: f(0.80000001) }
}

// The order overlapping blocks are folded in.
export const SLOWDOWN_ORDER: readonly SlowdownBlock[] = ['powder_snow', 'web', 'sweet_berry_bush']

function slowdownKind (name: string): SlowdownBlock | null {
  if (name === 'cobweb' || name === 'web') return 'web'
  if (name === 'powder_snow' || name === 'sweet_berry_bush') return name
  return null
}

// The slowdown blocks the box, shrunk by 0.001, overlaps.
export function slowdownBlocksIn (world: World, aabb: BoxLike): Set<SlowdownBlock> {
  const found = new Set<SlowdownBlock>()
  someCell(aabb, 0.001, (x, y, z) => {
    const kind = slowdownKind(blockName(blockAt(world, x, y, z)))
    if (kind) found.add(kind)
    return false
  })
  return found
}

// A multiplier still at zero on every lane (within 2^-23).
export function slowdownIsZero (value: Vec3Like): boolean {
  return Math.abs(value.x) < VELOCITY_EPSILON && Math.abs(value.y) < VELOCITY_EPSILON && Math.abs(value.z) < VELOCITY_EPSILON
}

// Folds one block's multiplier into the running one: it replaces a multiplier still at zero, and otherwise each lane
// keeps the smaller (the held lane when the comparison is unordered) -- overlapping blocks take the per-lane minimum,
// not the product.
export function foldSlowdown (value: Vec3Like, modifier: Vec3Like): Vec3Like {
  if (slowdownIsZero(value)) return { x: modifier.x, y: modifier.y, z: modifier.z }
  return {
    x: modifier.x < value.x ? modifier.x : value.x,
    y: modifier.y < value.y ? modifier.y : value.y,
    z: modifier.z < value.z ? modifier.z : value.z
  }
}

// A player with the Weaving effect, inside cobweb and nothing else that slows, is slowed this much instead.
export const WEAVING_WEB_MULTIPLIER: Readonly<Vec3Like> = { x: f(0.5), y: f(0.25), z: f(0.5) }

// The multiplier of a set of blocks, folded in the fixed order (all zero when the set is empty); with `weaving`, cobweb
// alone slows less.
export function slowdownMultiplier (blocks: ReadonlySet<SlowdownBlock>, weaving = false): Vec3Like {
  if (weaving && blocks.has('web') && !blocks.has('powder_snow') && !blocks.has('sweet_berry_bush')) return { ...WEAVING_WEB_MULTIPLIER }
  let multiplier: Vec3Like = { x: 0, y: 0, z: 0 }
  for (const kind of SLOWDOWN_ORDER) if (blocks.has(kind)) multiplier = foldSlowdown(multiplier, SLOWDOWN_MULTIPLIERS[kind])
  return multiplier
}

// The move scaled by the multiplier, or null when the multiplier is exactly zero on every lane (either sign).
export function applySlowdown (speed: Vec3Like, value: Vec3Like): Vec3Like | null {
  if (value.x === 0 && value.y === 0 && value.z === 0) return null
  return { x: f(f(speed.x) * f(value.x)), y: f(f(speed.y) * f(value.y)), z: f(f(speed.z) * f(value.z)) }
}
