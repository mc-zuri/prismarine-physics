// Jumping, and rising or sinking in a liquid with the jump and sneak keys.
import { f } from '../math/float.ts'
import { DEG_TO_RAD, tableCosRad, tableSinRad } from '../math/rotation.ts'
import type { Block, ClimbableKind, Vec3Like } from '../types.ts'
import { blockName } from '../world/blocks.ts'

// A liquid's rise (jump held) and a water sink (sneak held), per tick.
const FLUID_BUOYANCY = f(0.04)
// A jump from a honey block, or from a climbable, reaches 0.6 of the height.
const REDUCED_JUMP = f(0.60000002)
const JUMP_REDUCING_BLOCKS = new Set(['honey_block', 'ladder', 'vine', 'cave_vines', 'twisting_vines', 'weeping_vines'])
// The climb speed on ladders and vines.
export const LADDER_CLIMB_SPEED = f(0.2)
// The climb and descend speed in scaffolding.
export const SCAFFOLDING_CLIMB_SPEED = f(0.15)

// The climb speed of a climbable.
export function climbSpeed (kind: ClimbableKind): number {
  return kind === 'scaffolding' ? SCAFFOLDING_CLIMB_SPEED : LADDER_CLIMB_SPEED
}

// Sneaking in water sinks 0.04 per tick (the sneak key or the slow descend), unless flying.
export function waterSink (y: number, { down, downSlow, flying }: { down?: boolean | undefined, downSlow?: boolean | undefined, flying?: boolean | undefined }): number {
  if ((!down && !downSlow) || flying) return y
  return f(f(y) + f(-0.04))
}

// Whether a jump from these blocks (the one at the feet and the one below) is reduced.
export function jumpReduced (feet: Block | null | undefined, below: Block | null | undefined): boolean {
  return JUMP_REDUCING_BLOCKS.has(blockName(feet)) || JUMP_REDUCING_BLOCKS.has(blockName(below))
}

// The jump impulse: 0.42 plus 0.1 per Jump Boost level, times 0.6 when reduced.
export function jumpVelocity (base: number, jumpBoost: number | undefined, reduced: boolean): number {
  const boost = f((jumpBoost || 0) * 0.1)
  return f(f(base + boost) * (reduced ? REDUCED_JUMP : 1))
}

// A sprint jump also pushes 0.2 along the facing direction.
export function sprintJumpBoost (vel: Vec3Like, yawDeg: number, boost: number): void {
  const radians = f(yawDeg * DEG_TO_RAD)
  const b = f(boost)
  vel.x = f(vel.x - f(tableSinRad(radians) * b))
  vel.z = f(f(tableCosRad(radians) * b) + vel.z)
}

// The facts the jump reads in a liquid.
export interface LiquidJumpFacts {
  jump: boolean
  wasInWater?: boolean | undefined
  wasInLava?: boolean | undefined
  // the swim pose: swimming with the head out of the water, and the swim pose amount
  swimming?: boolean | undefined
  headInWater?: boolean | undefined
  poseAmount?: number | undefined
  wantDown?: boolean | undefined
  wantDownSlow?: boolean | undefined
  flying?: boolean | undefined
}

// Whether a held jump holds the vertical motion: swimming with the head out of the water, or the swim pose between
// states.
export function swimPoseHold (facts: { swimming?: boolean | undefined, headInWater?: boolean | undefined, poseAmount?: number | undefined }): boolean {
  const amount = facts.poseAmount!
  return !!((facts.swimming && !facts.headInWater) || (amount > 0 && amount < 1))
}

// The jump and sneak in a liquid. A held jump while swimming with the head out, or while the swim pose is between
// states, holds the vertical motion of a player that was in water; in water sneaking sinks and jumping rises 0.04; in
// lava jumping rises 0.04 (sneaking does not sink). Returns the vertical velocity, or null when not in a liquid case.
export function liquidJump (y: number, facts: LiquidJumpFacts): number | null {
  if (facts.jump && swimPoseHold(facts)) return facts.wasInWater ? 0 : y
  if (facts.wasInWater) {
    const sunk = waterSink(y, { down: facts.wantDown, downSlow: facts.wantDownSlow, flying: facts.flying })
    return facts.jump ? f(sunk + FLUID_BUOYANCY) : sunk
  }
  if (facts.wasInLava) return facts.jump ? f(y + FLUID_BUOYANCY) : y
  return null
}
