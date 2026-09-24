import assert from 'node:assert'
import { directionPose, dismountPosition, fitsAt, floorClearance, searchDismount } from '../../../../lib/bedrock/vehicle/dismount.ts'
import { EMPTY, FLAT, worldOf } from '../helpers.ts'

const f = Math.fround
const RIDER = { x: f(0.6), y: f(1.8), z: f(0.6) }
const riderBox = { minX: f(-0.3), minY: 0, minZ: f(-0.3), maxX: f(0.3), maxY: f(1.8), maxZ: f(0.3) }
// -0 reads as 0
const plain = (v: { x: number, y: number, z: number }): number[] => [v.x + 0, v.y + 0, v.z + 0]

describe('bedrock vehicle/dismount', () => {
  it('finds the floor of a cell: a low block in it, else the full top of the one below', () => {
    assert.strictEqual(floorClearance(worldOf({ '0,0,0': 'bottom_slab' }), 0, 0, 0), 0.5)
    assert.strictEqual(floorClearance(FLAT, 0, 0, 0), 0)
    assert.strictEqual(floorClearance(worldOf({ '0,0,0': 'stone' }), 0, 0, 0), null, 'a full block fills the cell')
    assert.strictEqual(floorClearance(worldOf({ '0,0,0': 'scaffolding' }), 0, 0, 0), 0, 'a climbable is stood in')
    assert.strictEqual(floorClearance(EMPTY, 0, 0, 0), null, 'nothing below')
    assert.strictEqual(floorClearance(worldOf({ '0,-1,0': 'ladder' }, null), 0, 0, 0), null, 'a climbable below is no floor')
    assert.strictEqual(floorClearance(worldOf({ '0,-1,0': 'bottom_slab' }, null), 0, 0, 0), null, 'a low block below leaves a drop')
  })

  it('fits the rider where no solid block meets its box; climbables do not count', () => {
    assert.strictEqual(fitsAt(FLAT, { x: 0.5, y: 0, z: 0.5 }, RIDER), true)
    assert.strictEqual(fitsAt(worldOf({ '0,1,0': 'stone' }), { x: 0.5, y: 0, z: 0.5 }, RIDER), false)
    assert.strictEqual(fitsAt(worldOf({ '0,1,0': 'scaffolding' }), { x: 0.5, y: 0, z: 0.5 }, RIDER), true)
  })

  it('looks along the larger axis of the last move, the side to its left; standing still, west', () => {
    const still = directionPose({ x: f(0.005), y: 0, z: f(0.005) }, { x: 0, y: 0, z: 0 })
    assert.deepStrictEqual([plain(still.forward), plain(still.side)], [[-1, 0, 0], [0, 0, -1]])
    const east = directionPose({ x: 1, y: 0, z: f(0.2) }, { x: 0, y: 0, z: 0 })
    assert.deepStrictEqual([plain(east.forward), plain(east.side)], [[1, 0, 0], [0, 0, 1]])
    const north = directionPose({ x: f(0.1), y: 0, z: -0.5 }, { x: 0, y: 0, z: 0 })
    assert.deepStrictEqual([plain(north.forward), plain(north.side)], [[0, 0, -1], [1, 0, 0]])
  })

  it('searches the sides first, then around, then a level up; none when there is no floor', () => {
    const anchor = { x: 0.5, y: 0, z: 0.5 }
    const forward = { x: -1, y: 0, z: 0 }
    const side = { x: 0, y: 0, z: -1 }
    assert.deepStrictEqual(searchDismount(FLAT, anchor, RIDER, forward, side), { offset: { x: 0, y: 0, z: -1 }, rise: 0 })
    const headBlocked = worldOf({ '0,1,-1': 'stone' })
    assert.deepStrictEqual(plain(searchDismount(headBlocked, anchor, RIDER, forward, side)!.offset), [0, 0, 1])
    const ring: Record<string, string> = {}
    for (const [x, z] of [[0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0]]) ring[`${x},0,${z}`] = 'stone'
    assert.deepStrictEqual(searchDismount(worldOf(ring), anchor, RIDER, forward, side), { offset: { x: 0, y: 1, z: -1 }, rise: 0 })
    assert.strictEqual(searchDismount(EMPTY, anchor, RIDER, forward, side), null)
  })

  it('stands the rider beside the seat on the floor found, 0.001 above it; with none, with its feet under the seat', () => {
    const seat = { x: f(0.4), y: f(1.395), z: f(0.6) }
    const boat = { pos: { x: 0.5, y: f(0.375), z: 0.5 } }
    assert.deepStrictEqual(dismountPosition(FLAT, boat, seat, riderBox), { x: f(0.4), y: f(0.001), z: f(f(0.6) - 1) })
    const slab = worldOf({ '0,0,-1': 'bottom_slab' })
    assert.strictEqual(dismountPosition(slab, boat, seat, riderBox).y, f(f(0.5) + f(0.001)))
    const moving = { pos: { x: 1.5, y: f(0.375), z: 0.5 }, posPrev: { x: 0.5, y: f(0.375), z: 0.5 } }
    assert.deepStrictEqual(dismountPosition(FLAT, moving, seat, riderBox), { x: f(0.4), y: f(0.001), z: f(f(0.6) + 1) }, 'left of east is south')
    // the seat is at the eye: with no spot free the feet stay where they are, not at the eye
    const seated = { ...riderBox, minY: f(seat.y - f(1.62)), maxY: f(f(seat.y - f(1.62)) + f(1.8)) }
    assert.deepStrictEqual(dismountPosition(EMPTY, boat, seat, seated), { x: seat.x, y: seated.minY, z: seat.z })
  })
})
