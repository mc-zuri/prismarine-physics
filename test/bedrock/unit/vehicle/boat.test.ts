import assert from 'node:assert'
import { scalar } from '../../../../lib/bedrock/math/crt.ts'
import {
  applyBoatFriction, boatControl, boatFriction, newPaddle, paddleForces, paddleRowing, paddleWithForce, WATER_FRICTION
} from '../../../../lib/bedrock/vehicle/boat.ts'
import { worldOf } from '../helpers.ts'

const f = Math.fround

describe('bedrock vehicle/boat', () => {
  describe('the paddle forces', () => {
    it('pushes both paddles forward, the up key at full force', () => {
      assert.deepStrictEqual(paddleForces({ x: 0, z: 1 }, false), [1, 1])
      assert.deepStrictEqual(paddleForces({ x: 0, z: 0 }, true), [1, 1])
      assert.deepStrictEqual(paddleForces({ x: 0, z: 0 }, false), [0, 0])
    })

    it('splits a strafe between the paddles, clamped to one', () => {
      const [left, right] = paddleForces({ x: 0.5, z: 1 }, false)
      assert.ok(left < right)
      assert.deepStrictEqual(paddleForces({ x: 2, z: 0 }, false), [0, 2])
      assert.deepStrictEqual(paddleForces({ x: -2, z: 0 }, false), [2, 0])
    })

    it('backs at -0.15 with the strafe mirrored, the forward push clamped', () => {
      const [left, right] = paddleForces({ x: 0.5, z: -3 }, false)
      assert.ok(left < 0 && right < 0)
      assert.ok(Math.abs(left) > Math.abs(right), 'the strafe mirrored')
      assert.deepStrictEqual(paddleForces({ x: 0, z: 3 }, false), [1, 1], 'clamped to 1')
    })
  })

  describe('a paddle with a force', () => {
    it('strokes at three times the force, at most every 10 ticks, easing 0.1 off between', () => {
      const p = newPaddle()
      paddleWithForce(p, 10, 1)
      assert.deepStrictEqual([p.force, p.lastStrokeTick], [3, 10])
      paddleWithForce(p, 15, 1)
      assert.strictEqual(p.force, f(3 + -0.1))
      paddleWithForce(p, 16, -1)
      assert.strictEqual(p.force, f(-f(3 + -0.1)))
      paddleWithForce(p, 17, f(0.01))
      assert.strictEqual(p.force, 0, 'eased below nothing')
      paddleWithForce(p, 20, 0.5)
      assert.deepStrictEqual([p.force, p.lastStrokeTick], [1.5, 20])
      paddleWithForce(p, 21, 0)
      assert.strictEqual(p.force, 0)
    })
  })

  describe('a rowed paddle', () => {
    it('starts a stroke at 3, or eases from the last within 9 ticks', () => {
      const p = newPaddle()
      paddleRowing(p, 20, true)
      assert.deepStrictEqual([p.force, p.lastStrokeTick, p.rowTime], [3, 20, 0])
      paddleRowing(p, 25, true)
      assert.strictEqual(p.force, 3, 'held within 9 ticks')
      paddleRowing(p, 30, true)
      assert.strictEqual(p.force, f(3 + -0.05), 'held longer, easing')
      p.force = 2.5
      paddleRowing(p, 31, true)
      assert.strictEqual(p.force, 2.5, 'not below 2.5')
      paddleRowing(p, 32, false)
      assert.deepStrictEqual([p.force, p.lastStrokeTick, p.position], [1.25, -1, 20])
      paddleRowing(p, 33, true)
      assert.strictEqual(p.force, 3, 'a new stroke more than 9 ticks after the last one started')
      paddleRowing(p, 34, false)
      paddleRowing(p, 35, true)
      assert.strictEqual(p.force, 2.5, 'a new stroke soon after: eased, at least 2.5')
    })

    it('halves away once released, then stops', () => {
      const p = { ...newPaddle(), force: f(0.02) }
      paddleRowing(p, 0, false)
      assert.strictEqual(p.force, f(0.01))
      paddleRowing(p, 1, false)
      assert.strictEqual(p.force, 0)
    })
  })

  describe('the friction', () => {
    const pool = worldOf({ '0,0,0': 'water', '0,-1,0': 'water', '5,0,0': 'water', '5,1,0': 'water', '9,0,0': 'ice', '12,1,0': 'bottom_slab', '14,1,0': 'cobweb', '14,0,0': 'ice' })

    it('floats on water below its surface with air above', () => {
      assert.deepStrictEqual(boatFriction(pool, { x: 0.5, y: 0.5, z: 0.5 }, false), { invFriction: WATER_FRICTION, inAir: false, floating: true, resurfacing: false })
    })

    it('resurfaces from under water', () => {
      assert.deepStrictEqual(boatFriction(pool, { x: 5.5, y: 0.5, z: 0.5 }, false), { invFriction: WATER_FRICTION, inAir: false, floating: false, resurfacing: true })
    })

    it('takes the friction of the block it is on', () => {
      assert.strictEqual(boatFriction(pool, { x: 9.5, y: 1, z: 0.5 }, true).invFriction, f(0.98))
      assert.strictEqual(boatFriction(pool, { x: 20.5, y: 1, z: 0.5 }, false).inAir, true)
    })

    it('takes the block in its cell when that has a shape, and is in the air off the ground', () => {
      const slab = boatFriction(pool, { x: 12.5, y: 1.2, z: 0.5 }, true)
      assert.deepStrictEqual([slab.invFriction, slab.inAir], [f(0.6), false])
      assert.deepStrictEqual(boatFriction(pool, { x: 12.5, y: 1.2, z: 0.5 }, false).inAir, true)
      assert.strictEqual(boatFriction(pool, { x: 14.5, y: 1.2, z: 0.5 }, true).invFriction, f(0.98), 'no shape: the block below')
    })

    it('slows as on water just above water it is not on', () => {
      assert.deepStrictEqual(boatFriction(pool, { x: 0.5, y: 1.5, z: 0.5 }, false), { invFriction: WATER_FRICTION, inAir: false, floating: false, resurfacing: false })
    })

    it('scales the horizontal velocity and the turn rate', () => {
      const motion = { vel: { x: 1, y: 1, z: 1 }, yaw: 0, yRotD: 2 }
      applyBoatFriction(motion, 0.5)
      assert.deepStrictEqual(motion, { vel: { x: 0.5, y: 1, z: 0.5 }, yaw: 0, yRotD: 1 })
    })
  })

  describe('the control', () => {
    const stroke = (force: number) => ({ ...newPaddle(), force })

    it('pushes along the heading and turns with the difference', () => {
      const motion = { vel: { x: 0, y: 0, z: 0 }, yaw: 0, yRotD: 0 }
      boatControl(motion, [stroke(3), stroke(3)], { invFriction: 1, inAir: false }, scalar)
      assert.ok(motion.vel.x > 0 && motion.yRotD === 0)
      const turning = { vel: { x: 0, y: 0, z: 0 }, yaw: 0, yRotD: 0 }
      boatControl(turning, [stroke(3), stroke(0)], { invFriction: 1, inAir: false }, scalar)
      assert.strictEqual(turning.yRotD, f(f(f(f(f(3 * f(3 * f(0.01375))) * f(1.6)) * 10) + 0) * 1), 'sharper from a standstill')
    })

    it('does not push or turn in the air, but the row time runs and wraps', () => {
      const paddle = { ...stroke(3), rowTime: 999.99 }
      const motion = { vel: { x: 1, y: 0, z: 0 }, yaw: 0, yRotD: 0 }
      boatControl(motion, [paddle, stroke(0)], { invFriction: 1, inAir: true }, scalar)
      assert.deepStrictEqual([motion.yRotD, motion.vel.x], [0, 1])
      assert.ok(paddle.rowTime < 1)
    })

    it('resets an idle paddle', () => {
      const idle = { ...newPaddle(), rowTime: 5, lastStrokeTick: 3 }
      boatControl({ vel: { x: 0, y: 0, z: 0 }, yaw: 0, yRotD: 0 }, [idle, idle], { invFriction: 1, inAir: false }, scalar)
      assert.deepStrictEqual([idle.rowTime, idle.lastStrokeTick], [0, -1])
    })
  })
})
