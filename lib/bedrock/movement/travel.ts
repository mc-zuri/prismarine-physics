// The travel: the speed the input moves the player at for its travel type, and the input rotated by the yaw and
// added to the velocity.
import type { Trig } from '../math/crt.ts'
import { f } from '../math/float.ts'
import type { AttributeValue, Player, Settings, Vec3Like } from '../types.ts'

// The ground speed is normalised to this friction (0.6 x 0.91 in float32).
export const GROUND_FRICTION = f(f(0.6) * f(0.91))
// The horizontal friction every move keeps (0.91), times the ground block's slipperiness on the ground.
export const AIR_FRICTION_XZ = f(0.91)
const SOUL_SAND_FRICTION_MUL = f(1.225)
// Using an item (eating, drawing a bow) scales the speed by 0.35 squared.
const AIR_ACCEL_WALK = f(0.02)
const AIR_ACCEL_SPRINT = f(0.025999999)
const SPRINT_BOOST = f(1.3)
// A value above the base by more than this carries the sprint boost (halfway to it, so float rounding decides nothing).
const HALF_SPRINT_BOOST = 1.15
// The highest Depth Strider level.
export const DEPTH_STRIDER_MAX = 3
const MIN_INPUT_SQ = f(0.000099999997)

// ---- the movement attribute ----------------------------------------------------------------------------------------
// The walking speed is the movement attribute's current value. The sprint boost is a x1.3 modifier on that attribute:
// starting and stopping a sprint adds and removes it, and a server update replaces the whole attribute. `base` is the
// value without the boost.

function numberOr (...values: Array<number | undefined>): number | undefined {
  for (const value of values) if (value !== undefined && value !== null) return value
  return undefined
}

// The movement attribute, when it carries a number.
export function movementAttributeOf (entity: Player, settings: Settings): AttributeValue | null {
  const attr = (entity.attributes && entity.attributes[settings.movementSpeedAttribute]) || {}
  return typeof numberOr(attr.base, attr.default, attr.current, attr.value) === 'number' ? attr : null
}

// The walking speed the travel reads (the sprint boost included).
export function walkSpeed (entity: Player, settings: Settings): number {
  const attr = movementAttributeOf(entity, settings)
  if (!attr) return entity.bedrock && entity.bedrock.sprintBoost ? f(settings.playerSpeed * SPRINT_BOOST) : settings.playerSpeed
  const value = numberOr(attr.current, attr.value, attr.base, attr.default)
  return typeof value === 'number' ? value : settings.playerSpeed
}

// The walking speed without the sprint boost.
export function walkSpeedBase (entity: Player, settings: Settings): number {
  const attr = movementAttributeOf(entity, settings)
  if (!attr) return settings.playerSpeed
  return numberOr(attr.base, attr.default, attr.current, attr.value) as number
}

// The walking speed as the travel takes it: the value without the sprint boost and whether the boost is on, when the
// attribute holds exactly the boosted base; else the attribute's value as it is.
export function walkSpeedParts (entity: Player, settings: Settings): { walk: number, boost: boolean } {
  const walk = walkSpeed(entity, settings)
  const base = walkSpeedBase(entity, settings)
  const boost = walk !== base && walk === f(base * SPRINT_BOOST)
  return { walk: boost ? base : walk, boost }
}

// The attributes the speed in water and in lava reads: 0.02 each unless the server sets them.
export const UNDERWATER_MOVEMENT_ATTRIBUTE = 'minecraft:underwater_movement'
export const LAVA_MOVEMENT_ATTRIBUTE = 'minecraft:lava_movement'

// The speed a liquid attribute gives: its current value, else the 0.02 every liquid travel moves at.
export function liquidSpeed (entity: Player, name: string): number {
  const attr = entity.attributes && entity.attributes[name]
  const value = attr && numberOr(attr.current, attr.value, attr.base, attr.default)
  return typeof value === 'number' ? f(value) : AIR_ACCEL_WALK
}

// Adds or removes the sprint boost on the movement attribute.
export function setSprintBoost (entity: Player & { bedrock: { sprintBoost?: boolean | undefined } }, settings: Settings, boost: boolean): void {
  entity.bedrock.sprintBoost = boost
  const attr = movementAttributeOf(entity, settings)
  if (!attr) return
  const base = walkSpeedBase(entity, settings)
  entity.attributes![settings.movementSpeedAttribute] = { ...attr, base, current: boost ? f(base * SPRINT_BOOST) : base }
}

