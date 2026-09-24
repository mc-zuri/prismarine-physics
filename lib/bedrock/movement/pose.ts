// The player's pose: standing, sneaking, crawling, swimming. The pose the player wants each tick comes from the sneak
// key, the room the box has for each height and the current flags; the swim pose starts and stops on its own rules.
import type { BoxLike } from '../math/box.ts'
import { f } from '../math/float.ts'
import type { BedrockState, Vec3Like, XZ } from '../types.ts'
import { SPRINT_FORWARD_GATE, type SprintRequest } from './sprint.ts'

// The standing box height.
export const STAND_HEIGHT = 1.8
// The sneaking box height.
export const SNEAK_HEIGHT = 1.49
// The swimming, gliding and crawling box is as tall as it is wide.
export const HORIZONTAL_POSE_HEIGHT = f(0.6)

// The actions that change the box's pose.
export const POSE_ACTIONS = ['startSwimming', 'stopSwimming', 'startCrawling', 'stopCrawling', 'startSneaking', 'stopSneaking', 'startGliding', 'stopGliding', 'startSpinAttack', 'stopSpinAttack'] as const

// The pose's box height: the horizontal poses are width x width, sneaking 1.49, else standing.
export function poseHeightOf (sneaking: boolean, horizontal: boolean, standHeight = STAND_HEIGHT): number {
  return horizontal ? HORIZONTAL_POSE_HEIGHT : sneaking ? SNEAK_HEIGHT : standHeight
}

// ---- room for each pose --------------------------------------------------------------------------------------------

// Whether the box has room to stand, to sneak and to crawl.
export interface Room { stand: boolean, sneak: boolean, crawl: boolean }

const PROBE_CONTRACTION = f(0.01)
const PROBE_STAND_HEIGHT = f(1.8)
const PROBE_CRAWL_HEIGHT = f(0.6)

// The box contracted by `amount` on every face; a face pair that crosses collapses to its midpoint.
export function contractPoseBox (box: BoxLike, amount: number): BoxLike {
  const out = {
    minX: f(amount + box.minX),
    minY: f(amount + box.minY),
    minZ: f(box.minZ + amount),
    maxX: f(box.maxX - amount),
    maxY: f(box.maxY - amount),
    maxZ: f(box.maxZ - amount)
  }
  if (out.minX > out.maxX) out.minX = out.maxX = f(f(out.minX + out.maxX) * 0.5)
  if (out.minY > out.maxY) out.minY = out.maxY = f(f(out.maxY + out.minY) * 0.5)
  if (out.minZ > out.maxZ) out.minZ = out.maxZ = f(f(out.minZ + out.maxZ) * 0.5)
  return out
}

function strictlyOverlaps (a: BoxLike, b: BoxLike): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY && a.minZ < b.maxZ && b.minZ < a.maxZ
}

// Clears the room flags whose pose box (the box at that height, contracted by 0.01) strictly overlaps a collision box
// from `query`. The probes nest: sneaking is only tried once standing is blocked, crawling once sneaking is. The flags
// are only cleared, so the caller passes the room it starts from.
export function updatePoseClearance (original: BoxLike, room: Room, sneakHeight: number, query: (box: BoxLike) => BoxLike[]): Room {
  const blocked = (height: number): boolean => {
    const box = contractPoseBox({ ...original, maxY: f(original.minY + height) }, PROBE_CONTRACTION)
    return query(box).some(one => strictlyOverlaps(one, box))
  }
  if (blocked(PROBE_STAND_HEIGHT)) {
    room.stand = false
    if (blocked(f(sneakHeight))) {
      room.sneak = false
      if (blocked(PROBE_CRAWL_HEIGHT)) room.crawl = false
    }
  }
  return room
}

// ---- the swim pose amount ------------------------------------------------------------------------------------------

const SWIM_AMOUNT_STEP = f(0.1)

// One tick of the swim pose amount: up a tenth while swimming or crawling, down a tenth otherwise, within [0, 1]. A
// NaN amount comes back as the bound.
export function stepSwimAmount (amount: number, swimmingOrCrawling: boolean): number {
  if (swimmingOrCrawling) {
    const risen = f(amount + SWIM_AMOUNT_STEP)
    return risen < 1 ? risen : 1
  }
  const fallen = f(amount + -SWIM_AMOUNT_STEP)
  return fallen > 0 ? fallen : 0
}

// ---- starting and stopping a swim ----------------------------------------------------------------------------------

const SWIM_VIEW_MAX_Y = 0.15
const RAD_TO_DEG = f(57.295776)
const SWIM_SURFACE_ANGLE = 45

// The facts the swim start and stop read.
export interface SwimFacts {
  swimming: boolean
  eyeInWater: boolean
  flying: boolean
  // the eye cell is air, and the cell above the box centre is not air
  breathingInAir: boolean
  aboveCentreIsAir: boolean
  inWater: boolean
  view: Vec3Like
  move: XZ
  sprint: SprintRequest
  hungerLimited: boolean
  room: Room
}

