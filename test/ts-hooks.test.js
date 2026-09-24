/* eslint-env mocha */
// lib/ts-hooks.js: the Bedrock engine's TypeScript sources load with no build step, from the repository and from a
// copy under node_modules (where Node does not strip types by itself), with every line where it is in the source; no
// other package's TypeScript goes through the hook.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
require('../lib/ts-hooks')

const probe = path.join(__dirname, 'fixtures', 'ts', 'probe.ts')

describe('TypeScript load hook', () => {
  it('loads a .ts module with its types stripped and its lines in place', () => {
    const m = require(probe)
    assert.strictEqual(m.sum({ a: 2, b: 3 }), 5)
    const line = fs.readFileSync(probe, 'utf8').split('\n').findIndex(l => l.includes("new Error('probe')")) + 1
    assert.strictEqual(m.lineHere(), line)
  })

  it('takes the TypeScript modules of this package only', () => {
    const { ours } = require('../lib/ts-hooks')
    const root = path.join(__dirname, '..')
    assert.ok(ours(pathToFileURL(path.join(root, 'lib', 'bedrock', 'index.ts')).href))
    assert.ok(ours(pathToFileURL(path.join(root, 'test', 'probe.mts')).href))
    assert.ok(!ours(pathToFileURL(path.join(root, 'lib', 'bedrock', 'types.d.ts')).href), 'declarations are not modules')
    assert.ok(!ours(pathToFileURL(path.join(root, 'index.js')).href))
    assert.ok(!ours(pathToFileURL(path.join(root, 'node_modules', 'dependency', 'index.ts')).href), 'one of a dependency')
  })

  it('leaves every other TypeScript file to Node and to the loaders of the application', () => {
    const { ours } = require('../lib/ts-hooks')
    const outside = path.join(os.tmpdir(), 'app', 'main.ts')
    assert.ok(!ours(pathToFileURL(outside).href))
    // a CommonJS .ts under an application's node_modules is Node's to refuse, not ours to load as an ES module
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-hooks-'))
    const copy = path.join(dir, 'node_modules', 'probe', 'probe.ts')
    fs.mkdirSync(path.dirname(copy), { recursive: true })
    fs.copyFileSync(probe, copy)
    try {
      assert.throws(() => require(copy), { code: 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING' })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the package entry point', () => {
  it('loads the Bedrock engine only when a Bedrock export is used', () => {
    const { execFileSync } = require('child_process')
    const script = [
      "const physics = require('.')",
      "const loaded = () => Object.keys(require.cache).some(k => k.endsWith('ts-hooks.js'))",
      'const before = loaded()',
      'const session = typeof physics.BedrockSession',
      'console.log(JSON.stringify({ before, session, after: loaded(), keys: Object.keys(physics) }))'
    ].join('\n')
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }))
    assert.deepStrictEqual(out, { before: false, session: 'function', after: true, keys: ['Physics', 'PlayerState', 'BedrockRewind', 'BedrockSession'] })
  })
})
