// What the server's movement packets write to the player: a teleport, a movement correction, a velocity, a restated
// actor flag.
import { f } from '../math/float.ts'
import { boxAround, dropBox, type Dimensions } from '../movement/player-box.ts'
import type { BedrockState, Player, Vec3Like } from '../types.ts'

const MoveMode = { normal: 0, reset: 1, teleport: 2, rotation: 3 } as const
export { MoveMode }

// A move of the local player: the eye position, the rotation, the mode and the ground flag.
export interface Teleport {
  // the eye position
  x: number
  y: number
  z: number
  yaw?: number | undefined
  pitch?: number | undefined
  headYaw?: number | undefined
  // MoveMode; a teleport when absent
  mode?: number | undefined
  onGround?: boolean | undefined
}

function stateOf (entity: Player): BedrockState {
  return entity.bedrock || (entity.bedrock = {})
}

// Installs a rotation in degrees: as `bedrockYaw` / `bedrockPitch` when the player uses them (or has no radian angle),
// else converted to mineflayer's radians.
function installRotation (entity: Player, yaw: number | undefined, pitch: number | undefined): void {
  if (typeof yaw === 'number') {
    if (typeof entity.bedrockYaw === 'number' || entity.yaw === undefined) entity.bedrockYaw = f(yaw)
    else entity.yaw = Math.PI - yaw * Math.PI / 180
  }
  if (typeof pitch === 'number') {
    if (typeof entity.bedrockPitch === 'number' || entity.pitch === undefined) entity.bedrockPitch = f(pitch)
    else entity.pitch = -pitch * Math.PI / 180
  }
}

// A move of the local player. The position is the eye position. A teleport zeroes the velocity and makes the next tick
// report it handled and skip its travel and move. The ground flag and the rotation are installed; the box is rebuilt
// at the next tick; the collision flags of the previous move stand.
export function handleTeleport (entity: Player, teleport: Teleport, eyeHeight: number): void {
  const st = stateOf(entity)
  const mode = teleport.mode === undefined ? MoveMode.teleport : teleport.mode
  entity.pos.set(f(teleport.x), f(f(teleport.y) - f(eyeHeight)), f(teleport.z))
  if (mode === MoveMode.teleport) entity.vel.set(0, 0, 0)
  installRotation(entity, teleport.yaw, teleport.pitch)
  if (typeof teleport.onGround === 'boolean') entity.onGround = teleport.onGround
  dropBox(st)
  if (mode === MoveMode.teleport) st.teleported = true
}

// A movement correction: the eye position, the velocity and the ground flag.
export interface MoveCorrection {
  // the eye position, the velocity and the ground flag the server says the player had
  x: number
  y: number
  z: number
  dx?: number | undefined
  dy?: number | undefined
  dz?: number | undefined
  onGround?: boolean | undefined
}

// A movement correction: the position (eye height included), velocity and ground flag installed, the collision flags
// cleared, and the box rebuilt at the next tick.
export function applyCorrection (entity: Player, correction: MoveCorrection, eyeHeight: number): void {
  const st = stateOf(entity)
  entity.pos.set(f(correction.x), f(f(correction.y) - f(eyeHeight)), f(correction.z))
  entity.vel.set(f(correction.dx || 0), f(correction.dy || 0), f(correction.dz || 0))
  entity.onGround = !!correction.onGround
  entity.isCollidedHorizontally = false
  entity.isCollidedVertically = false
  dropBox(st)
}

// Restated actor flags, and the box height sent with a pose.
// A motion the server sets on the player (a knockback, an explosion): the velocity and nothing else.
export function applyMotion (entity: Player, motion: Vec3Like): void {
  entity.vel.set(f(motion.x), f(motion.y), f(motion.z))
}

export interface ActorFlags {
  sneaking?: boolean | undefined
  sprinting?: boolean | undefined
  swimming?: boolean | undefined
  gliding?: boolean | undefined
  crawling?: boolean | undefined
  pushTowardsClosestSpace?: boolean | undefined
  // the riptide spin
  spinning?: boolean | undefined
  // the box height the server sent with a pose
  height?: number | undefined
}

// The actor flags a server restates.
export const ACTOR_FLAG_NAMES = ['sneaking', 'sprinting', 'swimming', 'gliding', 'crawling', 'pushTowardsClosestSpace', 'spinning'] as const

// The server's restated flags overwrite the player's own; a box height resizes the box, keeping its feet.
export function setActorFlags (entity: Player, flags: ActorFlags): void {
  const st = stateOf(entity)
  for (const name of ACTOR_FLAG_NAMES) {
    const value = flags[name]
    if (typeof value === 'boolean') st[name] = value
  }
  if (typeof flags.gliding === 'boolean') entity.elytraFlying = flags.gliding
  if (typeof flags.height === 'number') {
    st.poseHeight = f(flags.height)
    if (st.aabb) {
      st.aabb.maxY = f(st.aabb.minY + st.poseHeight)
      st.height = st.poseHeight
    }
  }
}

// ---- the same writes on a plain actor record ------------------------------------------------------------------------

// A plain actor: position, velocity, ground flag, teleported mark and box.
export interface ActorRecord {
  position?: Vec3Like | undefined
  velocity?: Vec3Like | undefined
  onGround?: boolean | undefined
  teleported?: boolean | undefined
  bounds?: ReturnType<typeof boxAround> | undefined
}

// A position correction or teleport of a plain actor.
export interface SpatialCorrection {
  op?: string | undefined
  position: Vec3Like
  velocity: Vec3Like
  onGround?: boolean | undefined
}

// A position correction, or a teleport (`op: 'teleport'`): the two differ in that a teleport zeroes the velocity where
// a correction copies the packet's, and a teleport marks the actor teleported. Both rebuild the box.
export function applySpatialCorrection (actor: ActorRecord, correction: SpatialCorrection, dimensions: Dimensions): ActorRecord {
  const teleport = correction.op === 'teleport'
  actor.position = { x: f(correction.position.x), y: f(correction.position.y), z: f(correction.position.z) }
  actor.velocity = teleport ? { x: 0, y: 0, z: 0 } : { x: f(correction.velocity.x), y: f(correction.velocity.y), z: f(correction.velocity.z) }
  actor.onGround = !!correction.onGround
  if (teleport) actor.teleported = true
  actor.bounds = boxAround(actor.position, dimensions)
  return actor
}

// A velocity correction (the server setting the motion, e.g. knockback): the velocity and nothing else.
export function applyVelocityCorrection (actor: ActorRecord, velocity: Vec3Like): ActorRecord {
  actor.velocity = { x: f(velocity.x), y: f(velocity.y), z: f(velocity.z) }
  return actor
}
