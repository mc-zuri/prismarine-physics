import assert from 'node:assert'
import { Box, type BoxLike } from '../../../../lib/bedrock/math/box.ts'
import { DepenetrationBit, SOLID_ENTITY_DEPENETRATION, withSolidEntityOverride } from '../../../../lib/bedrock/movement/depenetration.ts'
import { moveDepenetrationLimit } from '../../../../lib/bedrock/tick/move.ts'
import type { World } from '../../../../lib/bedrock/types.ts'
import { collisionBoxes } from '../../../../lib/bedrock/world/blocks.ts'
import { FLAT } from '../helpers.ts'

const f = Math.fround
// a boat on flat ground at x, z = 0.5
const BOAT: BoxLike = { minX: -0.2, minY: 0, minZ: -0.2, maxX: 1.2, maxY: f(0.455), maxZ: 1.2 }
const withBoat: World = { getBlock: FLAT.getBlock, solidEntityBoxes: (q: BoxLike) => [BOAT].filter(b => b.maxX > q.minX && b.minX < q.maxX && b.maxY > q.minY && b.minY < q.maxY && b.maxZ > q.minZ && b.minZ < q.maxZ) }

describe('bedrock solid entities', () => {
  it('adds a solid entity\'s box to the collision boxes it meets', () => {
    const on = collisionBoxes(withBoat, new Box(0.2, 0.4, 0.2, 0.8, 2, 0.8))
    assert.ok(on.some(b => b.maxY === f(0.455)))
    const away = collisionBoxes(withBoat, new Box(5, 0.4, 5, 6, 2, 6))
    assert.ok(!away.some(b => b.maxY === f(0.455)))
  })

  it('raises the depenetration limit to 0.1 on every axis', () => {
    assert.deepStrictEqual(withSolidEntityOverride({ x: 1, y: 0.01, z: 0 }), { x: 1, y: SOLID_ENTITY_DEPENETRATION, z: SOLID_ENTITY_DEPENETRATION })
  })

  it('limits a move near a boat: at least 0.1, engaged at 0.1 inside it', () => {
    const player = (y: number) => new Box(0.2, y, 0.2, 0.8, y + 1.8, 0.8)
    assert.deepStrictEqual(moveDepenetrationLimit(FLAT, player(0), 0), { x: 1, y: 1, z: 1 }, 'no solid entity')
    assert.deepStrictEqual(moveDepenetrationLimit(withBoat, player(1), 0), { x: 1, y: 1, z: 1 }, 'near: the whole block stays')
    const inside = SOLID_ENTITY_DEPENETRATION
    assert.deepStrictEqual(moveDepenetrationLimit(withBoat, player(0), 0), { x: inside, y: inside, z: inside }, 'inside: one way at 0.1')
    assert.deepStrictEqual(moveDepenetrationLimit(withBoat, player(0), DepenetrationBit.stuckItem), { x: 1, y: 1, z: 1 }, 'a stuck item is never engaged')
    const far: World = { getBlock: FLAT.getBlock, solidEntityBoxes: () => [] }
    assert.deepStrictEqual(moveDepenetrationLimit(far, player(0), 0), { x: 1, y: 1, z: 1 })
  })
})
