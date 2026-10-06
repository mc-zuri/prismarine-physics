// Climbing: ladders, vines and scaffolding before the move, pushing into a climbable after it, and climbing out of a
// liquid onto a block.
import { Box } from '../math/box.ts'
import { f } from '../math/float.ts'
import { climbSpeed, SCAFFOLDING_CLIMB_SPEED } from '../movement/jump.ts'
import type { CookedInput, Ctx, Simulated } from '../types.ts'
import { collisionBoxes } from '../world/blocks.ts'
import { climbableAt, exitingScaffolding } from '../world/climbables.ts'
import { containsLiquid } from '../world/liquids.ts'
import type { TickState } from './state.ts'

// Whether the input asks to descend scaffolding: sneaking with a keyboard and mouse; the descend key on touch; on a
// gamepad, sneaking with both the sneak key and the sneak toggle held.
function wantsDescend (input: CookedInput): boolean {
  if (input.inputMode === 'touch') return input.keys.descendBlock
  if (input.inputMode === 'game_pad') return input.keys.sneakToggleDown && input.keys.sneakDown && input.sneaking
  return input.sneaking
}

// Before the move. On a ladder or vine the fall is clamped to the climb speed (and held when sneaking); on scaffolding
// sneaking descends at 0.15. A held jump climbs at the climb speed (0.2, scaffolding 0.15), unless it is leaving the
// scaffolding sideways.
export function climbBeforeMove (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  const vel = entity.vel
  const kind = climbableAt(ctx.world, entity.pos, st.aabb!, !!entity.leatherBoots)
  st.scaffoldDescend = false
  st.climbable = kind
  // over powder snow in leather boots, the sneak of the tick before (the flag the client reads was set then) descends
  // through it at 0.15; the snow does not hold the player this tick
  st.descendingSnow = !!st.wasSneaking && !!st.overDescendable && kind !== 'scaffolding'
  if (st.descendingSnow) {
    vel.y = f(-SCAFFOLDING_CLIMB_SPEED)
    st.fallDistance = 0
    // the descent is the whole of the climb: no hold, no clamp, no rise
    st.ascendRestated = undefined
    return
  }
  if (!kind) {
    // the server restated the climbable-block flag set: a jump rises at the scaffolding climb speed, and waits 10
    const restated = st.ascendRestated === true
    st.ascendRestated = undefined
    if (restated && (st.input!.jumping || entity.jumpQueued) && !st.input!.sneaking) {
      vel.y = SCAFFOLDING_CLIMB_SPEED
      entity.jumpTicks = 10
      tick.ascendJumped = true
    }
    return
  }
  const scaffoldCleared = st.scaffoldRestated === false
  st.scaffoldRestated = undefined
  if (kind === 'scaffolding' && wantsDescend(st.input!) && !scaffoldCleared) {
    vel.y = f(-SCAFFOLDING_CLIMB_SPEED)
    st.scaffoldDescend = true
  }
  const speed = climbSpeed(kind)
  if (kind !== 'scaffolding') {
    // (not on the tick a crawl ends: the player is not yet in the sneaking pose that holds)
    if (tick.sneaking && !st.actions?.has('stopCrawling') && vel.y < 0) vel.y = 0
    if (vel.y < -speed) vel.y = f(-speed)
  }
  // (from 1.26.20 the flag the last move left says whether it still climbs; before, a move about to cross into a cell
  // without scaffolding stops it)
  const exiting = kind === 'scaffolding' && (ctx.scaffoldingClimbFlag ? st.ascendable === false : exitingScaffolding(ctx.world, entity.pos, vel, !!entity.isCollidedVertically))
  // the scaffolding climb reads the flag its last check set, which a server restatement since can have cleared
  const cleared = kind === 'scaffolding' && st.ascendRestated === false
  st.ascendRestated = undefined
  if (!exiting && !cleared && (st.input!.jumping || entity.jumpQueued)) vel.y = speed
}

// After the move: a ladder or vine at the feet while pushing against a block climbs at the climb speed, and the tick
// then skips gravity and the vertical drag. Returns whether it climbed.
export function climbOnPush (ctx: Ctx, entity: Simulated): boolean {
  const kind = climbableAt(ctx.world, entity.pos, entity.bedrock.aabb!, !!entity.leatherBoots)
  if (!kind || kind === 'scaffolding' || !entity.isCollidedHorizontally) return false
  entity.vel.y = climbSpeed(kind)
  return true
}

// Pushing against a block while in a liquid, with room for the box raised by 0.6 (plus the fall) and moved on by the
// velocity -- no liquid in it and no collision -- boosts the player up and out.
export function climbOutOfLiquid (ctx: Ctx, entity: Simulated, preMoveY: number): void {
  if (!(entity.isInWater || entity.isInLava) || !entity.isCollidedHorizontally) return
  const vel = entity.vel
  const aabb = entity.bedrock.aabb!
  const dy = f(f(f(preMoveY - entity.pos.y) + f(0.60000002)) + vel.y)
  const probe = new Box(f(aabb.minX + vel.x), f(aabb.minY + dy), f(aabb.minZ + vel.z), f(aabb.maxX + vel.x), f(aabb.maxY + dy), f(aabb.maxZ + vel.z))
  if (containsLiquid(ctx.world, probe) || collisionBoxes(ctx.world, probe).length > 0) return
  vel.y = f(ctx.settings.outOfLiquidImpulse)
}