// Installs a server movement attribute: `base` the value without the boost, `current` the server's value (with the
// Speed and Slowness effects, and with the boost when the server thinks the player sprints). The travel applies the
// effects itself, so the attribute keeps the base, boosted or not: the server's value carries the boost when it is
// clearly above the base with the player's effects. With `sprintStartedSince` (the player started sprinting after the
// tick the packet is stamped for) a player still sprinting keeps its boost: the start re-applies it over the packet.
export function setMovementAttribute (entity: Player, settings: Settings, attribute: { base: number, current?: number, sprintStartedSince?: boolean }): void {
  const st = entity.bedrock || (entity.bedrock = {})
  const base = f(attribute.base)
  const server = typeof attribute.current === 'number' ? f(attribute.current) : base
  const affected = movementSpeed(base, entity.speed! | 0, entity.slowness! | 0)
  const serverBoost = server > affected * HALF_SPRINT_BOOST
  const boost = serverBoost || (!!attribute.sprintStartedSince && !!st.sprinting)
  const current = boost ? (serverBoost && affected === base ? server : f(base * SPRINT_BOOST)) : base
  entity.attributes = { ...(entity.attributes || {}), [settings.movementSpeedAttribute]: { base, current } }
  st.sprintBoost = boost
}

// ---- speed ---------------------------------------------------------------------------------------------------------

// The walking speed with the speed and slowness effects: each multiplies the running value (x1.4 then x0.7 is not
// x1.1), speed first.
export function movementSpeed (value: number, speedLevel: number, slownessLevel: number): number {
  let speed = f(value)
  if (speedLevel) speed = f(f(f(f(0.2) * speedLevel) + 1) * speed)
  if (slownessLevel) speed = f(f(f(f(-0.15) * slownessLevel) + 1) * speed)
  return speed > 0 ? speed : 0
}

// The facts the travel speed on foot reads.
export interface SpeedFacts {
  walkSpeed: number
  // the sprint boost on top of the effects (walkSpeed is then the value without it): the boost's modifier comes after
  // the effects' in the attribute's list, so it multiplies last
  sprintBoost?: boolean | undefined
  speedLevel?: number | undefined
  slownessLevel?: number | undefined
  sprinting?: boolean | undefined
  inWater?: boolean | undefined
  inLava?: boolean | undefined
  // the speed of the liquid the player travels in (its movement attribute): 0.02 when not given
  liquidSpeed?: number | undefined
  onGround?: boolean | undefined
  slipperiness: number
  soulSand?: boolean | undefined
}

// The travel speed on foot: the liquid's speed in a liquid (0.02); 0.02 in the air (0.026 sprinting); on the ground the walking speed
// scaled by (0.546 / friction)^3, where the friction is the block's slipperiness x 0.91 (soul sand's x1.225).
export function frictionInfluencedSpeed (facts: SpeedFacts): number {
  const affected = movementSpeed(facts.walkSpeed, facts.speedLevel! | 0, facts.slownessLevel! | 0)
  const base = facts.sprintBoost ? f(affected * SPRINT_BOOST) : affected
  if (facts.inWater || facts.inLava) return facts.liquidSpeed ?? AIR_ACCEL_WALK
  if (!facts.onGround) return facts.sprinting ? AIR_ACCEL_SPRINT : AIR_ACCEL_WALK
  let slip = f(facts.slipperiness)
  if (facts.soulSand) slip = f(slip * SOUL_SAND_FRICTION_MUL)
  const friction = f(slip * AIR_FRICTION_XZ)
  const ratio = f(GROUND_FRICTION / friction)
  return f(f(f(ratio * ratio) * ratio) * base)
}

// The Depth Strider level the water travel uses: 0..3, halved off the ground.
export function depthStriderLevel (level: number | undefined, onGround: boolean): number {
  const clamped = Math.min(Math.max(level || 0, 0), DEPTH_STRIDER_MAX)
  return onGround ? clamped : clamped * 0.5
}

// Depth Strider lerps the underwater speed toward the walking speed by level / 3.
export function depthStriderSpeed (speed: number, walk: number, level: number): number {
  return level > 0 ? f(speed + f(f(f(walk - speed) * level) / DEPTH_STRIDER_MAX)) : speed
}

// Adds the input (strafe = left, forward), rotated by the yaw and scaled to the speed, to the velocity. An input
// shorter than 1 keeps its length; a negligible one does nothing.
export function moveRelative (vel: Vec3Like, yawDeg: number, strafe: number, forward: number, speed: number, trig: Trig): void {
  const s = f(strafe)
  const fwd = f(forward)
  const distSq = f(f(s * s) + f(fwd * fwd))
  if (distSq < MIN_INPUT_SQ) return
  let dist = f(Math.sqrt(distSq))
  if (dist < 1) dist = 1
  const scale = f(f(speed) / dist)
  const { sin, cos } = trig.sinCosDeg(yawDeg)
  const strafeS = f(s * scale)
  const forwardS = f(fwd * scale)
  vel.x = f(vel.x + f(f(strafeS * cos) - f(forwardS * sin)))
  vel.z = f(vel.z + f(f(forwardS * cos) + f(strafeS * sin)))
}
