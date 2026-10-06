// Ladders, vines and scaffolding.
import type { BoxLike } from '../math/box.ts'
import type { ClimbableKind, Vec3Like, World } from '../types.ts'
import { blockAt, blockName } from './blocks.ts'

// Whether any cell of layer `y` under the box's footprint (shrunk by 0.001) is scaffolding.
export function scaffoldingUnder (world: World, aabb: BoxLike, y: number): boolean {
  for (let x = Math.floor(aabb.minX + 0.001); x <= Math.floor(aabb.maxX - 0.001); x++) {
    for (let z = Math.floor(aabb.minZ + 0.001); z <= Math.floor(aabb.maxZ - 0.001); z++) {
      if (blockName(blockAt(world, x, y, z)) === 'scaffolding') return true
    }
  }
  return false
}

// What the player climbs: the block at the feet (a ladder, any vine, scaffolding, powder snow in leather boots), else
// scaffolding anywhere in the feet's layer under the box.
export function climbableAt (world: World, pos: Vec3Like, aabb: BoxLike, leatherBoots = false): ClimbableKind | null {
  const name = blockName(blockAt(world, pos.x, pos.y, pos.z))
  if (name.includes('ladder')) return 'ladder'
  if (name.includes('vine')) return 'vine'
  if (name.includes('scaffolding')) return 'scaffolding'
  if (leatherBoots && name === 'powder_snow') return 'powder_snow'
  return scaffoldingUnder(world, aabb, Math.floor(aabb.minY + 0.001)) ? 'scaffolding' : null
}

// Whether the feet's layer under the box holds a block the player can go up by jumping: scaffolding with something
// other than air or water under it, or powder snow in leather boots (what the client's own check of the flag finds).
export function ascendableAt (world: World, aabb: BoxLike, leatherBoots = false, y = Math.floor(aabb.minY)): boolean {
  for (let x = Math.floor(aabb.minX); x <= Math.floor(aabb.maxX); x++) {
    for (let z = Math.floor(aabb.minZ); z <= Math.floor(aabb.maxZ); z++) {
      const name = blockName(blockAt(world, x, y, z))
      if (name === 'powder_snow' && leatherBoots) return true
      if (name !== 'scaffolding') continue
      const below = blockName(blockAt(world, x, y - 1, z))
      if (below !== 'air' && below !== 'water' && below !== 'flowing_water') return true
    }
  }
  return false
}

// Whether a climb in scaffolding is leaving it sideways: the feet are in scaffolding, the move enters another cell,
// and that cell is not scaffolding. A vertical collision (a ceiling) never counts.
export function exitingScaffolding (world: World, pos: Vec3Like, vel: Vec3Like, collidedVertically: boolean): boolean {
  if (collidedVertically) return false
  const cy = Math.floor(pos.y)
  if (blockName(blockAt(world, pos.x, cy, pos.z)) !== 'scaffolding') return false
  const nx = Math.floor(pos.x + vel.x)
  const nz = Math.floor(pos.z + vel.z)
  if (nx === Math.floor(pos.x) && nz === Math.floor(pos.z)) return false
  return blockName(blockAt(world, nx, cy, nz)) !== 'scaffolding'
}
