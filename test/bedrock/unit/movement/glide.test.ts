import assert from 'node:assert'
import { glide } from '../../../../lib/bedrock/movement/glide.ts'
import { directionFromRotation } from '../../../../lib/bedrock/math/rotation.ts'

const f = Math.fround

describe('bedrock movement/glide', () => {
  it('falls a quarter of gravity with the full lift of a level look', () => {
    const vel = { x: 0, y: 0, z: 0 }
    const look = directionFromRotation(0, 0)
    glide(vel, 0, look, false, false)
    // lift 1: dy = 0 - (0.75 - 1) * -0.08 = -0.02, then a tenth traded forward, then the drags
    assert.ok(vel.y < 0 && vel.y > -0.02, `${vel.y}`)
    assert.ok(vel.z > 0, 'the fall is traded for forward speed')
    assert.ok(Math.abs(vel.x) < 1e-6, 'straight ahead')
  })

  it('falls straight down, dragged, when looking straight down', () => {
    const vel = { x: 0, y: -0.5, z: 0 }
    glide(vel, 90, { x: 0, y: -1, z: 0 }, false, false)
    // lift is 0 at pitch 90 (cos 90 = 0): dy = -0.5 - (0 - 1) * -0.08 = -0.58, times 0.98
    assert.strictEqual(vel.y, f(f(-0.5 - f(f(f(f(0.75) * 0) + f(-1)) * f(-0.079999998))) * f(0.98000002)))
    assert.deepStrictEqual([vel.x, vel.z], [0, 0])
  })

  it('falls slower with slow falling', () => {
    const normal = { x: 0, y: -0.5, z: 0 }
    const slow = { x: 0, y: -0.5, z: 0 }
    glide(normal, 90, { x: 0, y: -1, z: 0 }, false, false)
    glide(slow, 90, { x: 0, y: -1, z: 0 }, true, false)
    assert.ok(slow.y > normal.y)
  })

  it('dives when pitched up (a negative pitch), costing height for speed', () => {
    const level = { x: 0, y: 0, z: 1 }
    const dive = { x: 0, y: 0, z: 1 }
    glide(level, 0, directionFromRotation(0, 0), false, false)
    glide(dive, -30, directionFromRotation(-30, 0), false, false)
    assert.ok(dive.y > level.y, `${dive.y} vs ${level.y}`)
  })

  it('steers the horizontal speed toward the look direction', () => {
    const vel = { x: 1, y: 0, z: 0 }
    glide(vel, 0, directionFromRotation(0, 0), false, false)
    assert.ok(vel.z > 0.09, 'turns toward +z')
    assert.ok(vel.x < 1)
  })

  it('boosts along the look with a firework', () => {
    const plain = { x: 0, y: 0, z: 0.5 }
    const boosted = { x: 0, y: 0, z: 0.5 }
    const look = directionFromRotation(-20, 0)
    glide(plain, -20, look, false, false)
    glide(boosted, -20, look, false, true)
    assert.ok(boosted.z > plain.z)
    assert.ok(boosted.y > plain.y)
  })
})
