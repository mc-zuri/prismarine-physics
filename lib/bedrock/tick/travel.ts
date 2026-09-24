// The travel of the tick: gliding, or the fly controls, the jump and the input's push for the travel type.
import { f } from '../math/float.ts'
import { pitchOf, viewOf, yawOf } from '../math/rotation.ts'
import { flyingSpeed, verticalFlightControl } from '../movement/flight.ts'
import { glide } from '../movement/glide.ts'
import { climbSpeed, jumpReduced, jumpVelocity, liquidJump, sprintJumpBoost, swimPoseHold, waterSink } from '../movement/jump.ts'
import { boostedWaterSpeed } from '../movement/dolphin.ts'
import { fireworkBoost, GLIDE_BOOST_RATE } from '../movement/movement-effects.ts'
import { depthStriderLevel, depthStriderSpeed, frictionInfluencedSpeed, moveRelative, movementSpeed, walkSpeed } from '../movement/travel.ts'
import type { Ctx, Simulated } from '../types.ts'
import { blockAt, blockName, standingOnBlock } from '../world/blocks.ts'
import type { TickState } from './state.ts'

const SWIM_STEER_STEEP = f(-0.2)
const SWIM_STEER_FAST = f(0.085)
const SWIM_STEER = f(0.06)

// Gliding this tick: the glide flag, out of water, lava and climbables.
export function isGliding (entity: Simulated): boolean {
  return !!entity.elytraFlying && !entity.isInWater && !entity.isInLava && !entity.bedrock.climbable
}

// A firework rocket used this tick (consumed) while gliding gives the glide boost its client length.
export function useFirework (entity: Simulated): void {
  const used = !!entity.fireworkUsed
  entity.fireworkUsed = false
  if (used) entity.fireworkRocketDuration = fireworkBoost(entity.fireworkRocketDuration || 0, !!entity.elytraFlying)
}

// One glide tick; a firework rocket boosts along the look while its duration lasts (-1: without end), which counts
// down two a tick.
export function glideTick (entity: Simulated): void {
  const boost = entity.fireworkRocketDuration! > 0 || entity.fireworkRocketDuration === -1
  if (entity.fireworkRocketDuration! > 0) entity.fireworkRocketDuration = Math.max(entity.fireworkRocketDuration! - GLIDE_BOOST_RATE, 0)
  glide(entity.vel, pitchOf(entity), viewOf(entity), entity.slowFalling! > 0, boost)
}

// The vertical fly controls on the fly intent: up is the jump / ascend key, down the sneak / descend key. The hover is
// creative's in creative (and in an unknown game mode).
export function flightControls (ctx: Ctx, entity: Simulated): void {
  const st = entity.bedrock
  const control = verticalFlightControl(entity.vel.y, {
    stick: { x: st.input!.direction.x, z: st.input!.direction.z },
    creative: entity.gameMode === undefined || entity.gameMode === 'creative',
    up: !!(st.input!.wantUp || entity.jumpQueued),
    down: !!st.input!.wantDown,
    upSlow: !!st.keys!.wantUpSlow,
    downSlow: !!st.keys!.wantDownSlow,
    speed: typeof entity.verticalFlySpeed === 'number' ? entity.verticalFlySpeed : ctx.settings.verticalFlySpeed
  })
  entity.vel.y = control.y
  st.flightFrictionOverride = control.override
}

// A jump from the ground, when the cooldown allows: the cooldown restarts, then -- unless the player stands on powder
// snow -- the impulse (only ever raising the vertical velocity), the start-jumping action, and, while sprinting, the
// push along the facing.
export function jumpFromGround (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  const vel = entity.vel
  const aabb = st.aabb!
  const feet = blockAt(ctx.world, entity.pos.x, aabb.minY, entity.pos.z)
  const below = blockAt(ctx.world, entity.pos.x, aabb.minY - 1, entity.pos.z)
  entity.jumpTicks = ctx.settings.autojumpCooldown
  if (blockName(standingOnBlock(ctx.world, aabb, entity.pos)) === 'powder_snow') return
  const jumpY = jumpVelocity(ctx.settings.jumpVelocity, entity.jumpBoost, jumpReduced(feet, below))
  if (jumpY > vel.y) vel.y = jumpY
  st.actions!.add('startJumping')
  if (tick.sprinting) sprintJumpBoost(vel, yawOf(entity), ctx.settings.sprintJumpBoost)
}

