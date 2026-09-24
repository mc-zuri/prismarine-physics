// Runs the Bedrock engine's TypeScript sources as they are, with no build step: a module load hook hands this
// package's .ts / .mts files (not .d.ts) to Node's own type stripper and loads the result as an ES module. Every
// other file, a host application's TypeScript included, is left to Node and to whatever loader the application uses.
// Node strips types by itself only outside node_modules, and this package is used from there, hence the hook. 'strip'
// mode replaces the types with whitespace, so every line and column stays where it is in the source: stack traces
// and coverage point at the .ts file without a source map. That mode takes erasable syntax only (no enum, namespace
// or parameter property; tsconfig.json's erasableSyntaxOnly holds the sources to it). The Java engine never loads
// this file, so only Bedrock needs a Node.js with the hooks.
const fs = require('fs')
const path = require('path')
const { fileURLToPath, pathToFileURL } = require('url')
const { registerHooks, stripTypeScriptTypes } = require('module')

const TS = /^file:.*(?<!\.d)\.m?ts$/
// This package's directory, as a URL prefix.
const ROOT = pathToFileURL(path.join(__dirname, '..') + path.sep).href
// Whether the hook loads the module at `url`: a TypeScript file of this package (not of one it depends on).
function ours (url) { return TS.test(url) && url.startsWith(ROOT) && !url.slice(ROOT.length).startsWith('node_modules/') }
const REGISTERED = Symbol.for('prismarine-physics.ts-hooks')

// stripTypeScriptTypes warns once that it is experimental; the warning is about this package's loading, not
// anything its user did, so it is not passed on.
function strip (source, url) {
  const emitWarning = process.emitWarning
  process.emitWarning = function (warning, ...rest) {
    if (!String(warning && warning.message ? warning.message : warning).includes('stripTypeScriptTypes')) return emitWarning.call(process, warning, ...rest)
  }
  try {
    return stripTypeScriptTypes(source, { mode: 'strip', sourceUrl: url })
  } finally {
    process.emitWarning = emitWarning
  }
}

if (typeof registerHooks !== 'function' || typeof stripTypeScriptTypes !== 'function') {
  throw new Error(`prismarine-physics: the Bedrock engine needs Node.js 22.18 or later (module.registerHooks and stripTypeScriptTypes); this is ${process.version}`)
}

if (!globalThis[REGISTERED]) {
  globalThis[REGISTERED] = true
  registerHooks({
    load (url, context, nextLoad) {
      if (!ours(url)) return nextLoad(url, context)
      return { format: 'module', source: strip(fs.readFileSync(fileURLToPath(url), 'utf8'), url), shortCircuit: true }
    }
  })
}

module.exports = { ours }
