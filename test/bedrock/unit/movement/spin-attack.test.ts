import assert from 'node:assert'
import { bounceOffHits, riptideImpulse, stepSpin, type SpinState } from '../../../../lib/bedrock/movement/spin-attack.ts'

const f = Math.fround
const still = { pitch: 0, yaw: 0, level: 1, onGround: false, bodyInWater: false }

describe('bedrock movement/spin-attack', () => {
  describe('the launch', () => {
    it('launches along the look at (level + 1) * 0.75', () => {
      assert.deepStrictEqual(riptideImpulse(still), { x: -0, y: -0, z: f(1.5) })
      const up = riptideImpulse({ ...still, pitch: -90, level: 3 })
      assert.deepStrictEqual([up.y, Math.abs(up.x), Math.abs(up.z)], [3, 0, 0])
    })

    it('normalises an oblique look through the float32 grouping', () => {
      const oblique = riptideImpulse({ ...still, pitch: -30, yaw: 45 })
      const length = Math.hypot(oblique.x, oblique.y, oblique.z)
      assert.ok(Math.abs(length - 1.5) < 1e-6)
      assert.ok(oblique.x < 0 && oblique.y > 0 && oblique.z > 0)
    })

    it('lifts a launch from the ground by 0.08, or rescales it in water with the head out', () => {
      assert.strictEqual(riptideImpulse({ ...still, onGround: true }).y, f(-0 + f(0.079999998)))
      const up = riptideImpulse({ ...still, pitch: -90, onGround: true, bodyInWater: true })
      assert.strictEqual(up.y, f(f(f(1.5) / f(0.80000001)) * f(0.98000002)))
      assert.strictEqual(riptideImpulse({ ...still, bodyInWater: true }).y, -0, 'in the air, nothing')
    })
  })

  describe('the spin', () => {
    const spin = (spinTicks: number): SpinState => ({ spinning: true, spinTicks })
    const quiet = { hits: 0, horizontalCollision: false, onGround: false }

    it('holds the counter at zero while not spinning', () => {
      const state = { spinning: false, spinTicks: 7 }
      assert.strictEqual(stepSpin(state, quiet), false)
      assert.deepStrictEqual(state, { spinning: false, spinTicks: 0 })
    })

    it('counts 19 ticks in the air, then ends', () => {
      const state = spin(0)
      let ticks = 0
      while (!stepSpin(state, quiet)) ticks++
      assert.deepStrictEqual([ticks, state], [19, { spinning: false, spinTicks: 0 }])
    })

    it('ends on the ground from its sixth tick', () => {
      assert.strictEqual(stepSpin(spin(4), { ...quiet, onGround: true }), false)
      const state = spin(5)
      assert.strictEqual(stepSpin(state, { ...quiet, onGround: true }), true)
      assert.strictEqual(state.spinning, false)
    })

    it('ends on a hit or a wall, the counter restarting', () => {
      for (const facts of [{ ...quiet, hits: 2 }, { ...quiet, horizontalCollision: true }]) {
        const state = spin(3)
        assert.strictEqual(stepSpin(state, facts), true)
        assert.deepStrictEqual(state, { spinning: false, spinTicks: 1 })
      }
    })

    it('bounces the velocity back by -0.2 per hit, one hit at a time', () => {
      const vel = { x: 1, y: f(0.3), z: -2 }
      bounceOffHits(vel, 2)
      assert.deepStrictEqual(vel, { x: f(f(-0.2) * f(-0.2)), y: f(f(f(0.3) * f(-0.2)) * f(-0.2)), z: f(f(-2 * f(-0.2)) * f(-0.2)) })
      const none = { x: 1, y: 1, z: 1 }
      bounceOffHits(none, 0)
      assert.deepStrictEqual(none, { x: 1, y: 1, z: 1 })
    })
  })
})
