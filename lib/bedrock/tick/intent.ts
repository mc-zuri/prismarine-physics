// What the player wants this tick: the input, the sprint, and the pose (swimming, flying, gliding, sneaking,
// crawling), each decided from the input and the previous tick's state.
import { Box } from '../math/box.ts'
import { f } from '../math/float.ts'
import { viewOf } from '../math/rotation.ts'
import { creativeGlideBoost, flyToggleApplied, flyTrigger, glideTriggers } from '../movement/flight.ts'
import { cook, travelInput, usingItemMove } from '../movement/input.ts'
import { applyPoseActions, poseIntent, raisePoseActions, SNEAK_HEIGHT, stepSwimAmount, swimAction, updatePoseClearance, type Room } from '../movement/pose.ts'
import { hungerLimited, sprintTrigger, tickTriggerTimers, type SprintRequest } from '../movement/sprint.ts'
import { setSprintBoost } from '../movement/travel.ts'
import type { Ctx, Simulated } from '../types.ts'
import { blockAt, blockName, collisionBoxes } from '../world/blocks.ts'
import { climbableAt } from '../world/climbables.ts'
import { isLavaName, isWaterName, pointInWater } from '../world/liquids.ts'
import type { TickState } from './state.ts'

// Cooks the control state into the tick's input.
export function readInput (entity: Simulated, tick: TickState): void {
  const st = entity.bedrock
  const input = cook(tick.control, st.keys, {
    flying: tick.flying,
    wasInWater: entity.isInWater,
    swimming: !!st.swimming,
    sneaking: !!st.sneaking,
    crawling: !!st.crawling,
    swiftSneak: entity.swiftSneak
  })
  if (entity.usingItem && !entity.vehicle) input.move = usingItemMove(input.move)
  st.keys = input.keys
  st.input = input
  tick.travel = travelInput(input)
}

// The sprint decision, the sprint boost on the movement attribute, and the jumping flag the next tick's sprint
// decision reads. Starts the tick's action set.
export function decideSprint (ctx: Ctx, entity: Simulated, tick: TickState): SprintRequest {
  const st = entity.bedrock
  st.actions = new Set()
  if (entity.itemUseStarted) st.actions.add('startUsingItem')
  entity.itemUseStarted = false
  tickTriggerTimers(st)
  const request = sprintTrigger(st, {
    move: st.input!.move,
    sprintDown: st.keys!.sprintDown,
    usingItem: !!entity.usingItem,
    blindness: entity.blindness! > 0,
    food: entity.food,
    mayFly: !!entity.mayFly,
    onGround: tick.startedOnGround,
    wasInWater: entity.isInWater,
    flying: tick.flying,
    swimming: !!st.swimming,
    pos: entity.pos,
    touch: false
  })
  if (request.start) setSprintBoost(entity, ctx.settings, true)
  if (request.stop) setSprintBoost(entity, ctx.settings, false)
  tick.sprinting = !!st.sprinting
  st.jumpingFlag = (st.input!.jumping || st.keys!.ascendBlock) && !tick.flying
  return request
}

// The room the box has to stand, sneak and crawl.
export function poseRoom (ctx: Ctx, entity: Simulated): Room {
  return updatePoseClearance(entity.bedrock.aabb!, { stand: true, sneak: true, crawl: true }, SNEAK_HEIGHT,
    (box) => collisionBoxes(ctx.world, Box.from(box)))
}

// The fly toggle, the glide start / stop and the creative glide lift; returns the intents the sneak decision reads.
export function decideFlight (ctx: Ctx, entity: Simulated, tick: TickState): { flyIntent: boolean, glideIntent: boolean } {
  const st = entity.bedrock
  const actions = st.actions!
  tick.flyIntent = flyTrigger(st, st.keys!, tick.flyIntent, !!entity.mayFly, actions)
  flyToggleApplied(st, actions, !!entity.mayFly)
  // the toggle sets the client's flying ability from the next tick (the server confirms it later)
  if (actions.has('startFlying')) st.flying = true
  else if (actions.has('stopFlying')) st.flying = false
  const glideTicks = st.fallFlyTicks || 0
  const glideIntent = glideTriggers(st, {
    jumping: st.input!.jumping,
    elytra: !!entity.elytraEquipped,
    onGround: tick.startedOnGround,
    wasInWater: !!entity.isInWater,
    flyIntent: tick.flyIntent,
    instabuild: !!entity.instabuild,
    climbable: !!climbableAt(ctx.world, entity.pos, st.aabb!, !!entity.leatherBoots)
  }, actions)
  creativeGlideBoost(entity.vel, { gliding: !!st.gliding, jumping: st.input!.jumping, instabuild: !!entity.instabuild, glideTicks })
  return { flyIntent: tick.flyIntent, glideIntent }
}

