import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { clampToEdge, sneakApproach } from '../../../../lib/bedrock/movement/sneak-edge.ts'
import { worldOf } from '../helpers.ts'

const f = Math.fround
// a player at the east edge of a one-block platform at (0, -1, 0)
const WORLD = worldOf({ '0,-1,0': 'stone' }, null)
const atEdge = (x: number, z = 0.5): Box => new Box(f(x - 0.3), 0, f(z - 0.3), f(x + 0.3), f(1.8), f(z + 0.3))

describe('bedrock movement/sneak-edge', () => {
  it('steps a component 0.05 toward zero in float32, never past it', () => {
    assert.strictEqual(sneakApproach(f(0.12)), f(f(0.12) - f(0.050000001)))
    assert.strictEqual(sneakApproach(0.03), 0)
    assert.strictEqual(sneakApproach(f(-0.12)), f(f(-0.12) + f(0.050000001)))
    assert.strictEqual(sneakApproach(-0.03), 0)
    assert.strictEqual(sneakApproach(0), 0)
    assert.strictEqual(sneakApproach(NaN), 0)
    assert.strictEqual(sneakApproach(-Infinity), -Infinity)
    assert.strictEqual(sneakApproach(Infinity), Infinity)
  })

  it('leaves a move with support alone', () => {
    const requested = { x: f(0.05), y: 0, z: f(0.05) }
    const vel = { x: 0.05, y: 0, z: 0.05 }
    clampToEdge(WORLD, atEdge(0.5), requested, vel)
    assert.deepStrictEqual(requested, { x: f(0.05), y: 0, z: f(0.05) })
    assert.deepStrictEqual(vel, { x: 0.05, y: 0, z: 0.05 })
  })

  it('backs a move off the edge, stopping the velocity on that axis', () => {
    const requested = { x: f(0.2), y: 0, z: 0 }
    const vel = { x: 0.2, y: 0, z: 0.1 }
    clampToEdge(WORLD, atEdge(1.2), requested, vel)
    assert.ok(requested.x < 0.2 && requested.x >= 0, `${requested.x}`)
    const none = { x: f(0.2), y: 0, z: 0 }
    const stopped = { x: 0.2, y: 0, z: 0.1 }
    clampToEdge(WORLD, atEdge(1.29), none, stopped)
    assert.strictEqual(none.x, 0)
    assert.deepStrictEqual(stopped, { x: 0, y: 0, z: 0 }, 'a zero z request stops z too')
  })

  it('backs off z the same way', () => {
    const requested = { x: 0, y: 0, z: f(-0.2) }
    const vel = { x: 0, y: 0, z: -0.2 }
    clampToEdge(WORLD, atEdge(0.5, -0.29), requested, vel)
    assert.strictEqual(requested.z, 0)
    assert.strictEqual(vel.z, 0)
  })

  it('backs off a diagonal that only fails together', () => {
    // support along +x and along +z, but not at the corner
    const world = worldOf({ '0,-1,0': 'stone', '1,-1,0': 'stone', '0,-1,1': 'stone' }, null)
    const requested = { x: f(0.3), y: 0, z: f(0.3) }
    const vel = { x: 0.3, y: 0, z: 0.3 }
    clampToEdge(world, atEdge(1.2, 1.2), requested, vel)
    assert.ok(requested.x < 0.3 && requested.z < 0.3, `${requested.x} ${requested.z}`)
    assert.strictEqual(requested.x, requested.z)
  })
})
