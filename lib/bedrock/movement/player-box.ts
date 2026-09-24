// The player's collision box. The float32 box is the source of truth and the position is derived from it: the feet
// are its floor, x and z its centre. The box is kept on the player's state and rebuilt when something else moved the
// player (a new PlayerState, a teleport, a correction).
import { Vec3 } from 'vec3'
import { Box, type BoxLike } from '../math/box.ts'
import { f } from '../math/float.ts'
import type { BedrockState, Player, Vec3Like, World } from '../types.ts'
import { scaffoldingUnder } from '../world/climbables.ts'

// An entity's box size: width, height, and the offset of its floor below the position.
export interface Dimensions { width: number, height: number, offset?: number }

// The box of an entity at `position`: centred on x and z, its floor the position less the vertical offset and its
// ceiling that floor plus the height (not the position plus the height less the offset, a different float32).
export function boxAround (position: Vec3Like, dimensions: Dimensions): BoxLike {
  const half = f(f(dimensions.width) * 0.5)
  const minY = f(f(position.y) - f(dimensions.offset || 0))
  return {
    minX: f(f(position.x) - half),
    minY,
    minZ: f(f(position.z) - half),
    maxX: f(f(position.x) + half),
    maxY: f(minY + f(dimensions.height)),
    maxZ: f(f(position.z) + half)
  }
}

// Whether the box was last built or moved at the player's current position.
export function boxIsCurrent (st: BedrockState | undefined, pos: Vec3Like): boolean {
  return !!(st && st.anchor && st.anchor.x === pos.x && st.anchor.y === pos.y && st.anchor.z === pos.z)
}

// The box at `height`: resized around its centre on a pose change (the feet stay, x and z re-derived in float32), or
// rebuilt around the position when something else moved the player. Returns the player's state.
export function ensureBox (entity: Player, height: number, halfWidth: number): BedrockState {
  const st = entity.bedrock
  const pos = entity.pos
  const w = f(halfWidth)
  if (st && boxIsCurrent(st, pos)) {
    if (st.height !== height) {
      const aabb = st.aabb!
      const cx = f((aabb.minX + aabb.maxX) * 0.5)
      const cz = f((aabb.minZ + aabb.maxZ) * 0.5)
      aabb.minX = f(cx - w)
      aabb.maxX = f(cx + w)
      aabb.minZ = f(cz - w)
      aabb.maxZ = f(cz + w)
      aabb.maxY = f(aabb.minY + f(height))
      st.height = height
      pos.x = f((aabb.minX + aabb.maxX) * 0.5)
      pos.z = f((aabb.minZ + aabb.maxZ) * 0.5)
      st.anchor!.set(pos.x, pos.y, pos.z)
    }
    return st
  }
  const state = st || (entity.bedrock = {})
  state.aabb = Box.from(boxAround(pos, { width: f(w * 2), height, offset: 0 }))
  state.height = height
  state.anchor = new Vec3(pos.x, pos.y, pos.z)
  return state
}

// Forgets the box, so the next tick rebuilds it around the position.
export function dropBox (st: BedrockState): void {
  st.aabb = undefined
  st.anchor = new Vec3(NaN, NaN, NaN)
}

// Moves the box by the applied movement (each axis that moved) and the position with it.
export function applyMovementToBox (entity: Player, applied: Vec3Like): void {
  const st = entity.bedrock!
  const aabb = st.aabb!
  const pos = entity.pos
  if (applied.x !== 0) {
    aabb.minX = f(aabb.minX + applied.x)
    aabb.maxX = f(aabb.maxX + applied.x)
    pos.x = f((aabb.minX + aabb.maxX) * 0.5)
  }
  if (applied.y !== 0) {
    aabb.minY = f(aabb.minY + applied.y)
    aabb.maxY = f(aabb.maxY + applied.y)
    pos.y = aabb.minY
  }
  if (applied.z !== 0) {
    aabb.minZ = f(aabb.minZ + applied.z)
    aabb.maxZ = f(aabb.maxZ + applied.z)
    pos.z = f((aabb.minZ + aabb.maxZ) * 0.5)
  }
  st.anchor!.set(pos.x, pos.y, pos.z)
}

// The facts of the move a scaffolding catch reads.
export interface CatchFacts {
  requested: Vec3Like
  applied: Vec3Like
  preMoveY: number
  startedOnGround: boolean
  sneaking: boolean
  jumping: boolean
}

// Scaffolding has no collision, but a player falling past the top of a scaffolding column is caught on it: the fall
// crossed a whole-block height with scaffolding under the whole footprint below it, and the player was falling from
// above (or stood on the column's second layer). Moves the box onto the top and returns true when caught.
export function catchOnScaffolding (world: World, entity: Player, facts: CatchFacts): boolean {
  const { requested, applied, preMoveY } = facts
  if (applied.y !== requested.y || requested.y >= 0 || facts.sneaking || facts.jumping) return false
  const candidate = Math.floor(preMoveY + 1e-5)
  if (!(candidate > entity.pos.y && candidate <= preMoveY + 1e-5)) return false
  const st = entity.bedrock!
  const aabb = st.aabb!
  if (!scaffoldingUnder(world, aabb, candidate - 1)) return false
  const caught = candidate < preMoveY || !scaffoldingUnder(world, aabb, candidate - 2) || facts.startedOnGround
  if (!caught) return false
  const top = f(candidate)
  aabb.minY = top
  aabb.maxY = f(top + f(st.height!))
  entity.pos.y = top
  st.anchor!.y = top
  return true
}
