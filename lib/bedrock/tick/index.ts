// One tick of a Bedrock player, as a sequence of steps. Each step lives in its own module with its own tests; this
// file only fixes their order.
import { f } from '../math/float.ts'
import { nextFallDistance } from '../movement/fall-distance.ts'
import { storePreviousInput } from '../movement/sprint.ts'
import type { Ctx, Player, Simulated } from '../types.ts'
import { senseLiquids } from '../world/liquids.ts'
import { slowdownBlocksIn } from '../world/slowdown-blocks.ts'
import { bubbleColumns, honeyBlocks, standOnSticky, velocityAfterMove } from './after-move.ts'
import { beginTick } from './begin.ts'
import { climbBeforeMove, climbOnPush, climbOutOfLiquid } from './climb.ts'
import { dolphinBoost, tickMovementEffects } from './dolphin.ts'
import { decidePose, decideSprint, readInput } from './intent.ts'
import { requestMove, settleCollisions, slowDown, sweepMove } from './move.ts'
import type { TickState } from './state.ts'
import { spinAttack } from './spin.ts'
import { takePose } from './take-pose.ts'
import { flightControls, glideTick, isGliding, jump, travel, useFirework } from './travel.ts'
import { seatPosition, simulateBoat } from './vehicle.ts'

// The fall distance after the move, with the water sensed on the moved box.
function trackFall (ctx: Ctx, entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  st.fallDistance = nextFallDistance(st.fallDistance || 0, {
    onGround: !!entity.onGround,
    inWater: senseLiquids(ctx.world, st.aabb!).isInWater,
    climbing: !!st.climbable,
    flying: tick.flying,
    slowed: slowdownBlocksIn(ctx.world, st.aabb!).size > 0,
    movedY: tick.applied.y
  })
}

// The input the next tick compares with.
function endInput (entity: Simulated): void {
  storePreviousInput(entity.bedrock, entity.bedrock.input!)
}

// An immobile player (no AI, sleeping, dead) does not move: its velocity and jump are dropped.
function holdStill (entity: Simulated): void {
  entity.vel.set(0, 0, 0)
  entity.bedrock.jumpingFlag = false
  entity.jumpQueued = false
  endInput(entity)
}

// The blocks the player is in act on it: bubble columns, then honey. A spectator is in none.
function insideBlocks (ctx: Ctx, entity: Simulated): void {
  if (entity.gameMode === 'spectator') return
  bubbleColumns(ctx, entity)
  honeyBlocks(ctx, entity)
}

// A teleport tick ends after the jump: the travel, the move and what follows are skipped (the blocks the player is
// in still act).
function endTeleportTick (ctx: Ctx, entity: Simulated): void {
  entity.jumpQueued = false
  insideBlocks(ctx, entity)
  endInput(entity)
}

// The travel: a glide, or the fly controls, the jump and the input's push. Returns false when the tick ends here.
function travelPhase (ctx: Ctx, entity: Simulated, tick: TickState): boolean {
  useFirework(entity)
  tick.gliding = isGliding(entity)
  if (tick.gliding && !tick.teleported) {
    glideTick(entity)
  } else {
    entity.fireworkRocketDuration = 0
    if (tick.flyIntent) flightControls(ctx, entity)
    if (!tick.flying) jump(ctx, entity, tick)
    if (tick.teleported) {
      endTeleportTick(ctx, entity)
      return false
    }
    travel(ctx, entity, tick)
  }
  entity.jumpQueued = false
  return true
}

// A tick in a vehicle: the rider's input steers a boat it controls (as the client predicts it), and the rider sits in
// its seat; it neither walks nor collides itself.
function rideTick (ctx: Ctx, entity: Simulated): void {
  const vehicle = entity.vehicle!
  if (vehicle.predicted) simulateBoat(ctx, vehicle, { move: entity.bedrock.input!.move, up: !!entity.bedrock.keys!.up }, entity.bigWaveRoll)
  const seat = seatPosition(vehicle)
  entity.pos.set(seat.x, f(seat.y - f(ctx.settings.eyeHeight)), seat.z)
  entity.vel.set(0, 0, 0)
  entity.onGround = false
  entity.isCollidedHorizontally = false
  entity.isCollidedVertically = false
  entity.jumpQueued = false
  // the one-tick inputs are spent riding (they would otherwise act on the first tick after the dismount)
  entity.riptideLaunch = 0
  entity.spinHits = 0
  entity.fireworkUsed = false
  entity.itemUseStarted = false
  endInput(entity)
}

// Simulates one tick of the player in place and returns it.
export function simulatePlayer (ctx: Ctx, player: Player): Player {
  const { tick, entity } = beginTick(ctx, player)
  readInput(entity, tick)
  if (entity.vehicle) {
    entity.bedrock.actions = new Set()
    rideTick(ctx, entity)
    return entity
  }
  const sprint = decideSprint(ctx, entity, tick)
  spinAttack(entity, tick)
  decidePose(ctx, entity, tick, sprint)
  dolphinBoost(ctx, entity, tick)
  climbBeforeMove(ctx, entity, tick)
  takePose(ctx, entity, tick)
  if (entity.immobile && !tick.teleported) {
    holdStill(entity)
    tickMovementEffects(entity)
    return entity
  }
  if (!travelPhase(ctx, entity, tick)) {
    tickMovementEffects(entity)
    return entity
  }

  slowDown(ctx, entity, tick)
  requestMove(ctx, entity, tick)
  sweepMove(ctx, entity, tick)
  settleCollisions(ctx, entity, tick)
  trackFall(ctx, entity, tick)

  tick.autoClimb = climbOnPush(ctx, entity)
  velocityAfterMove(ctx, entity, tick)
  climbOutOfLiquid(ctx, entity, tick.preMoveY)
  insideBlocks(ctx, entity)

  entity.bedrock.pendingSlowdowns = entity.gameMode === 'spectator' ? new Set() : slowdownBlocksIn(ctx.world, entity.bedrock.aabb!)
  endInput(entity)
  standOnSticky(ctx, entity, tick)
  tickMovementEffects(entity)
  return entity
}
