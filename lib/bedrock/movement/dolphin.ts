// Dolphin's Grace: a swimming player looks for dolphins every few seconds, and one within reach gives it a boost that
// doubles its swim speed while it lasts.
import { Box, type BoxLike } from '../math/box.ts'
import { f } from '../math/float.ts'
import { durationCovers } from './movement-effects.ts'
import { DEPTH_STRIDER_MAX } from './travel.ts'

// The ticks between two looks for dolphins, and how long the boost lasts from one.
export const DOLPHIN_SCAN_TICKS = 60
export const DOLPHIN_BOOST_TICKS = 60
// How far around the player's box a dolphin counts.
export const DOLPHIN_REACH = 5
// The swim speed multiplier while boosted.
export const DOLPHIN_SWIM_MULTIPLIER = 2

// The scan countdown of a swimming player: whether it looks this tick, and the count after. Not swimming, it holds.
export function scanTick (timer: number, swimming: boolean): { timer: number, scan: boolean } {
  if (!swimming) return { timer, scan: false }
  if (timer > 1) return { timer: timer - 1, scan: false }
  return { timer: DOLPHIN_SCAN_TICKS, scan: true }
}

// The box a dolphin is looked for in: the player's grown by the reach on every face.
export function dolphinQueryBox (box: BoxLike): Box {
  const r = DOLPHIN_REACH
  return new Box(f(box.minX - r), f(box.minY - r), f(box.minZ - r), f(box.maxX + r), f(box.maxY + r), f(box.maxZ + r))
}

// The boost after a look: renewed to its full length when one was found and what is left is shorter.
export function renewBoost (boost: number, found: boolean): number {
  return found && !durationCovers(boost, DOLPHIN_BOOST_TICKS) ? DOLPHIN_BOOST_TICKS : boost
}

// The swim speed multiplier: doubled swimming while boosted.
export function swimSpeedMultiplier (swimming: boolean, boost: number): number {
  return swimming && boost !== 0 ? DOLPHIN_SWIM_MULTIPLIER : 1
}

// The boosted water speed: the multiplier scaled from 0.7 up to 1 by the Depth Strider level over 3.
export function boostedWaterSpeed (speed: number, multiplier: number, depthStrider: number): number {
  const level = Math.min(Math.max(depthStrider || 0, 0), DEPTH_STRIDER_MAX)
  const shaped = f(f(f(f(level) / DEPTH_STRIDER_MAX) * f(0.3)) + f(0.7))
  return f(speed * f(multiplier * shaped))
}
