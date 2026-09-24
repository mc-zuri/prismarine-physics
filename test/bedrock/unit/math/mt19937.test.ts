import assert from 'node:assert'
import { MT19937_STATE_BYTES, mt19937FromSeed, mt19937NextFloat, mt19937NextWord } from '../../../../lib/bedrock/math/mt19937.ts'

describe('bedrock math/mt19937', () => {
  it('draws the standard Mersenne Twister stream, seeding its words lazily', () => {
    const state = mt19937FromSeed(5489)
    assert.deepStrictEqual([mt19937NextWord(state), mt19937NextWord(state), mt19937NextWord(state)], [3499211612, 581869302, 3890346734])
    for (let i = 3; i < 700; i++) mt19937NextWord(state)
    assert.strictEqual(new DataView(state.buffer).getInt32(4 + 624 * 4, true), 700 - 624, 'the index wraps after 624 words')
  })

  it('seeds itself with 5489 when never seeded', () => {
    const state = new Uint8Array(MT19937_STATE_BYTES)
    new DataView(state.buffer).setInt32(4 + 624 * 4, 625, true)
    assert.strictEqual(mt19937NextWord(state), 3499211612)
  })

  it('draws a float in [0, 1) as a float32', () => {
    const value = mt19937NextFloat(mt19937FromSeed(5489))
    assert.strictEqual(value, Math.fround(3499211612 * 2.3283064365386963e-10))
  })
})
