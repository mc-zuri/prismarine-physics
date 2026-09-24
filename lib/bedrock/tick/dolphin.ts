// Dolphin's Grace in the tick: the look for dolphins and the swim speed multiplier after the pose is decided, and the
// boost's countdown at the end of the tick.
import { DOLPHIN_SCAN_TICKS, dolphinQueryBox, renewBoost, scanTick, swimSpeedMultiplier } from '../movement/dolphin.ts'
import { countDown } from '../movement/movement-effects.ts'
import type { Ctx, Simulated } from '../types.ts'
import type { TickState } from './state.ts'

// A swimming player looks for dolphins when its countdown runs out (the world's `dolphinsNear`), the first time after
// 60 ticks of swimming; one found renews the boost. The multiplier follows the swimming flag and the boost.
export function dolphinBoost (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  const swimming = !!st.swimming
  const scan = scanTick(st.dolphinScanTimer ?? DOLPHIN_SCAN_TICKS, swimming)
  st.dolphinScanTimer = scan.timer
  if (scan.scan && ctx.world.dolphinsNear) {
    const found = ctx.world.dolphinsNear(dolphinQueryBox(st.aabb!))
    st.dolphinBoost = renewBoost(st.dolphinBoost || 0, found)
  }
  tick.swimSpeedMultiplier = swimSpeedMultiplier(swimming, st.dolphinBoost || 0)
}

// The boost counts down a tick.
export function tickMovementEffects (entity: Simulated): void {
  const st = entity.bedrock
  if (st.dolphinBoost) st.dolphinBoost = countDown(st.dolphinBoost)
}
