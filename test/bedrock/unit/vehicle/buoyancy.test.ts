import assert from 'node:assert'
import {
  advanceTimer, boatBuoyancy, buoyancyFloat, buoyancyFromData, buoyancyGravity, floatRequest, MovementType
} from '../../../../lib/bedrock/vehicle/buoyancy.ts'
import { worldOf } from '../helpers.ts'

const f = Math.fround

describe('bedrock vehicle/buoyancy', () => {
  it('floats a boat on water with waves and gravity', () => {
    const b = boatBuoyancy()
    assert.deepStrictEqual([b.baseBuoyancy, b.applyGravity, b.movementType, b.bigWaveSpeed, b.liquidBlocks], [1, true, MovementType.Waves, 10, ['water', 'flowing_water']])
  })

  describe('the buoyancy data', () => {
    it('reads the fields it carries over the defaults', () => {
      const b = buoyancyFromData(JSON.stringify({ base_buoyancy: 0.5, apply_gravity: false, movement_type: 'bobbing', big_wave_probability: 0.1, big_wave_speed: 3, liquid_blocks: ['minecraft:lava', 7] }))
      assert.deepStrictEqual([b.baseBuoyancy, b.applyGravity, b.movementType, b.bigWaveProbability, b.bigWaveSpeed, b.liquidBlocks], [0.5, false, MovementType.Bobbing, f(0.1), 3, ['lava']])
      assert.strictEqual(buoyancyFromData('{"movement_type":"none"}').movementType, MovementType.None)
      assert.strictEqual(buoyancyFromData('{}').movementType, MovementType.Waves)
    })

    it('reads over the current settings, keeping the timer, with the liquids cleared first', () => {
      const current = { ...boatBuoyancy(), baseBuoyancy: f(0.25), timer: 12.5 }
      const read = buoyancyFromData('{"movement_type":"none"}', current)
      assert.deepStrictEqual([read.baseBuoyancy, read.timer, read.movementType, read.liquidBlocks], [f(0.25), 12.5, MovementType.None, []])
    })

    it('floats in nothing for data that is not an object, the rest left', () => {
      const floatsInNothing = { ...boatBuoyancy(), liquidBlocks: [] }
      assert.deepStrictEqual(buoyancyFromData('not json'), floatsInNothing)
      assert.deepStrictEqual(buoyancyFromData('[1]'), floatsInNothing)
      assert.deepStrictEqual(buoyancyFromData('null'), floatsInNothing)
    })
  })

  describe('the wave timer', () => {
    it('steps faster with the speed, ten times on a big wave', () => {
      const calm = boatBuoyancy()
      advanceTimer(calm, { x: 0, y: 0, z: 0 }, 0.5)
      assert.strictEqual(calm.timer, f(0.05))
      const big = boatBuoyancy()
      advanceTimer(big, { x: 0, y: 0, z: 0 }, 0.01)
      assert.strictEqual(big.timer, f(f(10) * f(0.05)))
      const fast = boatBuoyancy()
      advanceTimer(fast, { x: 0.3, y: 0, z: 0.4 }, 0.5)
      assert.strictEqual(fast.timer, f(f(f(f(0.5) * 30) + 1) * f(0.05)))
    })

    it('steps one a tick when bobbing', () => {
      const bob = { ...boatBuoyancy(), movementType: MovementType.Bobbing }
      advanceTimer(bob, { x: 5, y: 0, z: 5 }, 0)
      assert.strictEqual(bob.timer, 1)
    })
  })

  describe('the float request', () => {
    const pool = worldOf({ '0,0,0': 'water', '5,0,0': 'water', '5,1,0': 'water' })
    it('floats in water below its surface with air above, and resurfaces with water above', () => {
      assert.deepStrictEqual(floatRequest(pool, boatBuoyancy(), { x: 0.5, y: 0.5, z: 0.5 }), { canFloat: true, needToResurface: false })
      assert.deepStrictEqual(floatRequest(pool, boatBuoyancy(), { x: 5.5, y: 0.5, z: 0.5 }), { canFloat: false, needToResurface: true })
      assert.deepStrictEqual(floatRequest(pool, boatBuoyancy(), { x: 9.5, y: 0.5, z: 0.5 }), { canFloat: false, needToResurface: false })
    })

    it('takes a bubble column for water', () => {
      const column = worldOf({ '0,0,0': 'bubble_column' })
      assert.deepStrictEqual(floatRequest(column, boatBuoyancy(), { x: 0.5, y: 0.5, z: 0.5 }), { canFloat: true, needToResurface: false })
    })
  })

  it('pulls down with drag', () => {
    assert.strictEqual(buoyancyGravity(0), f(f(-0.04) * f(0.98)))
  })

  describe('the float', () => {
    const at = (y: number) => ({ x: 0, y, z: 0 })
    it('rises toward the surface less the wave, at most 0.05 above the damped velocity', () => {
      const b = boatBuoyancy()
      const low = buoyancyFloat(b, { canFloat: true, needToResurface: false }, at(0.2), 0)
      assert.strictEqual(low, f(0.05), 'capped')
      const high = buoyancyFloat(b, { canFloat: true, needToResurface: false }, at(0.95), 0)
      assert.ok(high < f(0.05))
      const flat = { ...boatBuoyancy(), movementType: MovementType.None, baseBuoyancy: 5 }
      assert.strictEqual(buoyancyFloat(flat, { canFloat: true, needToResurface: false }, at(0.5), -1), f(f(f(1 - 0) + f(-0.1)) * f(0.15)) < f(f(-1 * f(0.7)) + f(0.05)) ? f(f(f(1 - 0) + f(-0.1)) * f(0.15)) : f(f(-1 * f(0.7)) + f(0.05)), 'a surface above the top counts as the top')
    })

    it('bobs, or rides flat without a wave', () => {
      const bobbing = buoyancyFloat({ ...boatBuoyancy(), movementType: MovementType.Bobbing, timer: 3 }, { canFloat: true, needToResurface: false }, at(0.9), 0)
      const flat = buoyancyFloat({ ...boatBuoyancy(), movementType: MovementType.None }, { canFloat: true, needToResurface: false }, at(0.9), 0)
      assert.notStrictEqual(bobbing, flat)
    })

    it('does nothing above the surface or out of a liquid, and rises when it has to resurface', () => {
      assert.strictEqual(buoyancyFloat({ ...boatBuoyancy(), baseBuoyancy: -1 }, { canFloat: true, needToResurface: false }, at(0.5), 0.3), 0.3)
      assert.strictEqual(buoyancyFloat(boatBuoyancy(), { canFloat: false, needToResurface: false }, at(0.5), 0.3), 0.3)
      assert.strictEqual(buoyancyFloat(boatBuoyancy(), { canFloat: false, needToResurface: true }, at(0.5), 0), f(0.05))
    })
  })
})
