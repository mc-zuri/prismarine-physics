// One tick of a Bedrock player, as a sequence of steps. Each step lives in its own module with its own tests; this
// file only fixes their order.
import { mt19937NextFloat } from '../math/mt19937.ts'
import { f } from '../math/float.ts'
import { pitchOf, yawOf } from '../math/rotation.ts'
import { closestSpaceReach, pushTowardsClosestSpace } from '../movement/closest-space.ts'
import { nextFallDistance } from '../movement/fall-distance.ts'
import { storePreviousInput } from '../movement/sprint.ts'
import type { Ctx, Player, Simulated } from '../types.ts'
import { applyLiquidFlow, senseLiquids } from '../world/liquids.ts'
import { collisionBoxes } from '../world/blocks.ts'
import { slowdownBlocksIn } from '../world/slowdown-blocks.ts'
import { ascendableAt } from '../world/climbables.ts'
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
import { leavesOnJump, seatPosition, simulateBoat, simulateHorse } from './vehicle.ts'

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

// A move that ended inside blocks, while the server asks for the push toward free space, pushes the player out of
// them (the blocks' boxes only).
function moveTowardsClosestSpace (ctx: Ctx, entity: Simulated, tick: TickState): void {
  if (!tick.penetrated || !entity.bedrock.pushTowardsClosestSpace) return
  const box = entity.bedrock.aabb!
  pushTowardsClosestSpace(box, collisionBoxes({ getBlock: ctx.world.getBlock.bind(ctx.world) }, closestSpaceReach(box)), entity.vel)
}

// A teleport tick ends after the jump: the travel, the move and what follows are skipped (the blocks the player is
// in still act). A respawn's still takes the fall: gravity and the air's drag, with no move.
function endTeleportTick (ctx: Ctx, entity: Simulated, tick: TickState): void {
  if (tick.respawned) entity.vel.y = f(f(entity.vel.y - f(ctx.settings.gravity)) * f(ctx.settings.airdrag))
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
      endTeleportTick(ctx, entity, tick)
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
  // where the rider was at the start of the tick: its box stands there until the next
  entity.bedrock.seatedAt = { x: entity.pos.x, y: entity.pos.y, z: entity.pos.z }
  // on the first tick ridden the rider's input has not reached the boat yet: its paddles row with nothing pressed (each
  // still pulling half its last force)
  const input = entity.bedrock.riding ? { move: entity.bedrock.input!.move, up: !!entity.bedrock.keys!.up } : { move: entity.bedrock.input!.move, up: false, rowing: [false, false] as [boolean, boolean] }
  if (vehicle.predicted && vehicle.kind.endsWith('boat')) simulateBoat(ctx, vehicle, input, bigWaveRoll(entity))
  else if (vehicle.predicted) simulateHorse(ctx, vehicle, { move: entity.bedrock.input!.move, jump: !!entity.bedrock.input!.jumping, yaw: yawOf(entity), pitch: pitchOf(entity), jumpBoost: entity.jumpBoost })
  const seat = seatPosition(vehicle)
  entity.pos.set(seat.x, f(seat.y - f(ctx.settings.eyeHeight)), seat.z)
  // the first tick ridden still reports the velocity the rider had; from the next it stops, and flowing water around
  // it pushes it again (which it keeps when it gets off)
  if (entity.bedrock.riding) {
    entity.vel.set(0, 0, 0)
    applyLiquidFlow(ctx.world, entity.bedrock.aabb!, entity.vel)
  }
  entity.bedrock.riding = true
  // jumping in a vehicle that does not take the jump, the rider asks to leave it (the caller takes it off after the tick)
  entity.bedrock.leaveVehicle = !!entity.bedrock.input!.jumping && leavesOnJump(vehicle)
  // the rider's own ground and collision flags stay as its last move left them: no move of its own changes them
  entity.jumpQueued = false
  // the one-tick inputs are spent riding (they would otherwise act on the first tick after the dismount)
  entity.riptideLaunch = 0
  entity.spinHits = 0
  entity.fireworkUsed = false
  entity.itemUseStarted = false
  endInput(entity)
}

// The big-wave roll a boat the player steers draws: the caller's, else one from the client's random state, else none
// given (the vehicle tick's own).
function bigWaveRoll (entity: Simulated): (() => number) | undefined {
  if (entity.bigWaveRoll) return entity.bigWaveRoll
  const state = entity.randomState
  return state ? () => mt19937NextFloat(state) : undefined
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
  entity.bedrock.riding = false
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
  moveTowardsClosestSpace(ctx, entity, tick)

  entity.bedrock.pendingSlowdowns = entity.gameMode === 'spectator' ? new Set() : slowdownBlocksIn(ctx.world, entity.bedrock.aabb!)
  // the climbable-block flag the client's own check sets after the move (what a restatement is weighed against)
  entity.bedrock.ascendable = ascendableAt(ctx.world, entity.bedrock.aabb!, !!entity.leatherBoots)
  entity.bedrock.overDescendable = ascendableAt(ctx.world, entity.bedrock.aabb!, !!entity.leatherBoots, Math.floor(f(entity.bedrock.aabb!.minY + -1)))
  endInput(entity)
  standOnSticky(ctx, entity, tick)
  tickMovementEffects(entity)
  return entity
}
