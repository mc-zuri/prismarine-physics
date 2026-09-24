import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { applyBubbleColumns, bubblePush, dragsDown } from '../../../../lib/bedrock/world/bubble-columns.ts'
import type { Block, World } from '../../../../lib/bedrock/types.ts'
import { block, settings } from '../helpers.ts'
import { Vec3 } from 'vec3'

const f = Math.fround
const { bubbleColumnDrag: INNER, bubbleColumnSurfaceDrag: SURFACE } = settings()
const UP: Block = { name: 'bubble_column', boundingBox: 'empty', _properties: { drag_down: false } }
const DOWN: Block = { name: 'bubble_column', boundingBox: 'empty', _properties: { drag_down: true } }

// A column at x = z = 0 from y = 0 to 3 of `cell`, with `above` at y = 4.
function column (cell: Block, above = 'air'): World {
  return {
    getBlock (pos: Vec3) {
      if (pos.x !== 0 || pos.z !== 0) return block('air')
      if (pos.y >= 0 && pos.y <= 3) return cell
      return pos.y === 4 ? block(above) : block('air')
    }
  }
}

const box = (y: number): Box => new Box(0.2, y, 0.2, 0.8, y + 1.8, 0.8)

describe('bedrock world/bubble-columns', () => {
  it('reads the drag direction from the block state', () => {
    assert.ok(dragsDown(DOWN))
    assert.ok(dragsDown({ name: 'bubble_column', getProperties: () => ({ drag_down: 1 }) }))
    assert.ok(dragsDown({ name: 'bubble_column', _properties: { drag_down: 'true' } }))
    assert.ok(dragsDown({ name: 'bubble_column', _properties: { drag_down: '1' } }))
    assert.ok(!dragsDown(UP))
    assert.ok(!dragsDown({ name: 'bubble_column' }), 'no state: up')
    assert.ok(!dragsDown(null))
  })

  it('pushes a cell up to a cap, or drags it down to one', () => {
    assert.strictEqual(bubblePush(0, false, INNER), f(0.06))
    assert.strictEqual(bubblePush(0.69, false, INNER), f(0.7))
    assert.strictEqual(bubblePush(0, true, INNER), f(-0.03))
    assert.strictEqual(bubblePush(-5, true, SURFACE), f(-0.9))
    assert.strictEqual(bubblePush(0, false, SURFACE), f(0.1))
  })

  it('pushes once for each column cell the box is in, the top cell under air with the surface values', () => {
    const inside = { x: 0, y: 0, z: 0 }
    applyBubbleColumns(column(UP), box(0), inside, INNER, SURFACE)
    assert.strictEqual(inside.y, f(f(0 + f(INNER.up)) + f(INNER.up)), 'cells 0 and 1')
    const top = { x: 0, y: 0, z: 0 }
    applyBubbleColumns(column(UP), box(2.5), top, INNER, SURFACE)
    assert.strictEqual(top.y, f(f(0 + f(INNER.up)) + f(SURFACE.up)), 'cells 2 and 3, 3 under air')
  })

  it('uses the inner values under water above the column', () => {
    const vel = { x: 0, y: 0, z: 0 }
    applyBubbleColumns(column(UP, 'water'), box(2.5), vel, INNER, SURFACE)
    assert.strictEqual(vel.y, f(f(0 + f(INNER.up)) + f(INNER.up)))
  })

  it('drags down in a column whose blocks say so', () => {
    const vel = { x: 0, y: 0, z: 0 }
    applyBubbleColumns(column(DOWN), box(1), vel, INNER, SURFACE)
    assert.strictEqual(vel.y, f(f(0 + f(-INNER.down)) + f(-INNER.down)))
  })

  it('leaves the velocity alone out of a column, and in water that is not a column', () => {
    const vel = { x: 0, y: 0.3, z: 0 }
    applyBubbleColumns(column(UP), new Box(2.2, 0, 2.2, 2.8, 1.8, 2.8), vel, INNER, SURFACE)
    applyBubbleColumns(column(block('water')), box(1), vel, INNER, SURFACE)
    assert.strictEqual(vel.y, 0.3)
  })
})
