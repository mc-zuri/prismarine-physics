// Elytra gliding, operation for operation: lift from the pitch, fall speed traded for forward speed while descending,
// the nose-down dive, steering a tenth of the way toward the entry speed along the look direction, the firework
// boost, then the drag.
import { f } from '../math/float.ts'
import { DEG_TO_RAD, tableCosRad, tableSinRad, type Vec3Like } from '../math/rotation.ts'

const DRAG_XZ = f(0.99000001)
const DRAG_Y = f(0.98000002)
const GRAVITY = f(-0.079999998)
const SLOW_FALLING_GRAVITY = f(-0.0099999998)

// One glide tick of `vel` (in place). `look` is the unit look direction, `pitchDeg` the pitch in degrees.
export function glide (vel: Vec3Like, pitchDeg: number, look: Vec3Like, slowFalling: boolean, fireworkBoost: boolean): void {
  let dx = vel.x
  let dy = vel.y
  let dz = vel.z
  const entrySpeedXZ = f(Math.sqrt(f(f(dx * dx) + f(dz * dz))))
  const radPitch = f(pitchDeg * DEG_TO_RAD)
  const horizontalSquared = f(f(look.x * look.x) + f(look.z * look.z))
  const lenXZ = f(Math.sqrt(horizontalSquared))
  const len = f(Math.sqrt(f(f(f(look.x * look.x) + f(look.y * look.y)) + f(look.z * look.z))))
  const cosPitch = tableCosRad(radPitch)
  const lift = f(f(Math.min(f(1.0), f(len / f(0.40000001))) * cosPitch) * cosPitch)
  const gravity = slowFalling ? SLOW_FALLING_GRAVITY : GRAVITY
  dy = f(dy - f(f(f(f(0.75) * lift) + f(-1.0)) * gravity))
  // fall speed traded for forward speed, only while descending
  if (horizontalSquared > 0 && dy < 0) {
    const traded = f(lift * f(f(-0.1) * dy))
    dx = f(f(f(look.x * traded) / lenXZ) + dx)
    dz = f(f(f(look.z * traded) / lenXZ) + dz)
    dy = f(dy + traded)
  }
  // nose-down dive: `dive` is negative for a negative pitch, so the add on y costs height
  if (radPitch < 0) {
    const dive = f(f(tableSinRad(radPitch) * entrySpeedXZ) * f(-0.039999999))
    dx = f(dx - f(f(look.x * dive) / lenXZ))
    dz = f(dz - f(f(dive * look.z) / lenXZ))
    dy = f(f(f(3.2) * dive) + dy)
  }
  // steering toward the entry speed along the look direction
  if (horizontalSquared > 0) {
    const priorZ = dz
    dx = f(f(f(f(f(look.x / lenXZ) * entrySpeedXZ) - dx) * f(0.1)) + dx)
    dz = f(f(f(f(f(look.z / lenXZ) * entrySpeedXZ) - priorZ) * f(0.1)) + priorZ)
  }
  if (fireworkBoost) {
    const boostZ = f(f(f(f(look.z * f(1.5)) - dz) * f(0.5)) + f(look.z * f(0.1)))
    const boostY = f(f(f(f(look.y * f(1.5)) - dy) * f(0.5)) + f(look.y * f(0.1)))
    dx = f(f(f(f(f(f(1.5) * look.x) - dx) * f(0.5)) + f(look.x * f(0.1))) + dx)
    dy = f(dy + boostY)
    dz = f(boostZ + dz)
  }
  vel.x = f(dx * DRAG_XZ)
  vel.y = f(dy * DRAG_Y)
  vel.z = f(dz * DRAG_XZ)
}
