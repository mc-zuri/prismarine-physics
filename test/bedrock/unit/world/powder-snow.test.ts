import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { nextFallDistance } from '../../../../lib/bedrock/movement/fall-distance.ts'
import { collisionBoxes, powderSnowShapes } from '../../../../lib/bedrock/world/blocks.ts'
import { climbableAt } from '../../../../lib/bedrock/world/climbables.ts'
import { worldOf } from '../helpers.ts'

const f = Math.fround
const above = (minY: number) => new Box(0.2, minY, 0.2, 0.8, minY + 1.8, 0.8)

describe('bedrock powder snow', () => {
  it('holds up a mover in leather boots on or above its top', () => {
    assert.deepStrictEqual(powderSnowShapes({ aabb: above(1), descend: false, leatherBoots: true }, 0), [[0, 0, 0, 1, 1, 1]])
    assert.deepStrictEqual(powderSnowShapes({ aabb: above(1), descend: false }, 0), [], 'no boots: through')
    assert.deepStrictEqual(powderSnowShapes({ aabb: above(0.5), descend: false, leatherBoots: true }, 0), [], 'feet below the top')
    assert.deepStrictEqual(powderSnowShapes({ aabb: above(1), descend: true, leatherBoots: true }, 0), [], 'descending')
  })

  it('catches a fall of more than 2.5 on a 0.9 high box, boots or not', () => {
    assert.deepStrictEqual(powderSnowShapes({ aabb: above(1), descend: false, fallDistance: 3 }, 0), [[0, 0, 0, 1, f(0.9), 1]])
    assert.deepStrictEqual(powderSnowShapes({ aabb: above(1), descend: false, fallDistance: 2.5 }, 0), [])
  })

  it('collides in the world only for a mover, as its shape says', () => {
    const world = worldOf({ '0,0,0': 'powder_snow' }, null)
    const query = new Box(0, 0.5, 0, 1, 1.5, 1)
    assert.strictEqual(collisionBoxes(world, query).length, 0)
    assert.strictEqual(collisionBoxes(world, query, { aabb: above(1), descend: false, leatherBoots: true }).length, 1)
    assert.strictEqual(collisionBoxes(world, new Box(5, 5, 5, 6, 6, 6), { aabb: above(1), descend: false, leatherBoots: true }).length, 0)
  })

  it('is climbed in leather boots', () => {
    const world = worldOf({ '0,0,0': 'powder_snow' }, null)
    assert.strictEqual(climbableAt(world, { x: 0.5, y: 0.2, z: 0.5 }, above(0.2), true), 'powder_snow')
    assert.strictEqual(climbableAt(world, { x: 0.5, y: 0.2, z: 0.5 }, above(0.2)), null)
  })

  it('counts the fall down, and clears it standing, swimming, climbing, flying, slowed or moving up', () => {
    const air = { onGround: false, inWater: false, climbing: false, flying: false, slowed: false, movedY: -0.5 }
    assert.strictEqual(nextFallDistance(1, air), 1.5)
    assert.strictEqual(nextFallDistance(1, { ...air, movedY: 0.1 }), 0)
    for (const key of ['onGround', 'inWater', 'climbing', 'flying', 'slowed'] as const) assert.strictEqual(nextFallDistance(1, { ...air, [key]: true }), 0, key)
  })
})
