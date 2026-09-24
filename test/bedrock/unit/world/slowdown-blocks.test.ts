import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import {
  applySlowdown, foldSlowdown, SLOWDOWN_MULTIPLIERS, slowdownBlocksIn, slowdownIsZero, slowdownMultiplier
} from '../../../../lib/bedrock/world/slowdown-blocks.ts'
import { worldOf } from '../helpers.ts'

const f = Math.fround

describe('bedrock world/slowdown-blocks', () => {
  it('finds the slowdown blocks in the box, cobweb under its short name', () => {
    const world = worldOf({ '0,0,0': 'cobweb', '0,1,0': 'powder_snow', '1,0,0': 'sweet_berry_bush', '0,2,0': 'stone' }, null)
    assert.deepStrictEqual(slowdownBlocksIn(world, new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8)), new Set(['web', 'powder_snow']))
    assert.deepStrictEqual(slowdownBlocksIn(world, new Box(0.9, 0, 0.2, 1.5, 0.5, 0.8)), new Set(['web', 'sweet_berry_bush']))
    assert.deepStrictEqual(slowdownBlocksIn(worldOf({ '0,0,0': 'web' }, null), new Box(0.2, 0, 0.2, 0.8, 0.5, 0.8)), new Set(['web']))
    assert.deepStrictEqual(slowdownBlocksIn(worldOf({}, null), new Box(0.2, 0, 0.2, 0.8, 0.5, 0.8)), new Set())
  })

  it('counts a multiplier still at zero within 2^-23', () => {
    assert.ok(slowdownIsZero({ x: 0, y: 1e-8, z: -1e-8 }))
    assert.ok(!slowdownIsZero({ x: 0, y: 0, z: 0.5 }))
    assert.ok(!slowdownIsZero({ x: 0, y: 0.5, z: 0 }))
    assert.ok(!slowdownIsZero({ x: 0.5, y: 0, z: 0 }))
  })

  it('folds overlapping blocks by the per-lane minimum', () => {
    const web = SLOWDOWN_MULTIPLIERS.web
    const snow = SLOWDOWN_MULTIPLIERS.powder_snow
    assert.deepStrictEqual(foldSlowdown({ x: 0, y: 0, z: 0 }, snow), snow)
    assert.deepStrictEqual(foldSlowdown(snow, web), web)
    assert.deepStrictEqual(foldSlowdown(web, snow), web)
    assert.deepStrictEqual(slowdownMultiplier(new Set(['powder_snow', 'sweet_berry_bush'])), { x: f(0.80000001), y: f(0.75), z: f(0.80000001) })
    assert.deepStrictEqual(slowdownMultiplier(new Set()), { x: 0, y: 0, z: 0 })
  })

  it('slows a weaver in cobweb alone less, and not when something else slows it too', () => {
    assert.deepStrictEqual(slowdownMultiplier(new Set(['web']), true), { x: 0.5, y: 0.25, z: 0.5 })
    assert.deepStrictEqual(slowdownMultiplier(new Set(['web']), false), SLOWDOWN_MULTIPLIERS.web)
    assert.deepStrictEqual(slowdownMultiplier(new Set(['web', 'powder_snow']), true), SLOWDOWN_MULTIPLIERS.web)
    assert.deepStrictEqual(slowdownMultiplier(new Set(['web', 'sweet_berry_bush']), true), SLOWDOWN_MULTIPLIERS.web)
    assert.deepStrictEqual(slowdownMultiplier(new Set(['powder_snow']), true), SLOWDOWN_MULTIPLIERS.powder_snow)
  })

  it('scales the move lane by lane, and does nothing for an all-zero multiplier', () => {
    assert.deepStrictEqual(applySlowdown({ x: 1, y: -1, z: 2 }, SLOWDOWN_MULTIPLIERS.web), { x: 0.25, y: f(-0.05), z: 0.5 })
    assert.strictEqual(applySlowdown({ x: 1, y: 1, z: 1 }, { x: 0, y: -0, z: 0 }), null)
  })
})