// The standing eye height, and the eye's drop from it the pose asks for: to 0.4 lying down (swimming, crawling,
// gliding or spinning), by 0.35 sneaking.
const STAND_EYE = f(1.62001)
function eyeOffsetTarget (st: Simulated['bedrock']): number {
  if (st.swimming || st.crawling || st.gliding || st.spinning) return f(STAND_EYE - f(0.40000001))
  return st.sneaking ? f(0.35) : 0
}

// The pose of the tick, in order: the swim pose amount steps from the previous tick's flags; the swim starts or stops;
// the fly and glide triggers run; the sneak / crawl / swim intent is decided and applied to the flags.
export function decidePose (ctx: Ctx, entity: Simulated, tick: TickState, sprint: SprintRequest): void {
  const st = entity.bedrock
  const pos = entity.pos
  const actions = st.actions!
  const swimming = !!st.swimming
  if (st.eyeOffset === undefined) st.eyeOffset = st.eyeOffsetPrev = eyeOffsetTarget(st)
  // the eye the checks read: the standing eye less its drop as it stood before the last easing
  const eyeY = f(f(pos.y + STAND_EYE) - st.eyeOffsetPrev!)
  // the eye in water as breathing reads it: the block at the eye itself (a waterlogged plant's water does not count)
  const eyeInWater = pointInWater(ctx.world, pos.x, eyeY, pos.z, false)

  st.poseAmount = st.poseAmount === undefined ? (st.swimming ? 1 : 0) : stepSwimAmount(st.poseAmount, !!(st.swimming || st.crawling))

  const view = viewOf(entity)
  const room = poseRoom(ctx, entity)
  const aabb = st.aabb!
  const centreY = f(f(f(aabb.maxY - aabb.minY) * 0.5) + aabb.minY)
  // the water the swim weighs is the one the last move left, and a teleport tick makes none: it starts or stops no swim
  const swim = !st.teleported && swimAction({
    swimming,
    eyeInWater,
    flying: tick.flying,
    breathingInAir: blockName(blockAt(ctx.world, pos.x, eyeY, pos.z)) === 'air',
    aboveCentreIsAir: blockName(blockAt(ctx.world, pos.x, Math.floor(centreY) + 1, pos.z)) === 'air',
    inWater: !!entity.isInWater,
    view,
    move: st.input!.move,
    sprint,
    hungerLimited: hungerLimited(entity.food, entity.mayFly),
    room
  })
  if (swim) actions.add(swim)

  const { flyIntent, glideIntent } = decideFlight(ctx, entity, tick)
  const changes = poseIntent(st, {
    sneakDown: st.keys!.sneakDown,
    flyIntent,
    glideIntent,
    spectator: entity.gameMode === 'spectator',
    spinAttack: !!st.spinning,
    unblockedToStand: room.stand,
    unblockedToSneak: room.sneak,
    unblockedToCrawl: room.crawl,
    wasInWater: entity.isInWater,
    move: st.input!.move
  })
  raisePoseActions(st, changes, actions)
  applyPoseActions(st, actions)

  st.headInWater = eyeInWater
  // the eye eases toward the pose now decided
  st.eyeOffsetPrev = st.eyeOffset
  st.eyeOffset = f(f(f(eyeOffsetTarget(st) - st.eyeOffset) * 0.5) + st.eyeOffset)
  const breathing = blockName(blockAt(ctx.world, pos.x, eyeY, pos.z))
  st.breathingInLiquid = isWaterName(breathing) || isLavaName(breathing)
  st.view = view
  entity.isSwimming = !!st.swimming
  tick.sneaking = !!st.sneaking
}
