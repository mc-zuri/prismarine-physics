import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { clipAxis, collide, sweep } from '../../../../lib/bedrock/movement/collision.ts'
import { worldOf } from '../helpers.ts'

const f = Math.fround
const player = (x = 0.5, y = 0, z = 0.5): Box => new Box(f(x - 0.3), y, f(z - 0.3), f(x + 0.3), f(y + 1.8), f(z + 0.3))

describe('bedrock movement/collision', () => {
  describe('clipping one axis against one shape', () => {
    const floor = new Box(0, -1, 0, 1, 0, 1)

    it('stops a fall on a floor below', () => {
      const clip = clipAxis(floor, player(0.5, 0.5), [0, -1, 0])
      assert.deepStrictEqual(clip, { depth: 0, unpushed: [0, f(-0.5), 0], pushed: [0, f(-0.5), 0], axis: 0 })
    })

    it('does not clip a motion that falls short, or goes away', () => {
      assert.deepStrictEqual(clipAxis(floor, player(0.5, 0.5), [0, -0.2, 0]).pushed, [0, -0.2, 0])
      assert.deepStrictEqual(clipAxis(floor, player(0.5, 0.5), [0, 1, 0]).pushed, [0, 1, 0])
    })

    it('stops a move into a wall on the positive side', () => {
      const wall = new Box(1, 0, 0, 2, 1, 1)
      assert.deepStrictEqual(clipAxis(wall, player(0.5, 0), [1, 0, 0]).pushed, [f(1 - f(0.8)), 0, 0])
    })

    it('ignores a shape clear of the box on two axes, and an empty shape', () => {
      assert.deepStrictEqual(clipAxis(new Box(2, 2, 0, 3, 3, 1), player(), [1, 0, 0]).pushed, [1, 0, 0])
      assert.deepStrictEqual(clipAxis(new Box(0, 0, 0, 0, 1, 1), player(), [1, 0, 0]).pushed, [1, 0, 0])
      assert.deepStrictEqual(clipAxis(new Box(0, 0, 0, 1, 0, 1), player(), [1, 0, 0]).pushed, [1, 0, 0])
      assert.deepStrictEqual(clipAxis(new Box(0, 0, 0, 1, 1, 0), player(), [1, 0, 0]).pushed, [1, 0, 0])
    })

    it('counts a gap within 1e-6 as touching', () => {
      const box = player(0.5, f(1e-7))
      assert.deepStrictEqual(clipAxis(floor, box, [0, -0.5, 0]).pushed, [0, 0, 0])
    })

    it('pushes an overlapping box out along the shallowest axis', () => {
      const clip = clipAxis(new Box(0, -1, 0, 1, 0.1, 1), player(0.5, 0), [0, -0.1, 0])
      assert.strictEqual(clip.axis, 1)
      assert.strictEqual(clip.depth, f(0.1))
      assert.deepStrictEqual(clip.pushed, [0, f(0.1), 0])
      assert.deepStrictEqual(clip.unpushed, [0, -0.1, 0])
    })

    it('pushes out along x or z when that is shallower, toward the nearer side', () => {
      const xClip = clipAxis(new Box(0.7, 0, 0, 2, 1, 1), player(0.5, 0), [0.05, 0, 0])
      assert.strictEqual(xClip.axis, 0)
      assert.deepStrictEqual(xClip.pushed, [-f(f(0.8) - 0.7), 0, 0])
      const zClip = clipAxis(new Box(0, 0, -1, 1, 1, 0.3), player(0.5, 0), [0, 0, -0.05])
      assert.strictEqual(zClip.axis, 2)
      assert.deepStrictEqual(zClip.pushed, [0, 0, f(0.3 - f(0.2))])
    })

    it('keeps the requested motion when it already exceeds the push', () => {
      const clip = clipAxis(new Box(0, -1, 0, 1, 0.1, 1), player(0.5, 0), [0, 0.5, 0])
      assert.deepStrictEqual(clip.pushed, [0, 0.5, 0])
      const down = clipAxis(new Box(0.7, 0, 0, 2, 1, 1), player(0.5, 0), [-0.5, 0, 0])
      assert.deepStrictEqual(down.pushed, [-0.5, 0, 0])
    })
  })

  describe('the sweep', () => {
    it('moves Y, then X, then Z, returning the applied movement', () => {
      const box = player(0.5, 0.5)
      const moved = sweep(box, 0.3, -1, 0.2, [new Box(-5, -1, -5, 5, 0, 5)])
      assert.deepStrictEqual([moved.x, moved.y, moved.z], [f(0.3), f(-0.5), f(0.2)])
      assert.strictEqual(box.minY, 0)
    })

    it('moves through a shape overlapped deeper than the limit of its axis, and reports the clip depths', () => {
      const report = { totalClip: 0 }
      const pushed = sweep(player(0.5, 0), 0, -0.1, 0, [new Box(0, -1, 0, 1, 0.1, 1)], { x: 1, y: 1, z: 1 }, report)
      assert.strictEqual(pushed.y, f(0.1))
      assert.strictEqual(report.totalClip, f(0.1))
      const through = sweep(player(0.5, 0), 0, -0.1, 0, [new Box(0, -1, 0, 1, 0.1, 1)], { x: 1, y: 0.01, z: 1 })
      assert.strictEqual(through.y, f(-0.1))
    })

    it('moves through a shape overlapped deeper than one block', () => {
      const box = player(0.5, 0)
      const moved = sweep(box, 0, -0.1, 0, [new Box(-5, -5, -5, 5, 5, 5)])
      assert.strictEqual(moved.y, f(-0.1))
    })

    it('collides with the blocks around the path', () => {
      const world = worldOf({ '1,0,0': 'stone' })
      const moved = collide(world, player(0.5, 0), 0.5, -0.1, 0)
      assert.deepStrictEqual([moved.x, moved.y, moved.z], [f(1 - f(0.8)), 0, 0])
    })
  })
})
