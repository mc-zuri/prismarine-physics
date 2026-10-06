import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { exact, loadCrt, loadCrtAsync, makePaired, makeScalar, makeSineTable, nodeFs, paired, scalar, sineTable, useCrt, WASM_URL } from '../../../../lib/bedrock/math/crt.ts'

const f = Math.fround

describe('bedrock math/crt', () => {
  it('loads the exact routines, and reports a file it cannot load', () => {
    assert.strictEqual(exact, true)
    assert.strictEqual(loadCrt('no-such-file.wasm'), null)
  })

  it('reads the module with the process\'s fs, and reads nothing without one', () => {
    assert.strictEqual(typeof nodeFs()?.readFileSync, 'function')
    assert.strictEqual(nodeFs(null), null)
    assert.strictEqual(nodeFs({}), null)
    assert.strictEqual(loadCrt(WASM_URL, null), null)
    assert.notStrictEqual(loadCrt(WASM_URL), null)
  })

  it('puts loaded routines in the objects already in use', async () => {
    const before = { scalar, paired, sineTable, sin: scalar.sinDeg(33), entry: sineTable[1067] }
    useCrt(loadCrt()!)
    assert.strictEqual(scalar, before.scalar)
    assert.strictEqual(paired, before.paired)
    assert.strictEqual(sineTable, before.sineTable)
    assert.strictEqual(scalar.sinDeg(33), before.sin)
    assert.strictEqual(sineTable[1067], before.entry)
    // already exact: nothing is fetched
    assert.strictEqual(await loadCrtAsync(WASM_URL, () => { throw new Error('fetched') }), true)
  })

  it('fetches the routines where there is no fs to read them with, as in a browser', () => {
    const script = [
      'process.getBuiltinModule = undefined',
      "require('./lib/ts-hooks')",
      "const fs = require('fs')",
      "const crt = require('./lib/bedrock/math/crt.ts')",
      'const reference = crt.makeSineTable(crt.loadCrt(crt.WASM_URL, fs).exports)',
      'const differing = () => reference.filter((value, i) => value !== crt.sineTable[i]).length',
      'const { scalar, sineTable } = crt',
      'const bytes = url => { const b = fs.readFileSync(url); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }',
      ';(async () => {',
      '  const out = { before: crt.exact, differing: differing() }',
      // Node's fetch takes no file: URL
      '  out.unfetchable = await crt.loadCrtAsync()',
      '  out.notFound = await crt.loadCrtAsync(crt.WASM_URL, async () => ({ ok: false }))',
      '  out.fetched = await crt.loadCrtAsync(crt.WASM_URL, async url => ({ ok: true, arrayBuffer: async () => bytes(url) }))',
      '  Object.assign(out, { after: crt.exact, differingAfter: differing(), same: crt.scalar === scalar && crt.sineTable === sineTable })',
      '  console.log(JSON.stringify(out))',
      '})()'
    ].join('\n')
    const root = path.join(import.meta.dirname, '..', '..', '..', '..')
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' }))
    assert.deepStrictEqual(out, { before: false, differing: 85, unfetchable: false, notFound: false, fetched: true, after: true, differingAfter: 0, same: true })
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
