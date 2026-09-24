import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { mayStep, moveWithCollisions, tryStep } from '../../../../lib/bedrock/movement/auto-step.ts'
import { worldOf } from '../helpers.ts'

const f = Math.fround
const player = (x = 0.5, y = 0, z = 0.5): Box => new Box(f(x - 0.3), y, f(z - 0.3), f(x + 0.3), f(y + 1.8), f(z + 0.3))
const STEP = 0.6

describe('bedrock movement/auto-step', () => {
  it('steps only after a horizontal clip, on the ground or when a fall was stopped', () => {
    const requested = { x: f(0.3), y: f(-0.08), z: 0 }
    assert.ok(mayStep(true, requested, { x: 0.1, y: f(-0.08), z: 0 }))
    assert.ok(mayStep(false, requested, { x: 0.1, y: 0, z: 0 }), 'landing')
    assert.ok(mayStep(true, requested, { x: 0.3, y: f(-0.08), z: 0.1 }), 'a z clip')
    assert.ok(!mayStep(false, requested, { x: 0.1, y: f(-0.08), z: 0 }), 'airborne')
    assert.ok(!mayStep(false, { x: 0.3, y: 0.2, z: 0 }, { x: 0.1, y: 0, z: 0 }), 'a jump hitting a ceiling')
    assert.ok(!mayStep(true, requested, { x: f(0.3), y: 0, z: 0 }), 'no horizontal clip')
  })

  it('steps up onto a slab', () => {
    const world = worldOf({ '1,0,0': 'bottom_slab' })
    const moved = moveWithCollisions(world, player(), { x: f(0.3), y: f(-0.08), z: 0 }, true, STEP, false)
    assert.strictEqual(moved.x, f(0.3))
    assert.strictEqual(moved.y, 0.5)
  })

  it('settles after a step onto what the mover stands on: powder snow in leather boots', () => {
    // over a slab at x = 1, and on across onto powder snow at x = 2 whose top is the floor level
    const world = worldOf({ '1,0,0': 'bottom_slab', '2,-1,0': 'powder_snow' })
    const moved = moveWithCollisions(world, player(), { x: 2, y: f(-0.08), z: 0 }, true, STEP, false, undefined, undefined, { leatherBoots: true })
    assert.deepStrictEqual([moved.x, moved.y], [2, 0])
  })

  it('does not step onto a full block, or in the air', () => {
    const block = worldOf({ '1,0,0': 'stone' })
    const moved = moveWithCollisions(block, player(), { x: f(0.3), y: f(-0.08), z: 0 }, true, STEP, false)
    assert.deepStrictEqual([moved.x, moved.y], [f(1 - f(0.8)), 0])
    const slab = worldOf({ '1,0,0': 'bottom_slab' }, null)
    const airborne = moveWithCollisions(slab, player(0.5, 0.2), { x: f(0.3), y: f(-0.08), z: 0 }, false, STEP, false)
    assert.strictEqual(airborne.y, f(-0.08))
  })

  it('rises only as high as a ceiling over the destination lets it, when that gets further', () => {
    // a 0.25 step at x = 1 under a ceiling at 2.2: the full 0.6 rise runs into the ceiling on the way across, a 0.4
    // rise clears both
    const world = worldOf({ '1,0,0': 'snow_layer', '1,2,0': 'hanging' })
    const box = player(0.5, 0)
    const requested = { x: f(0.3), y: f(-0.08), z: 0 }
    const plain = moveWithCollisions(world, box, { ...requested, y: 0 }, false, STEP, false)
    assert.strictEqual(plain.x, f(1 - f(0.8)), 'the plain move stops at the step')
    const stepped = tryStep(world, box, requested, plain, STEP, { aabb: box.clone(), descend: false })
    assert.strictEqual(stepped.x, f(0.3))
    assert.strictEqual(stepped.y, 0.25)
  })

  it('keeps the plain move when the lower candidate gets no further', () => {
    // a wall 0.5 up blocks the raised box as much as the plain one
    const world = worldOf({ '1,0,0': 'stone', '1,1,0': 'stone', '0,2,0': 'stone' })
    const box = player(0.5, 0)
    const plain = new Vec3(f(1 - f(0.8)), 0, 0)
    assert.strictEqual(tryStep(world, box, { x: f(0.3), y: 0, z: 0 }, plain, STEP, { aabb: box.clone(), descend: false }), plain)
  })
})
