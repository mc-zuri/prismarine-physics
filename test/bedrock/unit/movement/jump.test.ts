import assert from 'node:assert'
import {
  climbSpeed, jumpReduced, jumpVelocity, LADDER_CLIMB_SPEED, liquidJump, SCAFFOLDING_CLIMB_SPEED, sprintJumpBoost, swimPoseHold, waterSink
} from '../../../../lib/bedrock/movement/jump.ts'
import { block } from '../helpers.ts'

const f = Math.fround

describe('bedrock movement/jump', () => {
  it('climbs 0.2 on ladders and vines, 0.15 on scaffolding', () => {
    assert.strictEqual(climbSpeed('ladder'), LADDER_CLIMB_SPEED)
    assert.strictEqual(climbSpeed('vine'), f(0.2))
    assert.strictEqual(climbSpeed('scaffolding'), SCAFFOLDING_CLIMB_SPEED)
  })

  it('sinks 0.04 in water on the sneak key or the slow descend, not while flying', () => {
    assert.strictEqual(waterSink(0, { down: true }), f(-0.04))
    assert.strictEqual(waterSink(0.1, { downSlow: true }), f(f(0.1) + f(-0.04)))
    assert.strictEqual(waterSink(0.1, { down: true, flying: true }), 0.1)
    assert.strictEqual(waterSink(0.1, {}), 0.1)
  })

  it('reduces a jump from honey or a climbable, at the feet or below', () => {
    assert.ok(jumpReduced(block('honey_block'), null))
    assert.ok(jumpReduced(null, block('ladder')))
    assert.ok(!jumpReduced(block('stone'), block('slime')))
  })

  it('jumps 0.42 plus 0.1 per Jump Boost level, 0.6 of it when reduced', () => {
    assert.strictEqual(jumpVelocity(f(0.42), undefined, false), f(0.42))
    assert.strictEqual(jumpVelocity(f(0.42), 2, false), f(f(0.42) + f(0.2)))
    assert.strictEqual(jumpVelocity(f(0.42), 0, true), f(f(0.42) * f(0.60000002)))
  })

  it('pushes a sprint jump 0.2 along the facing direction', () => {
    const south = { x: 0, y: 0.42, z: 0 }
    sprintJumpBoost(south, 0, 0.2)
    assert.deepStrictEqual(south, { x: 0, y: 0.42, z: f(0.2) })
    const west = { x: 0, y: 0, z: 0 }
    sprintJumpBoost(west, 90, 0.2)
    assert.strictEqual(west.x, f(-0.2))
    assert.ok(Math.abs(west.z) < 1e-7)
  })

  it('holds a jump in the swim pose with the head out, or between poses', () => {
    assert.ok(swimPoseHold({ swimming: true, headInWater: false }))
    assert.ok(!swimPoseHold({ swimming: true, headInWater: true, poseAmount: 1 }))
    assert.ok(swimPoseHold({ poseAmount: 0.5 }))
    assert.ok(!swimPoseHold({ poseAmount: 0 }))
    assert.ok(!swimPoseHold({}))
  })

  describe('in a liquid', () => {
    it('holds the vertical motion of a swimmer with the head out, or between swim poses', () => {
      assert.strictEqual(liquidJump(0.3, { jump: true, swimming: true, headInWater: false, wasInWater: true }), 0)
      assert.strictEqual(liquidJump(0.3, { jump: true, poseAmount: 0.5, wasInWater: true }), 0)
      assert.strictEqual(liquidJump(0.3, { jump: true, poseAmount: 0.5 }), 0.3, 'not in water last tick: unchanged')
    })

    it('rises on jump and sinks on sneak in water', () => {
      assert.strictEqual(liquidJump(0, { jump: true, wasInWater: true, poseAmount: 0 }), f(0.04))
      assert.strictEqual(liquidJump(0, { jump: true, wasInWater: true, poseAmount: 1, swimming: true, headInWater: true }), f(0.04))
      assert.strictEqual(liquidJump(0, { jump: false, wasInWater: true, wantDown: true }), f(-0.04))
      assert.strictEqual(liquidJump(0, { jump: true, wasInWater: true, wantDownSlow: true }), f(f(-0.04) + f(0.04)))
      assert.strictEqual(liquidJump(0.2, { jump: false, wasInWater: true }), 0.2)
    })

    it('rises on jump in lava, and does not sink', () => {
      assert.strictEqual(liquidJump(0, { jump: true, wasInLava: true }), f(0.04))
      assert.strictEqual(liquidJump(0.1, { jump: false, wasInLava: true, wantDown: true }), 0.1)
    })

    it('is not a liquid jump out of liquids', () => {
      assert.strictEqual(liquidJump(0, { jump: true }), null)
    })
  })
})
