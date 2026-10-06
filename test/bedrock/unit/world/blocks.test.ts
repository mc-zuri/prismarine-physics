import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { blockAt, blockBounds, blockFriction, blockName, blockShapes, collisionBoxes, isAir, landedOnCell, restitutionOf, someCell, standingOnCell, worldShapes } from '../../../../lib/bedrock/world/blocks.ts'
import { block, EMPTY, f, worldOf } from '../helpers.ts'

describe('bedrock world/blocks', () => {
  it('reads the block of the cell a point is in', () => {
    const world = worldOf({ '-1,2,3': 'dirt' }, null)
    assert.strictEqual(blockAt(world, -0.5, 2.9, 3.1)!.name, 'dirt')
    assert.strictEqual(blockAt(world, 0.5, 2.9, 3.1)!.name, 'air')
  })

  it('names a missing block air', () => {
    assert.strictEqual(blockName(null), 'air')
    assert.strictEqual(blockName({ name: '' }), 'air')
    assert.strictEqual(blockName(block('stone')), 'stone')
    assert.ok(isAir(null))
    assert.ok(isAir(block('air')))
    assert.ok(isAir({ name: 'cave_air', type: 0 }))
    assert.ok(!isAir(block('stone')))
  })

  it('gives the ground friction of ice and slime, and the default elsewhere', () => {
    assert.strictEqual(blockFriction(block('ice'), 0.6), 0.98)
    assert.strictEqual(blockFriction(block('blue_ice'), 0.6), 0.989)
    assert.strictEqual(blockFriction(block('slime'), 0.6), 0.8)
    assert.strictEqual(blockFriction(block('stone'), 0.6), 0.6)
    assert.strictEqual(blockFriction(null, 0.5), 0.5)
  })

  it('collides with a ladder even when marked empty, and never with other empty blocks or scaffolding', () => {
    assert.deepStrictEqual(blockShapes(block('ladder')), block('ladder').shapes)
    assert.deepStrictEqual(blockShapes(block('vine')), [])
    assert.deepStrictEqual(blockShapes(block('scaffolding')), [])
    assert.deepStrictEqual(blockShapes(null), [])
    assert.deepStrictEqual(blockShapes(block('dirt')), [[0, 0, 0, 1, 1, 1]], 'a full block without shapes')
    assert.deepStrictEqual(blockShapes(block('bottom_slab')), [[0, 0, 0, 1, 0.5, 1]])
    assert.deepStrictEqual(blockShapes({ name: 'odd' }), [])
  })

  it('gives a fence an arm toward each neighbouring fence or full cube', () => {
    const world = worldOf({ '0,0,0': 'fence', '1,0,0': 'fence', '0,0,1': 'stone', '-1,0,0': 'bottom_slab' }, null)
    const shapes = worldShapes(world, world.getBlock(new Vec3(0, 0, 0)), 0, 0, 0)
    assert.deepStrictEqual(shapes, [[0.375, 0, 0.375, 0.625, 1.5, 0.625], [0.625, 0, 0.375, 1, 1.5, 0.625], [0.375, 0, 0.625, 0.625, 1.5, 1]])
    assert.deepStrictEqual(worldShapes(world, world.getBlock(new Vec3(0, 0, 1)), 0, 0, 1), [[0, 0, 0, 1, 1, 1]], 'not a fence: its own')
  })

  it('finds the collision boxes around a query, reaching half a block below it', () => {
    const world = worldOf({ '0,-1,0': 'fence', '2,0,0': 'stone' }, null)
    const boxes = collisionBoxes(world, new Box(0, 0, 0, 1, 1, 1))
    assert.deepStrictEqual(boxes, [new Box(0.375, -1, 0.375, 0.625, 0.5, 0.625)], 'the fence below rises into the query')
    assert.deepStrictEqual(collisionBoxes(world, new Box(1.5, 0, 0.2, 2.5, 1, 0.8)), [new Box(2, 0, 0, 3, 1, 1)])
    assert.deepStrictEqual(collisionBoxes(EMPTY, new Box(0, 0, 0, 1, 1, 1)), [])
  })

  it('lets a mover above a scaffolding top stand on it, and not one descending or below it', () => {
    const world = worldOf({ '0,0,0': 'scaffolding' }, null)
    const query = new Box(0.2, 0.9, 0.2, 0.8, 2, 0.8)
    const above = { aabb: new Box(0.2, 1, 0.2, 0.8, 2.8, 0.8), descend: false }
    assert.deepStrictEqual(collisionBoxes(world, query, above), [new Box(0, 0, 0, 1, 1, 1)])
    assert.deepStrictEqual(collisionBoxes(world, query, { ...above, descend: true }), [])
    assert.deepStrictEqual(collisionBoxes(world, query, { aabb: new Box(0.2, 0.5, 0.2, 0.8, 2.3, 0.8), descend: false }), [])
    assert.deepStrictEqual(collisionBoxes(world, query, { aabb: new Box(1.2, 1, 0.2, 1.8, 2.8, 0.8), descend: false }), [], 'not over it')
    assert.deepStrictEqual(collisionBoxes(world, new Box(0.2, 1.5, 0.2, 0.8, 2, 0.8), above), [], 'a supporting cube outside the query')
    assert.deepStrictEqual(collisionBoxes(world, query), [], 'no mover: scaffolding never collides')
  })

  it('visits the cells of a shrunk box until one answers true', () => {
    const seen: string[] = []
    assert.strictEqual(someCell(new Box(0, 0, 0, 2, 1, 1), 0.001, (x, y, z) => { seen.push(`${x},${y},${z}`); return false }), false)
    assert.deepStrictEqual(seen, ['0,0,0', '1,0,0'])
    assert.strictEqual(someCell(new Box(0, 0, 0, 2, 1, 1), 0.001, (x) => x === 1), true)
  })

  it('bounds a block by the union of its collision boxes in world coordinates', () => {
    assert.deepStrictEqual(blockBounds(block('fence'), 2, 3, 4), new Box(2.375, 3, 4.375, 2.625, 4.5, 4.625))
    assert.strictEqual(blockBounds(block('air'), 0, 0, 0), null)
    assert.strictEqual(blockBounds({ name: 'rail', boundingBox: 'block', shapes: [[0, 0, 0, 0, 0, 0]] }, 0, 0, 0), null, 'a flat shape')
  })

  it('bounces landings on slime fully and on a bed three quarters, and honey takes a bounce away', () => {
    assert.strictEqual(restitutionOf(block('slime')), 1)
    assert.strictEqual(restitutionOf({ name: 'slime_block' }), 1)
    assert.strictEqual(restitutionOf({ name: 'bed' }), 0.75)
    assert.strictEqual(restitutionOf(block('honey_block')), -1)
    assert.strictEqual(restitutionOf(block('stone')), 0)
  })

  describe('the block a landing is on', () => {
    const feet = new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8)
    it('is the box whose centre is nearest below the plane under the feet', () => {
      const shapes = [new Box(0, -2, 0, 1, -1, 1), new Box(0, -1, 0, 1, 0, 1), new Box(0, 1, 0, 1, 2, 1)]
      assert.deepStrictEqual(landedOnCell(shapes, feet), { x: 0, y: -1, z: 0 })
    })
    it('breaks a tie by the distance to the plane centre, keeping the earlier on an exact tie', () => {
      const left = new Box(-1, -1, 0, 0, 0, 1)
      const under = new Box(0, -1, 0, 1, 0, 1)
      assert.deepStrictEqual(landedOnCell([left, under], feet), { x: 0, y: -1, z: 0 })
      assert.deepStrictEqual(landedOnCell([under, left], feet), { x: 0, y: -1, z: 0 })
      const east = new Box(1, -1, 0, 2, 0, 1)
      const west = new Box(-1, -1, 0, 0, 0, 1)
      assert.deepStrictEqual(landedOnCell([east, west], new Box(0.2, 0, 0.2, 0.8, 1.8, 0.8)), { x: 1, y: -1, z: 0 })
    })
    it('is none with nothing below, or a flat box', () => {
      assert.strictEqual(landedOnCell([new Box(0, 1, 0, 1, 2, 1)], feet), null)
      assert.strictEqual(landedOnCell([], feet), null)
      assert.strictEqual(landedOnCell([new Box(0, -1, 0, 1, -1, 1)], feet), null)
    })
  })

  describe('the block stood on', () => {
    const box = (x: number, y: number, z: number): Box => new Box(Math.fround(x - 0.3), y, Math.fround(z - 0.3), Math.fround(x + 0.3), y + 1.8, Math.fround(z + 0.3))

    it('is the tallest block crossing the plane under the footprint, not the one under the centre', () => {
      // soul sand (0.875 high) under the centre, slime (full) under an edge
      const world = worldOf({ '0,-1,0': 'soul_sand', '1,-1,0': 'slime' }, null)
      assert.deepStrictEqual(standingOnCell(world, { x: 0.8, y: 0, z: 0.5 }, box(0.8, 0, 0.5)), { x: 1, y: -1, z: 0 })
    })

    it('takes the one nearer the centre between two as tall', () => {
      const world = worldOf({ '0,-1,0': 'stone', '1,-1,0': 'slime' }, null)
      assert.deepStrictEqual(standingOnCell(world, { x: 0.9, y: 0, z: 0.5 }, box(0.9, 0, 0.5)), { x: 0, y: -1, z: 0 })
      assert.deepStrictEqual(standingOnCell(world, { x: 1.1, y: 0, z: 0.5 }, box(1.1, 0, 0.5)), { x: 1, y: -1, z: 0 })
    })

    it('stops a column below the best top found, so a fence under a block is not seen', () => {
      const world = worldOf({ '0,-1,0': 'soul_sand', '0,-2,0': 'fence' }, null)
      assert.deepStrictEqual(standingOnCell(world, { x: 0.5, y: f(-0.125), z: 0.5 }, box(0.5, f(-0.125), 0.5)), { x: 0, y: -1, z: 0 })
    })

    it('is the cell at the position when nothing crosses the plane', () => {
      assert.deepStrictEqual(standingOnCell(worldOf({}, null), { x: 3.5, y: 7, z: -2.5 }, box(3.5, 7, -2.5)), { x: 3, y: 7, z: -3 })
    })
  })
})
