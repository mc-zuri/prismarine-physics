// How far the player has fallen: what powder snow's shape reads (a fall of more than 2.5 lands on it).
import { f } from '../math/float.ts'

// What the fall distance after a move reads.
export interface FallFacts {
  onGround: boolean
  // in water after the move
  inWater: boolean
  climbing: boolean
  flying: boolean
  // inside cobweb, powder snow or a berry bush after the move
  slowed: boolean
  // the vertical movement the move made
  movedY: number
}

// Standing, swimming, climbing, flying or being slowed by a block clears the fall; a move down adds its drop, any other
// move clears it.
export function nextFallDistance (fallDistance: number, facts: FallFacts): number {
  if (facts.onGround || facts.inWater || facts.climbing || facts.flying || facts.slowed) return 0
  return facts.movedY < 0 ? f(fallDistance - facts.movedY) : 0
}
