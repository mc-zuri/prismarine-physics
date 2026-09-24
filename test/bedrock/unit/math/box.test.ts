import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'

describe('bedrock math/box', () => {
  it('copies a box and a box-like', () => {
    const box = new Box(0, 1, 2, 3, 4, 5)
    const copy = box.clone()
    assert.notStrictEqual(copy, box)
    assert.deepStrictEqual(copy, box)
    assert.deepStrictEqual(Box.from({ minX: 0, minY: 1, minZ: 2, maxX: 3, maxY: 4, maxZ: 5 }), box)
  })

  it('extends toward the motion on each axis', () => {
    assert.deepStrictEqual(new Box(0, 0, 0, 1, 1, 1).extend(-1, 2, -3), new Box(-1, 0, -3, 1, 3, 1))
    assert.deepStrictEqual(new Box(0, 0, 0, 1, 1, 1).extend(1, -2, 3), new Box(0, -2, 0, 2, 1, 4))
  })

  it('offsets both corners', () => {
    assert.deepStrictEqual(new Box(0, 0, 0, 1, 1, 1).offset(1, 2, 3), new Box(1, 2, 3, 2, 3, 4))
  })

  it('intersects only on a strict overlap of all three axes', () => {
    const unit = new Box(0, 0, 0, 1, 1, 1)
    assert.ok(unit.intersects(new Box(0.5, 0.5, 0.5, 2, 2, 2)))
    assert.ok(!unit.intersects(new Box(1, 0, 0, 2, 1, 1)), 'touching faces')
    assert.ok(!unit.intersects(new Box(0, 1, 0, 1, 2, 1)))
    assert.ok(!unit.intersects(new Box(0, 0, 1, 1, 1, 2)))
    assert.ok(!unit.intersects(new Box(-1, 0, 0, 0, 1, 1)))
    assert.ok(!unit.intersects(new Box(0, -1, 0, 1, 0, 1)))
    assert.ok(!unit.intersects(new Box(0, 0, -1, 1, 1, 0)))
  })
})
