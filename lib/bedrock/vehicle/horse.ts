// A horse the player steers (a tamed, saddled horse, donkey or mule, which the client predicts): the jump the rider
// charges by holding jump, the turn toward the rider's look, the rider's move as the mount takes it, and the power
// jump. The travel, the move and the fall are the vehicle tick's (tick/vehicle.ts).
import { f } from '../math/float.ts'
import { tableCosRad, tableSinRad, wrapDegrees } from '../math/rotation.ts'
import type { Vec3Like, XZ } from '../types.ts'

// A steered horse's state between ticks: the charge the rider is holding (its ticks, -10 counting back up after a
// release, and its scale), the jump the release left pending, and whether it is in a jump it has not landed from.
export interface HorseState {
  jumpTicks: number
  jumpScale: number
  pendingJump: number
  jumping: boolean
  // the rider held jump last tick
  wasJumping?: boolean | undefined
}

export function newHorseState (): HorseState {
  return { jumpTicks: 0, jumpScale: 0, pendingJump: 0, jumping: false }
}

// The rider's jump key for one tick, held last tick too: still held, the charge grows (0.1 a tick up to 0.9, then easing
// back toward 0.8); released, the charge is latched as the pending jump and the count parks at -10. A parked count climbs
// back one a tick and clears the scale when it reaches 0.
export function chargeJump (horse: HorseState, held: boolean, wasHeld: boolean): void {
  if (horse.jumpTicks < 0) {
    horse.jumpTicks++
    if (horse.jumpTicks === 0) horse.jumpScale = 0
  }
  // only a key already held last tick charges or releases
  if (!wasHeld) return
  if (held) {
    const ticks = horse.jumpTicks
    horse.jumpTicks = ticks + 1
    horse.jumpScale = ticks > 8 ? f(f(f(2 / (ticks - 8)) * f(0.1)) + f(0.8)) : f((ticks + 1) * f(0.1))
    return
  }
  horse.jumpTicks = -10
  horse.pendingJump = pendingJumpScale(Math.floor(f(horse.jumpScale * 100)))
}

// The pending jump a released charge of `amount` (0..100) makes: 0.4 plus up to 0.4 more, full from 90.
export function pendingJumpScale (amount: number): number {
  if (amount > 89) return 1
  return f(f(f(amount * f(0.4)) / 90) + f(0.4))
}

// The mount turns toward the rider's yaw: 0.7 of the way, less the further it has to turn (at least 0.18 of it); the
// result is wrapped (through float32 +180 and back, which rounds it to the float32 steps near 180).
export function turnToward (current: number, requested: number): number {
  const wide = Math.abs(wrapDegrees(f(requested - current)))
  const rate = f(Math.max(f(0.18), f(f(45 - Math.min(45, wide)) / 90)) * f(0.7))
  return wrapDegrees(f(f(wrapDegrees(f(requested - current)) * rate) + current))
}

// The rider's move as the mount takes it: sideways at half, backward at a quarter.
export function mountMove (move: XZ): XZ {
  return { x: f(f(0.5) * move.x), z: move.z > 0 ? move.z : f(f(0.25) * move.z) }
}

// The power jump: up at the jump strength times the pending jump (0.6 of it, and of the Jump Boost, from a block that
// prevents jumping), plus 0.1 per Jump Boost level; moving forward, also 0.4 of the pending jump along the yaw.
export function powerJump (vel: Vec3Like, yaw: number, strength: number, pending: number, jumpBoost: number, forward: boolean, prevented: boolean): void {
  const slip = prevented ? f(0.60000002) : 1
  const boost = jumpBoost > 0 ? f(f(jumpBoost) * f(0.1)) : 0
  vel.y = f(f(f(f(strength) * pending) * slip) + f(boost * slip))
  if (!forward) return
  // the sine table's, at the yaw in radians
  const radians = f(yaw * f(0.017453292))
  const sin = tableSinRad(radians)
  const cos = tableCosRad(radians)
  vel.x = f(vel.x - f(f(sin * f(0.40000001)) * pending))
  vel.z = f(f(f(cos * f(0.40000001)) * pending) + vel.z)
}
