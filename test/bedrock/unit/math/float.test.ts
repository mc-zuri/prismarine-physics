import assert from 'node:assert'
import { f, FLOAT32_MIN_SUBNORMAL, FLT_MAX, VELOCITY_EPSILON } from '../../../../lib/bedrock/math/float.ts'

describe('bedrock math/float', () => {
  it('names the float32 constants', () => {
    assert.strictEqual(VELOCITY_EPSILON, 2 ** -23)
    assert.strictEqual(FLT_MAX, f(FLT_MAX))
    assert.strictEqual(f(FLT_MAX * 2), Infinity)
    assert.strictEqual(FLOAT32_MIN_SUBNORMAL, 2 ** -149)
  })
})
