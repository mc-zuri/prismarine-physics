// The start of a tick: the state it begins from, the box in the pose the player is in, the ground under it, and the
// liquids it is in.
import { f } from '../math/float.ts'
import { poseHeightOf } from '../movement/pose.ts'
import { ensureBox } from '../movement/player-box.ts'
import type { BedrockState, Ctx, Player, Simulated } from '../types.ts'
import { blockAt, blockFriction } from '../world/blocks.ts'
import { applyLiquidFlow, senseLiquids } from '../world/liquids.ts'
import { newTick, type TickState } from './state.ts'

// The jump cooldown counts down while jump is held, and is gone once it is released.
export function stepJumpCooldown (entity: Player, jumpHeld: boolean): void {
  if (entity.jumpTicks! > 0) entity.jumpTicks!--
  if (!jumpHeld) entity.jumpTicks = 0
}

// The box height the tick starts with: the pose's kept height, else the pose the controls and flags say.
export function startingPoseHeight (entity: Player, standHeight: number): number {
  const st = entity.bedrock
  if (st && typeof st.poseHeight === 'number') return st.poseHeight
  const horizontal = !!(st && st.swimming) || (!!entity.elytraFlying && !!entity.elytraEquipped)
  return poseHeightOf(!!(entity.control && entity.control.sneak), horizontal, standHeight)
}

// The glide flag: the engine's own, unless the caller changed entity.elytraFlying since the engine last wrote it.
export function syncGlideFlag (entity: Simulated): void {
  const st = entity.bedrock
  if (st.glideMirror !== undefined && !!entity.elytraFlying !== st.glideMirror) st.gliding = !!entity.elytraFlying
  else if (st.gliding === undefined) st.gliding = !!entity.elytraFlying
}

// The flying ability as the client holds it: its own toggle (the double tap sets it at once), until the server's flag
// changes and restates it.
export function clientFlying (st: BedrockState, serverFlying: boolean): boolean {
  if (st.serverFlying !== serverFlying) {
    st.serverFlying = serverFlying
    st.flying = serverFlying
  }
  return !!st.flying
}

// Begins a tick: float32 velocity, the jump cooldown, the box, the ground block and its friction, the flying ability
// and fly intent (the caller's own toggle when it tracks one, else the ability), and the liquids on the box -- with
// the flowing water's push. A teleport tick makes no move, and keeps the liquids the last move sensed.
export function beginTick (ctx: Ctx, entity: Player): { tick: TickState, entity: Simulated } {
  const control = entity.control || {}
  const tick = newTick(control)
  const vel = entity.vel
  vel.set(f(vel.x), f(vel.y), f(vel.z))
  tick.startedOnGround = !!entity.onGround
  stepJumpCooldown(entity, !!(control.jump || control.raw?.jumpDown || entity.jumpQueued))

  const st = ensureBox(entity, startingPoseHeight(entity, ctx.settings.playerHeight), ctx.settings.playerHalfWidth)
  const simulated = entity as Simulated
  const aabb = st.aabb!
  tick.groundBlock = blockAt(ctx.world, entity.pos.x, aabb.minY - 0.1, entity.pos.z)
  tick.groundFriction = blockFriction(tick.groundBlock, ctx.settings.defaultSlipperiness)

  tick.flying = clientFlying(st, !!entity.flying)
  tick.flyIntent = entity.flyIntent === undefined ? tick.flying : !!entity.flyIntent
  syncGlideFlag(simulated)
  st.flightFrictionOverride = undefined

  if (st.teleported) return { tick, entity: simulated }
  const liquids = senseLiquids(ctx.world, aabb)
  entity.isInWater = liquids.isInWater
  entity.isInLava = liquids.isInLava
  if (!tick.flying) applyLiquidFlow(ctx.world, aabb, vel)
  return { tick, entity: simulated }
}
