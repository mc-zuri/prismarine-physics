// How deep into a block the collision sweep may push a player back out, and how that limit follows the player
// getting stuck. While nothing holds the player the limit is a whole block; once it has been inside a block two moves
// running, or while the server asks for the push toward free space, it drops to the player's minimum (0.01), so a
// player overlapping a block moves through it instead of being shoved out.
import { f } from '../math/float.ts'
import type { Vec3Like } from '../types.ts'

// The state bits: the player always pushes out one way, it penetrated a block on its last move, it did so twice
// running (stuck in a collider), it is a stuck item, and the server asks for the push toward free space.
export const DepenetrationBit = { alwaysOneWay: 1, penetrated: 2, stuckInCollider: 4, stuckItem: 8, pushTowardsClosestSpace: 16 } as const

const ALL_BITS = 0x1f
const ENGAGING = DepenetrationBit.alwaysOneWay | DepenetrationBit.stuckInCollider | DepenetrationBit.pushTowardsClosestSpace
const KEPT_WHEN_FREE = DepenetrationBit.alwaysOneWay | DepenetrationBit.stuckItem | DepenetrationBit.pushTowardsClosestSpace

// A player's minimum limit.
export const MIN_DEPENETRATION = f(0.01)
// A move whose clips add up to this much or more penetrated a block.
export const PENETRATION_EPSILON = f(0.000001)

// The limit on each axis for the state bits: the minimum while a push is engaged (and the player is not a stuck
// item), else a whole block -- never below the minimum.
export function depenetrationLimit (bits: number, min: Vec3Like = { x: MIN_DEPENETRATION, y: MIN_DEPENETRATION, z: MIN_DEPENETRATION }): Vec3Like {
  const engaged = (bits & DepenetrationBit.stuckItem) === 0 && (bits & ENGAGING) !== 0
  const base = engaged ? 0 : 1
  return { x: min.x > base ? min.x : base, y: min.y > base ? min.y : base, z: min.z > base ? min.z : base }
}

// A solid entity (a boat) within this gap of the player's box raises its limit to at least this much on every axis.
export const SOLID_ENTITY_REACH = 2
export const SOLID_ENTITY_DEPENETRATION = f(0.1)

// The limit raised by a nearby solid entity's (the larger per axis).
export function withSolidEntityOverride (limit: Vec3Like): Vec3Like {
  const o = SOLID_ENTITY_DEPENETRATION
  return { x: o > limit.x ? o : limit.x, y: o > limit.y ? o : limit.y, z: o > limit.z ? o : limit.z }
}

// The state bits after a move: the server's push request is taken; a move that penetrated marks the player
// (a second one running marks it stuck); a free move clears both marks.
export function updateDepenetrationBits (bits: number, pushTowardsClosestSpace: boolean, penetrated: boolean): number {
  let next = (pushTowardsClosestSpace ? bits | DepenetrationBit.pushTowardsClosestSpace : bits & ~DepenetrationBit.pushTowardsClosestSpace) & ALL_BITS
  if (penetrated) next = (next & DepenetrationBit.penetrated) !== 0 ? next | DepenetrationBit.stuckInCollider : next | DepenetrationBit.penetrated
  else next &= KEPT_WHEN_FREE
  return next & ALL_BITS
}
