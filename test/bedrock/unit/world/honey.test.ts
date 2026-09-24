import assert from 'node:assert'
import { HONEY_SLIDE_DRAG, HONEY_SLIDE_FALL, honeyCellsIn, honeySlide } from '../../../../lib/bedrock/world/honey.ts'
import { worldOf } from '../helpers.ts'

const f = Math.fround

describe('bedrock world/honey', () => {
  it('finds the honey cells of the box shrunk by 0.001', () => {
    const world = worldOf({ '0,2,0': 'honey_block', '0,3,0': 'honey_block', '0,2,1': 'stone' }, null)
    const box = { minX: 0.2, minY: 2, minZ: f(0.9375), maxX: 0.8, maxY: f(3.8), maxZ: f(1.5375) }
    assert.deepStrictEqual(honeyCellsIn(world, box), [{ x: 0, y: 2, z: 0 }, { x: 0, y: 3, z: 0 }])
    assert.deepStrictEqual(honeyCellsIn(world, { ...box, minZ: 1 }), [], 'a box touching the cell is not in it')
  })

  it('slows the slide per cell, and resets the fall hanging on a side', () => {
    const vel = { x: 1, y: -0.5, z: 1 }
    const side = { x: 0.5, y: 2.5, z: f(1.2375) }
    assert.strictEqual(honeySlide(vel, side, f(0.6), [{ x: 0, y: 2, z: 0 }, { x: 0, y: 3, z: 0 }]), true)
    assert.deepStrictEqual(vel, { x: f(HONEY_SLIDE_DRAG * HONEY_SLIDE_DRAG), y: HONEY_SLIDE_FALL, z: f(HONEY_SLIDE_DRAG * HONEY_SLIDE_DRAG) })
  })

  it('keeps the fall distance above the top, rising, or near the centre', () => {
    const cell = [{ x: 0, y: 2, z: 0 }]
    assert.strictEqual(honeySlide({ x: 0, y: -0.5, z: 0 }, { x: 0.5, y: 3, z: f(1.2375) }, f(0.6), cell), false, 'on top')
    assert.strictEqual(honeySlide({ x: 0, y: 0.2, z: 0 }, { x: 0.5, y: 2.5, z: f(1.2375) }, f(0.6), cell), false, 'rising')
    assert.strictEqual(honeySlide({ x: 0, y: -0.5, z: 0 }, { x: 0.5, y: 2.5, z: 0.9 }, f(0.6), cell), false, 'inside')
    assert.strictEqual(honeySlide({ x: 0, y: -0.5, z: 0 }, { x: f(1.2375), y: 2.5, z: 0.5 }, f(0.6), cell), true, 'on the east side')
  })
})
