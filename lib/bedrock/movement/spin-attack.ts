// The riptide spin attack: releasing a charged riptide trident launches the player along its look, in the horizontal
// pose, until it hits something, runs into a wall, lands or runs out of time.
import { f } from '../math/float.ts'
import { DEG_TO_RAD, tableCosRad, tableSinRad } from '../math/rotation.ts'
import type { Vec3Like } from '../types.ts'

// On the ground, the launch's rise in water is undone from the water drag and scaled by the air's, and out of water
// it is lifted by this.
const WATER_DRAG = f(0.80000001)
const AIR_DRAG = f(0.98000002)
const GROUND_LIFT = f(0.079999998)
// Every mob hit bounces the velocity back by this.
export const SPIN_HIT_BOUNCE = f(-0.2)
// The spin ends once its counter passes this, or reaches the landing minimum on the ground.
const SPIN_MAX_TICKS = 18
const SPIN_MIN_TICKS_ON_GROUND = 5

// The facts the launch reads: the rotation in degrees, the riptide level, and the previous tick's ground and water
// state (in water with the head out).
export interface LaunchFacts {
  pitch: number
  yaw: number
  level: number
  onGround: boolean
  bodyInWater: boolean
}

// The velocity a launch adds: the normalised look direction times (level + 1) * 0.75, its rise adjusted on the
// ground. The look comes from the sine table, so it is never too short to normalise.
export function riptideImpulse (facts: LaunchFacts): Vec3Like {
  const p = f(facts.pitch * DEG_TO_RAD)
  const y = f(facts.yaw * DEG_TO_RAD)
  const sp = tableSinRad(p)
  const cp = tableCosRad(p)
  const sy = tableSinRad(y)
  const cy = tableCosRad(y)
  const lx = f(-sy * cp)
  const lz = f(cy * cp)
  const length = f(Math.sqrt(f(f(lz * lz) + f(f(sp * sp) + f(lx * lx)))))
  const nx = f(lx / length)
  const ny = f(-sp / length)
  const nz = f(lz / length)
  const speed = f(f(f(facts.level + 1) * 0.25) * 3)
  const impulse = { x: f(speed * nx), y: f(speed * ny), z: f(speed * nz) }
  if (facts.onGround) impulse.y = facts.bodyInWater ? f(f(impulse.y / WATER_DRAG) * AIR_DRAG) : f(impulse.y + GROUND_LIFT)
  return impulse
}

// The spin's state between ticks.
export interface SpinState {
  spinning: boolean
  spinTicks: number
}

// The facts the spin's end reads: the mobs hit this tick, and the previous move's wall and ground flags.
export interface SpinFacts {
  hits: number
  horizontalCollision: boolean
  onGround: boolean
}

// Each mob hit scales the velocity (in place) by -0.2, one hit at a time.
export function bounceOffHits (vel: Vec3Like, hits: number): void {
  for (let i = 0; i < hits; i++) {
    vel.x = f(vel.x * SPIN_HIT_BOUNCE)
    vel.y = f(vel.y * SPIN_HIT_BOUNCE)
    vel.z = f(vel.z * SPIN_HIT_BOUNCE)
  }
}

// One tick of a spin (in place); returns whether it ended. A hit ends it, as does a wall; the counter then ends it
// after 19 ticks, or from the sixth on the ground. A player not spinning holds the counter at zero.
export function stepSpin (state: SpinState, facts: SpinFacts): boolean {
  if (!state.spinning) {
    state.spinTicks = 0
    return false
  }
  let ended = false
  const end = (): void => {
    state.spinTicks = 0
    state.spinning = false
    ended = true
  }
  if (facts.hits > 0 || facts.horizontalCollision) end()
  const counted = state.spinTicks++
  if (counted > SPIN_MAX_TICKS || (counted >= SPIN_MIN_TICKS_ON_GROUND && facts.onGround)) end()
  return ended
}
