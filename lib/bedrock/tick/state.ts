// What one tick works out and hands from step to step.
import type { Box } from '../math/box.ts'
import type { Block, Control, SlowdownBlock, Vec3Like, XZ } from '../types.ts'

// The values one tick works out and passes from step to step.
export interface TickState {
  control: Control
  // the ground and the block under the feet as the tick started
  startedOnGround: boolean
  groundBlock: Block | null | undefined
  groundFriction: number
  // the flying ability, and the fly intent after the double-tap toggle
  flying: boolean
  flyIntent: boolean
  // the move the travel uses (damped), once the input is read
  travel: XZ
  // the sprint and sneak flags after this tick's triggers
  sprinting: boolean
  sneaking: boolean
  // a teleport was handled since the last tick: the tick ends after the jump
  teleported: boolean
  // a jump the restated climbable-block flag turned into a 0.15 rise
  ascendJumped: boolean
  // the teleport is a respawn's: its tick still falls
  respawned: boolean
  // gliding this tick (the glide flag, out of liquids and climbables)
  gliding: boolean
  // the slowdown blocks scaling this tick's move, and whether one did
  slowdowns: ReadonlySet<SlowdownBlock>
  slowed: boolean
  // the move asked of the collision sweep, the movement it applied, and the feet height before it
  requested: Vec3Like
  applied: Vec3Like
  preMoveY: number
  // the collision boxes the move was made against, and whether it ended inside a block
  moveShapes: Box[]
  penetrated: boolean
  // pushing into a climbable this tick climbs
  autoClimb: boolean
  // the swim speed multiplier (2 with a dolphin's boost)
  swimSpeedMultiplier: number
}

// A tick state before any step ran.
export function newTick (control: Control): TickState {
  return {
    control,
    startedOnGround: false,
    groundBlock: null,
    groundFriction: 0.6,
    flying: false,
    flyIntent: false,
    travel: { x: 0, z: 0 },
    sprinting: false,
    sneaking: false,
    teleported: false,
    ascendJumped: false,
    respawned: false,
    gliding: false,
    slowdowns: new Set(),
    slowed: false,
    requested: { x: 0, y: 0, z: 0 },
    applied: { x: 0, y: 0, z: 0 },
    preMoveY: 0,
    moveShapes: [],
    penetrated: false,
    autoClimb: false,
    swimSpeedMultiplier: 1
  }
}
