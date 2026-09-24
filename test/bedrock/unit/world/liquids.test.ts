import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import {
  applyLiquidFlow, cellFlow, containsLiquid, depthAt, isLavaName, isWaterName, liquidDepthOf, liquidInInnerBox, liquidSurfaceHeight,
  pointInWater, senseLiquids, shrinkAxis, unitOrZero
} from '../../../../lib/bedrock/world/liquids.ts'
import { Vec3 } from 'vec3'
import type { Block, World } from '../../../../lib/bedrock/types.ts'
import { block, worldOf } from '../helpers.ts'

const f = Math.fround
const PLAYER = new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8)

describe('bedrock world/liquids', () => {
  it('names water, bubble columns and lava', () => {
    assert.ok(isWaterName('water'))
    assert.ok(isWaterName('flowing_water'))
    assert.ok(isWaterName('bubble_column'))
    assert.ok(!isWaterName('lava'))
    assert.ok(isLavaName('flowing_lava'))
    assert.ok(!isLavaName('stone'))
    // names that only contain the word are no liquid
    for (const name of ['waterlily', 'underwater_torch', 'underwater_tnt']) assert.ok(!isWaterName(name), name)
    assert.ok(!isLavaName('lava_cauldron'))
  })

  it('shrinks an axis, collapsing one too short to its midpoint', () => {
    assert.deepStrictEqual(shrinkAxis(0, 1, 0.25), [0.25, 0.75])
    assert.deepStrictEqual(shrinkAxis(0, 0.6, 0.401), [0.30000001192092896, 0.30000001192092896])
  })

  it('senses a liquid in the shrunk box only', () => {
    const shin = worldOf({ '0,0,0': 'water' }, null)
    assert.ok(liquidInInnerBox(shin, PLAYER, isWaterName), 'the feet cell is inside the 0.401 shrink')
    const underFeet = worldOf({ '0,-1,0': 'water' }, null)
    assert.ok(!liquidInInnerBox(underFeet, PLAYER, isWaterName))
    assert.ok(!liquidInInnerBox(shin, PLAYER, isLavaName))
    assert.ok(liquidInInnerBox(worldOf({ '0,1,0': 'lava' }, null), PLAYER, isLavaName, 0.1, 0.4))
  })

  it('senses water before lava', () => {
    assert.deepStrictEqual(senseLiquids(worldOf({ '0,0,0': 'water', '0,1,0': 'lava' }, null), PLAYER), { isInWater: true, isInLava: false })
    assert.deepStrictEqual(senseLiquids(worldOf({ '0,1,0': 'lava' }, null), PLAYER), { isInWater: false, isInLava: true })
    assert.deepStrictEqual(senseLiquids(worldOf({}, null), PLAYER), { isInWater: false, isInLava: false })
  })

  it('finds water or lava in the cells a box reaches into, not in a cell its face only touches', () => {
    const world = worldOf({ '1,0,0': 'water', '0,2,0': 'lava' }, null)
    assert.ok(containsLiquid(world, new Box(0.2, 0, 0.2, 1.01, 1, 0.8)))
    assert.ok(!containsLiquid(world, new Box(0.2, 0, 0.2, 1, 1, 0.8)), 'the face on x = 1')
    assert.ok(containsLiquid(world, new Box(0.2, 1.5, 0.2, 0.8, 2.5, 0.8)), 'lava')
    assert.ok(!containsLiquid(world, new Box(0.2, 1, 0.2, 0.8, 2, 0.8)), 'the face on y = 2')
  })

  it('reads the liquid depth from the block state, a source when absent', () => {
    assert.strictEqual(liquidDepthOf({ name: 'water', getProperties: () => ({ liquid_depth: 5 }) }), 5)
    assert.strictEqual(liquidDepthOf({ name: 'water', _properties: { liquid_depth: 2 } }), 2)
    assert.strictEqual(liquidDepthOf({ name: 'water', _properties: { liquid_depth: 'x' } }), 0)
    assert.strictEqual(liquidDepthOf({ name: 'water' }), 0)
    assert.strictEqual(liquidDepthOf(null), 0)
  })

  it('puts the surface of a flowing cell (d + 1) / 9 below its top, a falling one at the top', () => {
    assert.strictEqual(liquidSurfaceHeight(0, 4), f(5 - f(f(1 / 9) + f(-0.11111111))))
    assert.strictEqual(liquidSurfaceHeight(3, 4), f(5 - f(f(4 / 9) + f(-0.11111111))))
    assert.strictEqual(liquidSurfaceHeight(8, 4), liquidSurfaceHeight(0, 4))
  })

  it('puts a point under water only below the cell surface', () => {
    const world = worldOf({ '0,0,0': 'flowing_water', '0,1,0': 'water' }, null)
    assert.ok(pointInWater(world, 0.5, 0.5, 0.5))
    assert.ok(!pointInWater(world, 0.5, 0.9, 0.5), 'above a depth-3 surface')
    assert.ok(pointInWater(world, 0.5, 1.99, 0.5), 'a source fills its cell')
    assert.ok(!pointInWater(world, 0.5, 2.5, 0.5))
  })

  describe('flowing liquid', () => {
    const liquid = (name: string, depth: number): Block => ({ name, boundingBox: 'empty', _properties: { liquid_depth: depth } })
    // cells "x,y,z" -> block, air elsewhere
    const worldWith = (cells: Record<string, Block>): World => ({ getBlock: (pos: Vec3) => cells[`${pos.x},${pos.y},${pos.z}`] || block('air') })
    // a stream along +x at y = 0, z = 0: a source at x = 0, then depths 1, 2, 3; stone under it
    const stream = (name = 'water'): Record<string, Block> => ({
      '0,0,0': liquid(name, 0),
      '1,0,0': liquid(name, 1),
      '2,0,0': liquid(name, 2),
      '3,0,0': liquid(name, 3),
      '0,-1,0': block('stone'),
      '1,-1,0': block('stone'),
      '2,-1,0': block('stone'),
      '3,-1,0': block('stone')
    })

    it('reads a cell depth of the liquid asked for, -1 for anything else', () => {
      const world = worldWith({ ...stream(), '5,0,0': liquid('lava', 4) })
      assert.strictEqual(depthAt(world, 2, 0, 0, 'water'), 2)
      assert.strictEqual(depthAt(world, 5, 0, 0, 'lava'), 4)
      assert.strictEqual(depthAt(world, 5, 0, 0, 'water'), -1)
      assert.strictEqual(depthAt(world, 9, 0, 0, 'water'), -1)
    })

    it('scales a vector to unit length, or to zero when it is too short', () => {
      assert.deepStrictEqual(unitOrZero(3, 0, 4), { x: f(0.6), y: 0, z: f(0.8) })
      assert.deepStrictEqual(unitOrZero(0, 0, 0.00001), { x: 0, y: 0, z: 0 })
    })

    it('flows a cell toward its shallower neighbours', () => {
      assert.deepStrictEqual(cellFlow(worldWith(stream()), 1, 0, 0, 'water'), { x: 1, y: 0, z: 0 })
    })

    it('flows a cell toward an open neighbour with liquid under it, and not into a wall', () => {
      const drop = worldWith({ '0,0,0': liquid('water', 1), '0,-1,1': liquid('water', 0), '-1,0,0': block('stone'), '1,0,0': block('stone'), '0,0,-1': block('stone') })
      const flow = cellFlow(drop, 0, 0, 0, 'water')
      assert.deepStrictEqual(flow, { x: 0, y: 0, z: 1 })
    })

    it('flows a falling cell beside a wall downward too', () => {
      const falling = worldWith({ '0,0,0': liquid('water', 8), '1,0,0': liquid('water', 2), '-1,0,0': block('stone') })
      const flow = cellFlow(falling, 0, 0, 0, 'water')
      assert.ok(flow.y < -0.98 && flow.x > 0, JSON.stringify(flow))
      const open = worldWith({ '0,0,0': liquid('water', 8), '1,0,0': liquid('water', 2) })
      assert.strictEqual(cellFlow(open, 0, 0, 0, 'water').y, 0, 'no wall: no pull down')
    })

    it('pushes along the stream, 0.014 in water and 0.0035 in lava', () => {
      const box = new Box(1.2, 0, -0.3, 1.8, 1.8, 0.3)
      const water = { x: 0, y: 0, z: 0 }
      applyLiquidFlow(worldWith(stream()), box, water)
      assert.deepStrictEqual(water, { x: f(0.014), y: 0, z: 0 })
      const lava = { x: 0, y: 0, z: 0 }
      applyLiquidFlow(worldWith(stream('lava')), new Box(1.2, 0, -0.3, 1.8, 1.8, 0.3), lava)
      assert.deepStrictEqual(lava, { x: f(0.0035000001), y: 0, z: 0 })
    })

    it('flows as lava when the box is in lava, ignoring the water around it', () => {
      const cells: Record<string, Block> = { '0,0,0': liquid('lava', 1), '0,1,0': liquid('water', 1), '1,0,0': liquid('lava', 2), '1,1,0': liquid('water', 0) }
      const vel = { x: 0, y: 0, z: 0 }
      applyLiquidFlow(worldWith(cells), new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8), vel)
      assert.deepStrictEqual(vel, { x: f(0.0035000001), y: 0, z: 0 })
    })

    it('does not push in still liquid, in no liquid, or where the flows cancel', () => {
      const vel = { x: 0.1, y: 0, z: 0 }
      const pool: Record<string, Block> = {}
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) pool[`${x},0,${z}`] = liquid('water', 0)
      applyLiquidFlow(worldWith(pool), new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8), vel)
      applyLiquidFlow(worldWith(pool), new Box(-1.8, 0, -1.8, 1.8, 1.8, 1.8), vel)
      applyLiquidFlow(worldWith({}), new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8), vel)
      const valley = worldWith({ '-1,0,0': liquid('water', 0), '0,0,0': liquid('water', 1), '1,0,0': liquid('water', 0) })
      applyLiquidFlow(valley, new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8), vel)
      assert.deepStrictEqual(vel, { x: 0.1, y: 0, z: 0 })
    })

    it('pushes still liquid when a cell just outside the box on any side is flowing', () => {
      for (const [key, sign] of [['0,0,-1', 'z-'], ['1,0,0', 'x+'], ['0,0,1', 'z+'], ['-1,0,0', 'x-']] as const) {
        const cells: Record<string, Block> = { '0,0,0': liquid('water', 0), [key]: liquid('water', 1) }
        const vel = { x: 0, y: 0, z: 0 }
        applyLiquidFlow(worldWith(cells), new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8), vel)
        const moved = sign[0] === 'x' ? vel.x : vel.z
        assert.ok(sign[1] === '+' ? moved > 0 : moved < 0, `${key}: ${JSON.stringify(vel)}`)
      }
    })
  })
})
