// The riptide spin of the tick: a requested launch, then the spin's end rules, both before the pose is decided.
import { f } from '../math/float.ts'
import { pitchOf, yawOf } from '../math/rotation.ts'
import { bounceOffHits, riptideImpulse, stepSpin } from '../movement/spin-attack.ts'
import type { Simulated } from '../types.ts'
import type { TickState } from './state.ts'

// A launch requested by the caller (`riptideLaunch`, the trident's Riptide level, consumed here) adds the riptide
// impulse unless the player is immobile, and starts the spin. The spin then counts a tick: the mobs the caller reports
// hit (`spinHits`, consumed) bounce the velocity back and end it, as do the previous move's wall and running out.
export function spinAttack (entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  const level = entity.riptideLaunch
  const hits = entity.spinHits || 0
  entity.riptideLaunch = 0
  entity.spinHits = 0
  if (level! > 0) {
    if (!entity.immobile) {
      const impulse = riptideImpulse({
        pitch: pitchOf(entity),
        yaw: yawOf(entity),
        level: level!,
        onGround: tick.startedOnGround,
        bodyInWater: !!entity.isInWater && !st.headInWater
      })
      entity.vel.set(f(entity.vel.x + impulse.x), f(entity.vel.y + impulse.y), f(entity.vel.z + impulse.z))
    }
    st.spinning = true
    st.spinTicks = 0
    st.actions!.add('startSpinAttack')
  }
  const spin = { spinning: !!st.spinning, spinTicks: st.spinTicks || 0 }
  if (stepSpin(spin, { hits, horizontalCollision: !!entity.isCollidedHorizontally, onGround: tick.startedOnGround })) {
    bounceOffHits(entity.vel, hits)
    st.actions!.add('stopSpinAttack')
  }
  st.spinning = spin.spinning
  st.spinTicks = spin.spinTicks
}
