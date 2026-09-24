// The box takes the tick's pose before the move, and the liquid state the rest of the tick reads is settled.
import { ensureBox } from '../movement/player-box.ts'
import { poseChanged, poseHeightOf } from '../movement/pose.ts'
import type { Ctx, Simulated } from '../types.ts'
import { isLavaName, liquidInInnerBox } from '../world/liquids.ts'
import type { TickState } from './state.ts'

// The glide flag is written to entity.elytraFlying; the box height changes only when a pose action fired (or no pose
// was taken yet), a spin taking the horizontal pose; the water state of the tick start is kept for the travel, and lava is sensed again on the resized
// box shrunk by (0.1, 0.4, 0.1). A teleport handled since the last tick is reported this tick.
export function takePose (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  entity.elytraFlying = !!st.gliding
  st.glideMirror = entity.elytraFlying
  if (poseChanged(st.actions!) || typeof st.poseHeight !== 'number') {
    st.poseHeight = poseHeightOf(tick.sneaking, !!st.swimming || !!st.crawling || entity.elytraFlying || !!st.spinning, ctx.settings.playerHeight)
  }
  ensureBox(entity, st.poseHeight, ctx.settings.playerHalfWidth)
  st.wasInWater = entity.isInWater
  st.wasInLava = entity.isInLava
  entity.isInLava = !entity.isInWater && liquidInInnerBox(ctx.world, st.aabb!, isLavaName, 0.1, 0.4)

  tick.teleported = !!st.teleported
  st.teleported = false
  if (tick.teleported) st.actions!.add('handledTeleport')
}