// A sprinting player whose eye is under water starts swimming when it is fully submerged or looking down; a swimmer
// stops when it no longer moves forward, is hungry, cancelled the sprint, left the water, or surfaced and looks up
// more than 45 degrees -- and only when there is room to stand.
export function swimAction (facts: SwimFacts): 'startSwimming' | 'stopSwimming' | null {
  if (!facts.swimming) {
    if (!facts.eyeInWater || facts.flying) return null
    const submerged = !facts.breathingInAir && !facts.aboveCentreIsAir
    const starts = (submerged || SWIM_VIEW_MAX_Y > facts.view.y) && facts.sprint.isSprinting && !facts.sprint.stopSprinting
    return starts ? 'startSwimming' : null
  }
  const view = facts.view
  // the view's angle off the horizontal (acos of the horizontal length squared, unclamped), and the move length
  const dot = f(f(view.z * view.z) + f(f(0 * view.y) + f(view.x * view.x)))
  const angleDeg = f(f(Math.acos(dot)) * RAD_TO_DEG)
  const moveLen = f(Math.sqrt(f(f(facts.move.z * facts.move.z) + f(facts.move.x * facts.move.x))))
  let stop = true
  if (!(SPRINT_FORWARD_GATE > moveLen) && !facts.hungerLimited && !facts.sprint.sprintCanceled && facts.inWater) {
    stop = facts.breathingInAir ? (angleDeg > SWIM_SURFACE_ANGLE && view.y > 0) : false
  }
  return stop && facts.room.stand ? 'stopSwimming' : null
}

// ---- sneaking, crawling --------------------------------------------------------------------------------------------

const SNEAK_FROM_SWIM_MOVE_SQ = f(0.49999997)

// The facts the sneak / crawl / swim decision reads.
export interface PoseFacts {
  sneakDown: boolean
  flyIntent?: boolean | undefined
  glideIntent?: boolean | undefined
  passenger?: boolean | undefined
  spectator?: boolean | undefined
  spinAttack?: boolean | undefined
  unblockedToStand: boolean
  unblockedToSneak: boolean
  unblockedToCrawl: boolean
  crawlSupported?: boolean | undefined
  wasInWater?: boolean | undefined
  move: XZ
}

// The pose changes wanted this tick ({ sneak, crawl, swim }: true / false, or absent for no change).
export interface PoseChanges { sneak?: boolean, crawl?: boolean, swim?: boolean }

// The sneak / crawl / swim pose the player wants. With room to stand (or when it must stand: a spectator), a crawl
// ends and a released sneak ends; with room only to sneak, a crawl becomes a sneak and a swimmer barely moving
// sneaks; with room only to crawl, a player crawls on land and swims in water; otherwise the sneak key sneaks.
export function poseIntent (st: BedrockState, facts: PoseFacts): PoseChanges {
  const releasedSneak = facts.sneakDown ? !!facts.flyIntent : true
  const mustStand = facts.passenger || facts.glideIntent ? true : !!facts.spectator || !!facts.spinAttack
  const result: PoseChanges = {}
  if (mustStand || facts.unblockedToStand) {
    if (st.crawling) result.crawl = false
    if (st.sneaking && releasedSneak) {
      result.sneak = false
      return result
    }
  } else if (facts.unblockedToSneak) {
    if (st.crawling) return { sneak: true, crawl: false }
    if (st.swimming) {
      const lengthSq = f(f(facts.move.x * facts.move.x) + f(facts.move.z * facts.move.z))
      if (!(lengthSq < SNEAK_FROM_SWIM_MOVE_SQ)) return result
      result.swim = false
    }
    result.sneak = true
    return result
  } else if (facts.crawlSupported !== false && facts.unblockedToCrawl) {
    if (!st.swimming) return facts.wasInWater ? { crawl: false, swim: true } : { crawl: true }
    if (!facts.wasInWater) return { crawl: true, swim: false }
  }
  if (st.sneaking || releasedSneak) return result
  result.sneak = true
  return result
}

// One start / stop action per pose whose wanted value differs from its flag.
export function raisePoseActions (st: BedrockState, changes: PoseChanges, actions: Set<string>): void {
  if (changes.swim !== undefined && !!st.swimming !== changes.swim) actions.add(changes.swim ? 'startSwimming' : 'stopSwimming')
  if (changes.crawl !== undefined && !!st.crawling !== changes.crawl) actions.add(changes.crawl ? 'startCrawling' : 'stopCrawling')
  if (changes.sneak !== undefined && !!st.sneaking !== changes.sneak) actions.add(changes.sneak ? 'startSneaking' : 'stopSneaking')
}

// The actions applied to the flags, each start before its stop (both on one tick leave the flag off).
export function applyPoseActions (st: BedrockState, actions: ReadonlySet<string>): void {
  if (actions.has('startSwimming')) st.swimming = true
  if (actions.has('stopSwimming')) st.swimming = false
  if (actions.has('startCrawling')) st.crawling = true
  if (actions.has('stopCrawling')) st.crawling = false
  if (actions.has('startSneaking')) st.sneaking = true
  if (actions.has('stopSneaking')) st.sneaking = false
}

// Whether any pose action fired this tick (the box then takes the new pose's height).
export function poseChanged (actions: ReadonlySet<string>): boolean {
  return POSE_ACTIONS.some(action => actions.has(action))
}
