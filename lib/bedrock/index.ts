// Bedrock Edition player physics. Separate from the Java engine because the Bedrock player differs structurally:
// single-precision floats throughout, the position derived from the collision box, a fixed Y -> X -> Z collision
// sweep, friction applied after the move with a 2^-23 flush, the ground friction read at floor(minY - 0.1), and
// gravity added at the end of the tick.
//
// The player is mineflayer's PlayerState shape (feet position, radian yaw/pitch, the control booleans as key levels).
// Optional extensions: `bedrockYaw` / `bedrockPitch` (degrees) override the radian angles; `control.raw` carries the
// other raw key bits and `control.analogMoveVector` a stick; `control.moveVector` an already cooked move.
import fs from 'node:fs'
import path from 'node:path'
import { Box } from './math/box.ts'
import { paired, scalar } from './math/crt.ts'
import { f, VELOCITY_EPSILON } from './math/float.ts'
import { collide } from './movement/collision.ts'
import { boxIsCurrent } from './movement/player-box.ts'
import { poseHeightOf } from './movement/pose.ts'
import { setMovementAttribute } from './movement/travel.ts'
import { applyCorrection, applyMotion, handleTeleport, respawnAt, setActorFlags, type ActorFlags, type MoveCorrection, type Teleport } from './network/corrections.ts'
import { buildPlayerAuthInput } from './network/input-packet.ts'
import { simulatePlayer } from './tick/index.ts'
import { dismount } from './tick/vehicle.ts'
import type { Ctx, Player, Settings, Vec3Like, World } from './types.ts'
import { senseLiquids, type LiquidSense } from './world/liquids.ts'

export { BedrockSession } from './network/session.ts'
export { BedrockRewind } from './network/rewind.ts'

interface Registry { version?: { minecraftVersion?: string, majorVersion?: string } }

// The registry's version as [major, minor, patch].
export function versionOf (registry: Registry): number[] {
  const raw = (registry.version && (registry.version.minecraftVersion || registry.version.majorVersion)) || '0'
  return String(raw).split('.').map(n => parseInt(n, 10) || 0)
}

// Whether the registry is at least the given version.
export function versionAtLeast (registry: Registry, major: number, minor: number, patch: number): boolean {
  const [a = 0, b = 0, c = 0] = versionOf(registry)
  return a !== major ? a > major : (b !== minor ? b > minor : c >= patch)
}

// A rule that depends on the client's version: its name, what it does, and the first version it holds for. Bedrock's
// rules change within a major version (1.26.10 and 1.26.20 differ), so a feature is keyed on the full version.
export interface Feature { name: string, description: string, since: string }

// How far back a Levitation packet takes effect at most before 1.26.51.
const LEVITATION_REWIND_REACH = 4

// The Bedrock features (features.json beside this file).
export const FEATURES: readonly Feature[] = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'features.json'), 'utf8'))

// Whether the registry's version has the named feature (an unknown name: never).
export function supportFeature (registry: Registry, name: string): boolean {
  const feature = FEATURES.find(entry => entry.name === name)
  if (!feature) return false
  const [major, minor, patch] = feature.since.split('.').map(Number) as [number, number, number]
  return versionAtLeast(registry, major, minor, patch)
}

// The default tunables of a Bedrock player.
export function defaultSettings (): Settings {
  return {
    gravity: 0.08,
    slowFallingGravity: 0.01,
    airdrag: f(0.98),
    playerSpeed: 0.1,
    // the Java engine's sprint modifier form, kept for API compatibility (the Bedrock sprint is x1.3)
    sprintSpeed: 0.3,
    sneakSpeed: 0.3,
    // the highest a move steps up (the Java engine's is 0.6)
    stepHeight: 0.5625,
    playerHalfWidth: 0.3,
    playerHeight: 1.8,
    eyeHeight: 1.6200100183486938,
    jumpVelocity: f(0.42),
    sprintJumpBoost: 0.2,
    defaultSlipperiness: 0.6,
    airborneInertia: 0.91,
    airborneAcceleration: 0.02,
    airborneSprintAcceleration: f(0.026),
    waterInertia: 0.8,
    waterSprintInertia: 0.9,
    lavaInertia: 0.5,
    liquidAcceleration: 0.02,
    waterGravity: 0.005,
    lavaGravity: 0.02,
    outOfLiquidImpulse: 0.3,
    ladderMaxSpeed: 0.2,
    ladderClimbSpeed: 0.2,
    scaffoldingClimbSpeed: 0.15,
    autojumpCooldown: 10,
    flySpeed: 0.05,
    verticalFlySpeed: 1.0,
    bubbleColumnSurfaceDrag: { down: 0.03, maxDown: -0.9, up: 0.1, maxUp: 1.8 },
    bubbleColumnDrag: { down: 0.03, maxDown: -0.3, up: 0.06, maxUp: 0.7 },
    velocityEpsilon: VELOCITY_EPSILON,
    movementSpeedAttribute: 'minecraft:movement'
  }
}

