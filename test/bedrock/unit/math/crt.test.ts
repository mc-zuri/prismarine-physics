import assert from 'node:assert'
import { exact, loadCrt, makePaired, makeScalar, makeSineTable, paired, scalar, sineTable } from '../../../../lib/bedrock/math/crt.ts'

const f = Math.fround

describe('bedrock math/crt', () => {
  it('loads the exact routines, and reports a file it cannot load', () => {
    assert.strictEqual(exact, true)
    assert.strictEqual(loadCrt('no-such-file.wasm'), null)
  })

  it('computes the runtime sine and cosine of degrees', () => {
    assert.strictEqual(scalar.sinDeg(0), 0)
    assert.strictEqual(scalar.cosDeg(0), 1)
    assert.strictEqual(scalar.sinDeg(90), 1)
    assert.deepStrictEqual(scalar.sinCosDeg(90), { sin: scalar.sinDeg(90), cos: scalar.cosDeg(90) })
  })

  it('computes the paired sine and cosine, a float32 step from the scalar ones on some angles', () => {
    assert.deepStrictEqual(paired.sinCosDeg(0), { sin: 0, cos: 1 })
    assert.strictEqual(paired.sinDeg(30), paired.sinCosDeg(30).sin)
    assert.strictEqual(paired.cosDeg(30), paired.sinCosDeg(30).cos)
    let differing = 0
    for (let deg = 0; deg < 360; deg += 0.37) {
      const a = scalar.sinDeg(deg)
      const b = paired.sinDeg(deg)
      assert.ok(Math.abs(a - b) <= 2 ** -23, `${deg}: ${a} ${b}`)
      if (a !== b) differing++
    }
    assert.ok(differing > 0, 'the two shapes differ on some angles')
  })

  it('builds the sine table from the runtime sine of i / 10430.378', () => {
    const bits = (i: number): number => new Uint32Array(Float32Array.of(sineTable[i]!).buffer)[0]!
    assert.strictEqual(sineTable.length, 65536)
    assert.strictEqual(bits(0), 0x00000000)
    assert.strictEqual(bits(16384), 0x3F800000)
    assert.strictEqual(bits(32768), 0xB3BBBD2E)
    assert.strictEqual(bits(1067), 0x3DD123C7)
  })

  it('falls back to Math.sin of the table angles without WebAssembly, a float32 step off on a few entries', () => {
    const table = makeSineTable(null)
    assert.strictEqual(table[1067], f(Math.sin(f(1067 / f(10430.378)))))
    let differing = 0
    for (let i = 0; i < 65536; i++) {
      if (table[i] !== sineTable[i]) differing++
    }
    assert.strictEqual(differing, 85)
  })

  it('falls back to Math.sin / Math.cos rounded to float32 without WebAssembly', () => {
    const rad = f(f(33) * f(0.017453292))
    const s = makeScalar(null)
    const p = makePaired(null, null)
    assert.strictEqual(s.sinDeg(33), f(Math.sin(rad)))
    assert.strictEqual(s.cosDeg(33), f(Math.cos(rad)))
    assert.deepStrictEqual(s.sinCosDeg(33), { sin: f(Math.sin(rad)), cos: f(Math.cos(rad)) })
    assert.deepStrictEqual(p.sinCosDeg(33), { sin: f(Math.sin(rad)), cos: f(Math.cos(rad)) })
    assert.strictEqual(p.sinDeg(33), f(Math.sin(rad)))
    assert.strictEqual(p.cosDeg(33), f(Math.cos(rad)))
  })
})