// The jump of the tick, in the client's order: a held jump in the swim pose holds still; on a ladder or vine it climbs
// at 0.2 (in water too: the sink on the sneak key runs first and the climb replaces it), and a fresh press in
// scaffolding climbs; in a liquid it rises (and the sneak key sinks in water); on the ground it jumps.
export function jump (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  const vel = entity.vel
  const held = !!(st.input!.jumping || entity.jumpQueued)
  const pressed = held && !st.jumpHeld
  st.jumpHeld = held
  // flying as the client holds it (its own toggle), not the server's flag it has not restated yet
  const sink = { down: st.input!.wantDown, downSlow: st.keys!.wantDownSlow, flying: !!st.flying }
  if (held && st.climbable && !swimPoseHold(st)) {
    if (st.wasInWater) vel.y = waterSink(vel.y, sink)
    if (st.climbable !== 'scaffolding') vel.y = climbSpeed(st.climbable)
    else if (pressed) vel.y = Math.max(vel.y, climbSpeed(st.climbable))
    return
  }
  const inLiquid = liquidJump(vel.y, {
    jump: held,
    wasInWater: st.wasInWater,
    wasInLava: st.wasInLava,
    swimming: st.swimming,
    headInWater: st.headInWater,
    poseAmount: st.poseAmount,
    wantDown: sink.down,
    wantDownSlow: sink.downSlow,
    flying: sink.flying
  })
  if (inLiquid !== null) {
    vel.y = inLiquid
    return
  }
  if (held && !st.climbable && entity.onGround && !entity.jumpTicks) jumpFromGround(ctx, entity, tick)
}

// The travel speed for the travel type: flying, or on foot (the ground's friction -- soul sand's only without Soul
// Speed --, the air, a liquid), with Depth Strider in water, or a dolphin's boost swimming.
export function travelSpeed (ctx: Ctx, entity: Simulated, tick: TickState): number {
  if (tick.flying) return flyingSpeed(typeof entity.flySpeed === 'number' ? entity.flySpeed : ctx.settings.flySpeed, tick.sprinting)
  const walk = walkSpeed(entity, ctx.settings)
  const speed = frictionInfluencedSpeed({
    walkSpeed: walk,
    speedLevel: entity.speed,
    slownessLevel: entity.slowness,
    sprinting: tick.sprinting,
    inWater: entity.isInWater,
    inLava: entity.isInLava,
    onGround: tick.startedOnGround,
    slipperiness: tick.groundFriction,
    soulSand: blockName(tick.groundBlock) === 'soul_sand' && !(entity.soulSpeed! > 0)
  })
  if (!entity.isInWater) return speed
  if (tick.swimSpeedMultiplier > 1) return boostedWaterSpeed(speed, tick.swimSpeedMultiplier, entity.depthStrider!)
  return depthStriderSpeed(speed, movementSpeed(walk, entity.speed! | 0, entity.slowness! | 0), depthStriderLevel(entity.depthStrider, tick.startedOnGround))
}

// A swimmer's vertical velocity follows the look (faster when looking steeply down), unless jump is held; with the
// head out of the water and looking up it stops.
export function swimSteering (entity: Simulated): void {
  const st = entity.bedrock
  if (!st.swimming || !entity.isInWater || st.input!.jumping || entity.jumpQueued) return
  const view = st.view!
  const rate = view.y < SWIM_STEER_STEEP ? SWIM_STEER_FAST : SWIM_STEER
  entity.vel.y = view.y <= 0 || st.headInWater ? f(entity.vel.y + f(f(view.y - entity.vel.y) * rate)) : 0
}

// The input pushed along the yaw at the travel speed, then the swim steering.
export function travel (ctx: Ctx, entity: Simulated, tick: TickState): void {
  moveRelative(entity.vel, yawOf(entity), tick.travel.x, tick.travel.z, travelSpeed(ctx, entity, tick), ctx.trig)
  swimSteering(entity)
}
