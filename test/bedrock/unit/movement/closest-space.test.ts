import assert from 'node:assert'
import { closestSpaceReach, pushTowardsClosestSpace } from '../../../../lib/bedrock/movement/closest-space.ts'

const f = Math.fround
const cube = (x: number, y: number, z: number) => ({ minX: x, minY: y, minZ: z, maxX: x + 1, maxY: y + 1, maxZ: z + 1 })
// a player's box with its feet at (x, y, z)
const player = (x: number, y: number, z: number) => ({ minX: f(x - 0.3), minY: y, minZ: f(z - 0.3), maxX: f(x + 0.3), maxY: f(y + 1.8), maxZ: f(z + 0.3) })
const vel = (x = 0, z = 0) => ({ x, y: 0, z })

describe('bedrock movement/closest-space', () => {
  it('searches a block out on each horizontal side', () => {
    const reach = closestSpaceReach(cube(0, 0, 0))
    assert.deepStrictEqual([reach.minX, reach.minY, reach.minZ, reach.maxX, reach.maxY, reach.maxZ], [-1, 0, -1, 2, 1, 2])
  })

  it('pushes 0.1 away from the centre of the blocks the player is in', () => {
    // the rider left beside a gravel block it overlaps
    const box = player(f(-47.3), f(62.001), f(44.0334587))
    const v = vel()
    pushTowardsClosestSpace(box, [cube(-48, 62, 43)], v)
    assert.deepStrictEqual([v.x, v.z], [f(0.0351052247), f(0.0936355814)])
  })

  it('does nothing outside every block', () => {
    const v = vel(0.5, 0.5)
    pushTowardsClosestSpace(player(5, 0, 5), [cube(0, 0, 0)], v)
    assert.deepStrictEqual([v.x, v.z], [0.5, 0.5])
  })

  it('turns back on an axis a block blocks, and gives it up when both ways are blocked', () => {
    // inside a block, east of its centre, with a wall touching to the east: it goes west instead
    const box = player(0.7, 0, 0.5)
    const v = vel()
    pushTowardsClosestSpace(box, [cube(0, 0, 0), cube(1, 0, 0)], v)
    assert.ok(v.x < 0 && v.z === 0)
    // walls both ways: no push at all
    const w = vel()
    pushTowardsClosestSpace(box, [cube(0, 0, 0), cube(1, 0, 0), cube(-1, 0, 0)], w)
    assert.deepStrictEqual([w.x, w.z], [0, 0])
    // the same on z: a wall touching to the south turns it north
    const south = vel()
    pushTowardsClosestSpace(player(0.5, 0, 0.7), [cube(0, 0, 0), cube(0, 0, 1)], south)
    assert.ok(south.z < 0 && south.x === 0)
    const boxedIn = vel()
    pushTowardsClosestSpace(player(0.5, 0, 0.7), [cube(0, 0, 0), cube(0, 0, 1), cube(0, 0, -1)], boxedIn)
    assert.deepStrictEqual([boxedIn.x, boxedIn.z], [0, 0])
  })

  it('gives no push when the way out is too short to tell', () => {
    const v = vel(0.01, 0.01)
    pushTowardsClosestSpace(player(f(0.50005), 0, 0.5), [cube(0, 0, 0)], v)
    assert.deepStrictEqual([v.x, v.z], [0.01, 0.01])
  })

  it('pushes diagonally out of a block it is centred in, and along z when z is the way out', () => {
    const v = vel()
    pushTowardsClosestSpace(player(0.5, 0, 0.5), [cube(0, 0, 0)], v)
    assert.ok(v.x > 0 && v.z > 0)
    const w = vel()
    pushTowardsClosestSpace(player(0.5, 0, 0.9), [cube(0, 0, 0)], w)
    assert.deepStrictEqual([w.x, w.z], [0, f(0.1)])
  })

  it('keeps a velocity faster than the push, and adds to a slower one up to the push', () => {
    const fast = vel(0, 0.5)
    pushTowardsClosestSpace(player(0.5, 0, 0.9), [cube(0, 0, 0)], fast)
    assert.strictEqual(fast.z, 0.5)
    const against = vel(0, f(-0.05))
    pushTowardsClosestSpace(player(0.5, 0, 0.9), [cube(0, 0, 0)], against)
    assert.strictEqual(against.z, f(f(-0.05) + f(0.1)))
    const along = vel(0, f(0.05))
    pushTowardsClosestSpace(player(0.5, 0, 0.9), [cube(0, 0, 0)], along)
    assert.strictEqual(along.z, f(0.1))
    const fastX = vel(0.5, 0)
    pushTowardsClosestSpace(player(0.9, 0, 0.5), [cube(0, 0, 0)], fastX)
    assert.strictEqual(fastX.x, 0.5)
    const alongX = vel(f(0.05), 0)
    pushTowardsClosestSpace(player(0.9, 0, 0.5), [cube(0, 0, 0)], alongX)
    assert.strictEqual(alongX.x, f(0.1))
    const west = vel(f(0.05), 0)
    pushTowardsClosestSpace(player(0.1, 0, 0.5), [cube(0, 0, 0)], west)
    assert.strictEqual(west.x, f(f(0.05) + f(-0.1)))
  })
})
