// Angles and directions. The game's 65536-entry sine table drives the view vector and the sprint-jump impulse. Its
// entries are the runtime sinf of i / 10430.378 (see crt.ts): a sin(2 pi i / 65536) differs in the last bit on
// thousands of them, and the values multiply straight into velocities that integrate for thousands of ticks.
import { sineTable } from './crt.ts'
import { f } from './float.ts'

// Any object with x, y and z.
export interface Vec3Like { x: number, y: number, z: number }

// Degrees to radians, as the float32 constant the game uses.
export const DEG_TO_RAD = f(0.017453292)
const F32_PI = f(3.1415927)

const TABLE = sineTable
const DEGREES_TO_INDEX = f(182.04443) // 65536 / 360
const RADIANS_TO_INDEX = f(10430.378) // 65536 / (2 pi)
const QUARTER_TURN = 16384

// The table entry at `index`, wrapped to the table.
export function tableSin (index: number): number {
  return TABLE[index & 0xFFFF]!
}

// Table sine / cosine of an angle in degrees (the scaled angle truncated to an index first).
export function tableSinDeg (deg: number): number { return tableSin(f(deg * DEGREES_TO_INDEX) | 0) }
// Table cosine of an angle in degrees.
export function tableCosDeg (deg: number): number { return tableSin((f(deg * DEGREES_TO_INDEX) | 0) + QUARTER_TURN) }

// Table sine / cosine of an angle in radians. The cosine adds the quarter turn to the scaled float before the
// truncation, which is toward zero, so adding it after would differ for negative angles.
export function tableSinRad (radians: number): number { return tableSin(f(radians * RADIANS_TO_INDEX) | 0) }
// Table cosine of an angle in radians.
export function tableCosRad (radians: number): number { return tableSin(f(f(radians * RADIANS_TO_INDEX) + QUARTER_TURN) | 0) }

// Into (-180, 180] through a +180 / -180 round trip in float32.
export function wrapDegrees (value: number): number {
  let wrapped = f(f(value + 180) % 360)
  if (wrapped < 0) wrapped = f(wrapped + 360)
  return f(wrapped + -180)
}

// From a to b by t, in degrees, the difference wrapped before it is scaled. t = 1 differs from b in the low bits.
export function lerpRotation (a: number, b: number, t: number): number {
  let wrapped = f(f(f(b - a) + 180) % 360)
  if (wrapped < 0) wrapped = f(wrapped + 360)
  return f(f(f(wrapped + -180) * t) + a)
}

// The unit look direction of a pitch and yaw in degrees (pitch > 0 looks down, so y = sin(-pitch)).
export function directionFromRotation (pitchDeg: number, yawDeg: number): Vec3Like {
  const yawRadians = f(f(yawDeg * -DEG_TO_RAD) + -F32_PI)
  const pitchRadians = f(-DEG_TO_RAD * pitchDeg)
  const cosYaw = tableCosRad(yawRadians)
  const sinYaw = tableSinRad(yawRadians)
  const negCosPitch = -tableCosRad(pitchRadians)
  const sinPitch = tableSinRad(pitchRadians)
  return { x: f(negCosPitch * sinYaw), y: sinPitch, z: f(cosYaw * negCosPitch) }
}

// The look direction between two rotations (both lerped by alpha, wrapped).
export function viewBetween (fromYaw: number, fromPitch: number, toYaw: number, toPitch: number, alpha = 1): Vec3Like {
  return directionFromRotation(lerpRotation(fromPitch, toPitch, alpha), lerpRotation(fromYaw, toYaw, alpha))
}

// mineflayer's yaw (radians, 0 = north (-z), counter-clockwise) and pitch (radians, up positive) in Bedrock degrees
// (yaw 0 = south (+z), clockwise; pitch down positive).
export function javaYawToBedrockDeg (yaw: number): number { return f((Math.PI - yaw) * 180 / Math.PI) }
// mineflayer's pitch in Bedrock degrees.
export function javaPitchToBedrockDeg (pitch: number): number { return f(-pitch * 180 / Math.PI) }

// An entity's rotation: mineflayer radians, or Bedrock degrees overriding them.
export interface Rotated {
  yaw?: number | undefined
  pitch?: number | undefined
  bedrockYaw?: number | undefined
  bedrockPitch?: number | undefined
}

// The entity's yaw and pitch in Bedrock degrees: `bedrockYaw` / `bedrockPitch` when given, else the radian angles.
export function yawOf (entity: Rotated): number {
  return typeof entity.bedrockYaw === 'number' ? f(entity.bedrockYaw) : javaYawToBedrockDeg(entity.yaw || 0)
}

// The entity's pitch in Bedrock degrees.
export function pitchOf (entity: Rotated): number {
  return typeof entity.bedrockPitch === 'number' ? f(entity.bedrockPitch) : javaPitchToBedrockDeg(entity.pitch || 0)
}

// The entity's look direction this tick. The rotation of the tick is already the previous rotation too when the
// look is read, so the lerp between them is the identity and the direction is the rotation's own.
export function viewOf (entity: Rotated): Vec3Like {
  return directionFromRotation(pitchOf(entity), yawOf(entity))
}
