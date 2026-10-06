import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { tableCosRad, tableSinRad, wrapDegrees } from '../../../../lib/bedrock/math/rotation.ts'
import { chargeJump, mountMove, newHorseState, pendingJumpScale, powerJump, turnToward } from '../../../../lib/bedrock/vehicle/horse.ts'

const f = Math.fround

describe('bedrock vehicle/horse', () => {
  it('charges while jump stays held (the first tick held adds nothing), latches on the release and parks at -10', () => {
    const h = newHorseState()
    chargeJump(h, true, false)
    assert.deepStrictEqual([h.jumpTicks, h.jumpScale], [0, 0], 'first tick held')
    chargeJump(h, true, true)
    chargeJump(h, true, true)
    assert.deepStrictEqual([h.jumpTicks, h.jumpScale], [2, f(2 * f(0.1))])
    chargeJump(h, false, true)
    assert.deepStrictEqual([h.jumpTicks, h.pendingJump], [-10, pendingJumpScale(20)])
    for (let i = 0; i < 9; i++) chargeJump(h, false, false)
    assert.deepStrictEqual([h.jumpTicks, h.jumpScale], [-1, f(0.2)], 'counting back up')
    chargeJump(h, false, false)
    assert.deepStrictEqual([h.jumpTicks, h.jumpScale], [0, 0], 'cleared as it reaches 0')
  })

  it('eases a long charge back toward 0.8', () => {
    const h = newHorseState()
    h.jumpTicks = 9
    chargeJump(h, true, true)
    assert.strictEqual(h.jumpScale, f(f(f(2 / 1) * f(0.1)) + f(0.8)))
    h.jumpTicks = 20
    chargeJump(h, true, true)
    assert.ok(h.jumpScale < 0.9 && h.jumpScale > 0.8)
  })

  it('makes a pending jump of 0.4 to 0.8 from a release, full from 90', () => {
    assert.strictEqual(pendingJumpScale(0), f(0.4))
    assert.strictEqual(pendingJumpScale(10), f(f(f(10 * f(0.4)) / 90) + f(0.4)))
    assert.strictEqual(pendingJumpScale(90), 1)
  })

  it('turns toward the rider, faster the closer it is, wrapped in float32', () => {
    assert.strictEqual(turnToward(0, 10), wrapDegrees(f(10 * f(f(35 / 90) * f(0.7)))))
    assert.strictEqual(turnToward(0, 90), wrapDegrees(f(90 * f(f(0.18) * f(0.7)))), 'far: the least rate')
    assert.strictEqual(turnToward(-0.001922607421875, -0.0055084228515625), -0.003173828125, 'rounded to the steps near 180')
    assert.ok(turnToward(170, -170) > 170, 'the short way round')
  })

  it('takes the rider move sideways at half and backward at a quarter', () => {
    assert.deepStrictEqual(mountMove({ x: 1, z: 1 }), { x: 0.5, z: 1 })
    assert.deepStrictEqual(mountMove({ x: -1, z: -1 }), { x: -0.5, z: -0.25 })
  })

  it('jumps at the strength times the pending jump, with Jump Boost, pushed along the yaw moving forward', () => {
    const still = new Vec3(0, 0, 0)
    powerJump(still, 0, 0.7, 0.5, 0, false, false)
    assert.deepStrictEqual([still.x, still.y, still.z], [0, f(f(0.7) * 0.5), 0])
    const boosted = new Vec3(0, 0, 0)
    powerJump(boosted, 0, 0.7, 0.5, 2, false, true)
    assert.strictEqual(boosted.y, f(f(f(f(0.7) * 0.5) * f(0.60000002)) + f(f(f(2) * f(0.1)) * f(0.60000002))))
    const forward = new Vec3(0, 0, f(0.1))
    powerJump(forward, 90, 0.7, 0.5, 0, true, false)
    const r = f(90 * f(0.017453292))
    assert.deepStrictEqual([forward.x, forward.z], [f(0 - f(f(tableSinRad(r) * f(0.40000001)) * 0.5)), f(f(f(tableCosRad(r) * f(0.40000001)) * 0.5) + f(0.1))])
  })
})