// The physics object: the tunables, and the methods that simulate a tick and apply the server's packets.
export interface BedrockPhysics extends Settings {
  simulatePlayer (entity: Player, world: World): Player
  playerAuthInput (entity: Player): Record<string, unknown>
  setMovementAttribute (entity: Player, attribute: { base: number, current?: number, sprintStartedSince?: boolean }): void
  handleTeleport (entity: Player, teleport: Teleport): void
  // how far back a Levitation packet takes effect at most (before 1.26.51: 4 ticks), none where there is no limit
  levitationRewindReach: number | undefined
  // the player placed alive at `at` (the eye position) by the server's respawn
  respawn (entity: Player, at: Vec3Like): void
  applyCorrection (entity: Player, correction: MoveCorrection): void
  applyMotion (entity: Player, motion: Vec3Like): void
  setActorFlags (entity: Player, flags: ActorFlags): void
  senseLiquids (entity: Player, world: World): LiquidSense
  adjustPositionHeight (pos: Vec3Like): void
  // the rider leaves its vehicle (the dismount button, or the server taking it off: `byRider` false; `unlinked`: by
  // the server's link removal): placed at the dismount spot
  dismount (entity: Player, world?: World, byRider?: boolean, alpha?: number, unlinked?: boolean): void
}

// The box the coming tick senses liquids with: the kept box when current (resized to the pose height), else one built
// around the position.
function sensingBox (entity: Player, settings: Settings): Box {
  const st = entity.bedrock
  const horizontal = !!(st && (st.swimming || st.spinning)) || (!!entity.elytraFlying && !!entity.elytraEquipped)
  const height = st && typeof st.poseHeight === 'number' ? st.poseHeight : poseHeightOf(!!(entity.control && entity.control.sneak), horizontal, settings.playerHeight)
  const kept = st && st.aabb && boxIsCurrent(st, entity.pos) ? st.aabb : null
  if (kept) return kept.maxY - kept.minY !== height ? new Box(kept.minX, kept.minY, kept.minZ, kept.maxX, f(kept.minY + f(height)), kept.maxZ) : kept
  const w = f(settings.playerHalfWidth)
  const p = entity.pos
  return new Box(f(p.x - w), f(p.y), f(p.z - w), f(p.x + w), f(f(p.y) + f(height)), f(p.z + w))
}

// The physics of a Bedrock registry (prismarine-registry / minecraft-data) and world. The tunables are the object's
// own fields; the methods simulate a tick and apply the server's movement packets.
export function Physics (registry: Registry, world: World): BedrockPhysics {
  const settings = defaultSettings()
  const trig = supportFeature(registry, 'scalarTrig') ? scalar : paired
  const bounceCorrection = supportFeature(registry, 'landingBounceCorrection')
  const scaffoldingClimbFlag = supportFeature(registry, 'scaffoldingClimbFlag')
  // `settings` is the physics object itself, so a caller's change to a tunable reaches the tick
  const physics = settings as BedrockPhysics
  const ctxFor = (w: World): Ctx => ({ settings: physics, trig, bounceCorrection, scaffoldingClimbFlag, world: w })

  physics.simulatePlayer = (entity, w) => simulatePlayer(ctxFor(w), entity)
  physics.dismount = (entity, w = world, byRider = true, alpha, unlinked = false) => dismount(ctxFor(w), entity, byRider, alpha, unlinked)
  physics.playerAuthInput = (entity) => buildPlayerAuthInput(entity, physics.eyeHeight)
  physics.setMovementAttribute = (entity, attribute) => setMovementAttribute(entity, physics, attribute)
  physics.handleTeleport = (entity, teleport) => handleTeleport(entity, teleport, physics.eyeHeight)
  physics.respawn = (entity, at) => respawnAt(entity, at, physics.eyeHeight)
  physics.applyCorrection = (entity, correction) => applyCorrection(entity, correction, physics.eyeHeight)
  physics.setActorFlags = (entity, flags) => setActorFlags(entity, flags)
  physics.applyMotion = (entity, motion) => applyMotion(entity, motion)
  physics.levitationRewindReach = supportFeature(registry, 'levitationFullRewind') ? undefined : LEVITATION_REWIND_REACH
  // the liquid state of the coming tick, for a caller deciding its inputs on it
  physics.senseLiquids = (entity, w) => senseLiquids(w, sensingBox(entity, physics))
  // drops the position onto the ground below it (up to one block)
  physics.adjustPositionHeight = (pos) => {
    const w = physics.playerHalfWidth
    const box = new Box(pos.x - w, pos.y, pos.z - w, pos.x + w, pos.y + physics.playerHeight, pos.z + w)
    pos.y += collide(world, box, 0, -1, 0).y
  }
  return physics
}
