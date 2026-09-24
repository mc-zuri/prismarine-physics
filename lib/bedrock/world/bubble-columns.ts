// Bubble columns: every bubble_column cell the player's box is in pushes the vertical velocity, up or, where the
// block's state says it drags down (a column over magma), down. A cell with air above it is the column's surface and
// pushes harder.
import type { BoxLike } from '../math/box.ts'
import { f } from '../math/float.ts'
import type { Block, BubbleDrag, Vec3Like, World } from '../types.ts'
import { blockAt, blockName, isAir } from './blocks.ts'

const INSET = f(0.001)

// Whether a bubble_column block drags down: its `drag_down` state (false when the world does not carry it).
export function dragsDown (block: Block | null | undefined): boolean {
  const properties = block && (typeof block.getProperties === 'function' ? block.getProperties() : block._properties)
  const value = properties && properties.drag_down
  return value === true || value === 1 || value === '1' || value === 'true'
}

// One column cell's push on the vertical velocity: down by `down` to at least `maxDown`, or up by `up` to at most
// `maxUp`.
export function bubblePush (vy: number, dragDown: boolean, drag: BubbleDrag): number {
  return dragDown ? Math.max(f(vy + f(-drag.down)), f(drag.maxDown)) : Math.min(f(vy + f(drag.up)), f(drag.maxUp))
}

// Every bubble_column cell of the box shrunk by 0.001 (x, then y, then z) pushes the vertical velocity in turn, with
// `surface` where the cell above is air and `inner` elsewhere.
export function applyBubbleColumns (world: World, aabb: BoxLike, vel: Vec3Like, inner: BubbleDrag, surface: BubbleDrag): void {
  let vy = vel.y
  let touched = false
  for (let x = Math.floor(f(aabb.minX + INSET)); x <= Math.floor(f(aabb.maxX + -INSET)); x++) {
    for (let y = Math.floor(f(aabb.minY + INSET)); y <= Math.floor(f(aabb.maxY + -INSET)); y++) {
      for (let z = Math.floor(f(aabb.minZ + INSET)); z <= Math.floor(f(aabb.maxZ + -INSET)); z++) {
        const block = blockAt(world, x, y, z)
        if (blockName(block) !== 'bubble_column') continue
        vy = bubblePush(vy, dragsDown(block), isAir(blockAt(world, x, y + 1, z)) ? surface : inner)
        touched = true
      }
    }
  }
  if (touched) vel.y = vy
}
