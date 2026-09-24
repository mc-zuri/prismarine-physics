import assert from 'node:assert'
import { DepenetrationBit, depenetrationLimit, MIN_DEPENETRATION, updateDepenetrationBits } from '../../../../lib/bedrock/movement/depenetration.ts'

const MIN = { x: MIN_DEPENETRATION, y: MIN_DEPENETRATION, z: MIN_DEPENETRATION }
const ONE = { x: 1, y: 1, z: 1 }

describe('bedrock movement/depenetration', () => {
  it('allows a whole block while nothing holds the player', () => {
    assert.deepStrictEqual(depenetrationLimit(0), ONE)
    assert.deepStrictEqual(depenetrationLimit(DepenetrationBit.penetrated), ONE, 'one penetrating move is not yet stuck')
  })

  it('drops to the minimum when stuck, pushing toward free space, or always one-way', () => {
    assert.deepStrictEqual(depenetrationLimit(DepenetrationBit.stuckInCollider), MIN)
    assert.deepStrictEqual(depenetrationLimit(DepenetrationBit.pushTowardsClosestSpace), MIN)
    assert.deepStrictEqual(depenetrationLimit(DepenetrationBit.alwaysOneWay), MIN)
  })

  it('never drops for a stuck item, and never below the given minimum', () => {
    assert.deepStrictEqual(depenetrationLimit(DepenetrationBit.stuckItem | DepenetrationBit.stuckInCollider), ONE)
    assert.deepStrictEqual(depenetrationLimit(DepenetrationBit.pushTowardsClosestSpace, { x: 0.1, y: 2, z: 0 }), { x: 0.1, y: 2, z: 0 })
    assert.deepStrictEqual(depenetrationLimit(0, { x: 0.5, y: 2, z: 0.5 }), { x: 1, y: 2, z: 1 })
  })

  it('marks a penetrating move, then a second one running as stuck, and clears both on a free move', () => {
    const once = updateDepenetrationBits(0, false, true)
    assert.strictEqual(once, DepenetrationBit.penetrated)
    const twice = updateDepenetrationBits(once, false, true)
    assert.strictEqual(twice, DepenetrationBit.penetrated | DepenetrationBit.stuckInCollider)
    assert.strictEqual(updateDepenetrationBits(twice, false, false), 0)
  })

  it('follows the server push request, and keeps the one-way and item bits through a free move', () => {
    assert.strictEqual(updateDepenetrationBits(0, true, false), DepenetrationBit.pushTowardsClosestSpace)
    assert.strictEqual(updateDepenetrationBits(DepenetrationBit.pushTowardsClosestSpace, false, false), 0)
    const kept = DepenetrationBit.alwaysOneWay | DepenetrationBit.stuckItem
    assert.strictEqual(updateDepenetrationBits(kept | DepenetrationBit.penetrated, false, false), kept)
    assert.strictEqual(updateDepenetrationBits(0xff, true, false), kept | DepenetrationBit.pushTowardsClosestSpace, 'five bits')
  })
})
