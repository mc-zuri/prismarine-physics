import assert from 'node:assert'
import { boostedWaterSpeed, dolphinQueryBox, renewBoost, scanTick, swimSpeedMultiplier } from '../../../../lib/bedrock/movement/dolphin.ts'
import { countDown, durationCovers, fireworkBoost } from '../../../../lib/bedrock/movement/movement-effects.ts'

const f = Math.fround

describe('bedrock movement/dolphin', () => {
  it('counts down to a look every 60 ticks while swimming, and holds otherwise', () => {
    assert.deepStrictEqual(scanTick(0, true), { timer: 60, scan: true })
    assert.deepStrictEqual(scanTick(1, true), { timer: 60, scan: true })
    assert.deepStrictEqual(scanTick(60, true), { timer: 59, scan: false })
    assert.deepStrictEqual(scanTick(7, false), { timer: 7, scan: false })
  })

  it('looks 5 blocks around the box', () => {
    const box = dolphinQueryBox({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 2, maxZ: 1 })
    assert.deepStrictEqual([box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ], [-5, -5, -5, 6, 7, 6])
  })

  it('renews the boost only when a dolphin is found and less than its length is left', () => {
    assert.strictEqual(durationCovers(60, 60), true)
    assert.strictEqual(durationCovers(-1, 60), true, 'without end covers anything')
    assert.strictEqual(durationCovers(80, -1), false, 'nothing short of endless covers endless')
    assert.strictEqual(durationCovers(30, 60), false)
    assert.strictEqual(renewBoost(0, true), 60)
    assert.strictEqual(renewBoost(5, false), 5)
    assert.strictEqual(renewBoost(-1, true), -1)
  })

  it('counts an effect down, gone after its last tick; none and endless stay', () => {
    assert.deepStrictEqual([countDown(60), countDown(2), countDown(1), countDown(0), countDown(-1)], [59, 1, 0, 0, -1])
  })

  it('gives a firework used gliding the client boost, unless a longer one runs', () => {
    assert.deepStrictEqual([fireworkBoost(0, true), fireworkBoost(5, true), fireworkBoost(30, true), fireworkBoost(-1, true), fireworkBoost(0, false)], [20, 20, 30, -1, 0])
  })

  it('doubles the swim speed swimming with the boost, shaped by Depth Strider', () => {
    assert.deepStrictEqual([swimSpeedMultiplier(true, 10), swimSpeedMultiplier(false, 10), swimSpeedMultiplier(true, 0)], [2, 1, 1])
    assert.strictEqual(boostedWaterSpeed(f(0.02), 2, 0), f(f(0.02) * f(2 * f(0.7))))
    assert.strictEqual(boostedWaterSpeed(f(0.02), 2, 5), f(f(0.02) * 2), 'the level stops at 3')
    assert.strictEqual(boostedWaterSpeed(f(0.02), 2, -1), boostedWaterSpeed(f(0.02), 2, 0))
    assert.strictEqual(boostedWaterSpeed(f(0.02), 2, undefined as unknown as number), boostedWaterSpeed(f(0.02), 2, 0))
  })
})
