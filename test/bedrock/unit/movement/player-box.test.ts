import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import {
  applyMovementToBox, boxAround, boxIsCurrent, catchOnScaffolding, dropBox, ensureBox, type CatchFacts
} from '../../../../lib/bedrock/movement/player-box.ts'
import type { BedrockState } from '../../../../lib/bedrock/types.ts'
import { player, worldOf } from '../helpers.ts'

const f = Math.fround

describe('bedrock movement/player-box', () => {
  it('builds a box around a position: centred, floor at the position less the offset', () => {
    assert.deepStrictEqual(boxAround({ x: 0.5, y: 1, z: 0.5 }, { width: 0.6, height: 1.8 }), { minX: f(0.5 - f(0.3)), minY: 1, minZ: f(0.5 - f(0.3)), maxX: f(0.5 + f(0.3)), maxY: f(2.8), maxZ: f(0.5 + f(0.3)) })
    const offset = boxAround({ x: 0, y: 1, z: 0 }, { width: 1, height: 1, offset: 1 })
    assert.deepStrictEqual([offset.minY, offset.maxY], [0, 1])
  })

  it('knows whether the box was built at the current position', () => {
    assert.ok(!boxIsCurrent(undefined, { x: 0, y: 0, z: 0 }))
    assert.ok(!boxIsCurrent({}, { x: 0, y: 0, z: 0 }))
    const st: BedrockState = { anchor: new Vec3(1, 2, 3) }
    assert.ok(boxIsCurrent(st, { x: 1, y: 2, z: 3 }))
    assert.ok(!boxIsCurrent(st, { x: 1, y: 2.5, z: 3 }))
    assert.ok(!boxIsCurrent(st, { x: 1.5, y: 2, z: 3 }))
    assert.ok(!boxIsCurrent(st, { x: 1, y: 2, z: 3.5 }))
  })

  it('builds the box when there is none, and rebuilds it when something moved the player', () => {
    const p = player([0.5, 1, 0.5])
    const st = ensureBox(p, 1.8, 0.3)
    assert.strictEqual(p.bedrock, st)
    assert.deepStrictEqual(st.aabb, Box.from(boxAround(p.pos, { width: f(0.6), height: 1.8 })))
    st.sneaking = true
    p.pos.set(3.5, 1, 0.5)
    assert.strictEqual(ensureBox(p, 1.8, 0.3), st, 'the state object is kept')
    assert.strictEqual(st.aabb!.minX, f(3.5 - f(0.3)))
    assert.strictEqual(st.sneaking, true)
  })

  it('keeps a current box, and resizes it upward around its centre on a pose change', () => {
    const p = player([0.5, 1, 0.5])
    const st = ensureBox(p, 1.8, 0.3)
    const box = st.aabb
    assert.strictEqual(ensureBox(p, 1.8, 0.3).aabb, box)
    ensureBox(p, 0.6, 0.3)
    assert.strictEqual(st.aabb, box)
    assert.deepStrictEqual([box!.minY, box!.maxY, st.height], [1, f(1 + f(0.6)), 0.6])
    assert.deepStrictEqual([p.pos.x, p.pos.z], [f((box!.minX + box!.maxX) * 0.5), f((box!.minZ + box!.maxZ) * 0.5)])
    assert.ok(boxIsCurrent(st, p.pos))
  })

  it('drops the box so the next tick rebuilds it', () => {
    const st: BedrockState = { aabb: new Box(0, 0, 0, 1, 1, 1), anchor: new Vec3(0, 0, 0) }
    dropBox(st)
    assert.strictEqual(st.aabb, undefined)
    assert.ok(Number.isNaN(st.anchor!.x))
  })

  it('moves the box by each axis that moved, deriving the position from it', () => {
    const p = player([0.5, 1, 0.5])
    const st = ensureBox(p, 1.8, 0.3)
    applyMovementToBox(p, { x: 0.25, y: -0.5, z: 0 })
    assert.deepStrictEqual([st.aabb!.minX, st.aabb!.minY, st.aabb!.minZ], [f(f(0.5 - f(0.3)) + 0.25), 0.5, f(0.5 - f(0.3))])
    assert.deepStrictEqual([p.pos.x, p.pos.y, p.pos.z], [f((st.aabb!.minX + st.aabb!.maxX) * 0.5), 0.5, 0.5])
    applyMovementToBox(p, { x: 0, y: 0, z: 0.25 })
    assert.strictEqual(p.pos.z, f((st.aabb!.minZ + st.aabb!.maxZ) * 0.5))
    assert.ok(boxIsCurrent(st, p.pos))
  })

  describe('catching on scaffolding', () => {
    // a scaffolding column at x = z = 0, two cells high
    const column = worldOf({ '0,0,0': 'scaffolding', '0,1,0': 'scaffolding' }, null)
    const fallTo = (fromY: number, toY: number, world = column) => {
      const p = player([0.5, fromY, 0.5])
      ensureBox(p, 1.8, 0.3)
      const dy = f(toY - fromY)
      applyMovementToBox(p, { x: 0, y: dy, z: 0 })
      const facts: CatchFacts = { requested: { x: 0, y: dy, z: 0 }, applied: { x: 0, y: dy, z: 0 }, preMoveY: fromY, startedOnGround: false, sneaking: false, jumping: false }
      return { p, facts, world }
    }

    it('catches a fall past the top of a column onto it', () => {
      const { p, facts, world } = fallTo(2.3, 1.7)
      assert.ok(catchOnScaffolding(world, p, facts))
      assert.deepStrictEqual([p.pos.y, p.bedrock!.aabb!.minY, p.bedrock!.aabb!.maxY, p.bedrock!.anchor!.y], [2, 2, f(2 + f(1.8)), 2])
    })

    it('does not catch a sneaker, a jumper, a rise, or a move the sweep already stopped', () => {
      for (const over of [{ sneaking: true }, { jumping: true }]) {
        const { p, facts, world } = fallTo(2.3, 1.7)
        assert.ok(!catchOnScaffolding(world, p, { ...facts, ...over }))
      }
      const { p, facts, world } = fallTo(2.3, 1.7)
      assert.ok(!catchOnScaffolding(world, p, { ...facts, requested: { x: 0, y: 0.1, z: 0 }, applied: { x: 0, y: 0.1, z: 0 } }))
      assert.ok(!catchOnScaffolding(world, p, { ...facts, applied: { x: 0, y: 0, z: 0 } }))
    })

    it('does not catch a fall that crossed no block height, or away from a column', () => {
      const within = fallTo(2.8, 2.3)
      assert.ok(!catchOnScaffolding(within.world, within.p, within.facts))
      const elsewhere = fallTo(2.3, 1.7, worldOf({}, null))
      assert.ok(!catchOnScaffolding(elsewhere.world, elsewhere.p, elsewhere.facts))
    })

    it('catches a player leaving the top layer only from above, or when it stood on the column', () => {
      // falling from exactly the top (2) through it: the layer below the top is scaffolding too
      const fromTop = fallTo(2, 1.9)
      assert.ok(!catchOnScaffolding(fromTop.world, fromTop.p, fromTop.facts))
      const stood = fallTo(2, 1.9)
      assert.ok(catchOnScaffolding(stood.world, stood.p, { ...stood.facts, startedOnGround: true }))
      // the top cell of a one-high column: nothing below it
      const single = fallTo(1, 0.9, worldOf({ '0,0,0': 'scaffolding' }, null))
      assert.ok(catchOnScaffolding(single.world, single.p, single.facts))
    })
  })
})
