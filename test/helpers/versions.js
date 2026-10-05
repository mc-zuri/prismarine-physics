// The Java versions mineflayer supports (its lib/version.ts testedVersions), and mocha helpers that run a test on
// every one of them. A version the installed minecraft-data lacks is pending, or failing with
// PHYSICS_REQUIRE_ALL_VERSIONS=1 (the workspace links a local minecraft-data that has them all).
/* eslint-env mocha */
const assert = require('node:assert/strict')
const { isDeepStrictEqual } = require('node:util')
const minecraftData = require('minecraft-data')

const SUPPORTED = ['1.8.8', '1.9.4', '1.10.2', '1.11.2', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5', '1.17.1',
  '1.18.2', '1.19', '1.19.2', '1.19.3', '1.19.4', '1.20.1', '1.20.2', '1.20.4', '1.20.6', '1.21.1', '1.21.3', '1.21.4',
  '1.21.5', '1.21.6', '1.21.8', '1.21.9', '1.21.11', '26.1', '26.3']

function dataFor (version) {
  try { return minecraftData(version) || null } catch { return null }
}

const missing = SUPPORTED.filter(version => !dataFor(version))

function pendingOrFail (title) {
  if (process.env.PHYSICS_REQUIRE_ALL_VERSIONS) it(title, () => { throw new Error(`no game data for ${missing.join(', ')}`) })
  else it(title)
}

/** one test per supported version: fn(data, version) */
function eachVersion (title, fn, versions = SUPPORTED) {
  for (const version of versions) {
    const data = dataFor(version)
    if (!data) pendingOrFail(`${version}: ${title}`)
    else it(`${version}: ${title}`, () => fn(data, version))
  }
}

/** the supported versions from `from` (inclusive) to `to` (exclusive), by list order */
function range (from, to) {
  const start = from ? SUPPORTED.indexOf(from) : 0
  const end = to ? SUPPORTED.indexOf(to) : SUPPORTED.length
  if (start < 0 || end < 0) throw new Error(`not a supported version: ${start < 0 ? from : to}`)
  return SUPPORTED.slice(start, end)
}

/**
 * One test that measures `scenario(data, version)` on every supported version and asserts the results change exactly
 * at `boundaries` (supported versions, ascending): equal within each stretch, different across each boundary. The
 * boundaries are written out in the test, never read from the engine's features, so a moved boundary fails.
 * `values` optionally pins the exact result of a version in each stretch: { '1.13.2': ..., '1.14.4': ... }.
 * `from`: the first supported version the scenario exists in (a mob or block added later); the test covers those on.
 */
function boundaryTest (title, scenario, { boundaries, values = {}, from }) {
  const versions = range(from)
  const label = from ? `${title} (supported versions from ${from})` : `${title} (all supported versions)`
  if (versions.some(version => missing.includes(version))) return pendingOrFail(label)
  it(label, () => {
    const results = versions.map(version => [version, scenario(dataFor(version), version)])
    const at = boundaries.map(version => {
      const index = versions.indexOf(version)
      if (index <= 0) throw new Error(`boundary ${version} is not a covered version after the first`)
      return index
    })
    const stretches = [0, ...at, versions.length].slice(1).map((end, i, ends) => results.slice(i ? ends[i - 1] : 0, end))
    for (const stretch of stretches) {
      for (const [version, value] of stretch) {
        assert.deepEqual(value, stretch[0][1], `${version} differs from ${stretch[0][0]} within ${stretch[0][0]} – ${stretch.at(-1)[0]}`)
      }
    }
    for (let i = 1; i < stretches.length; i++) {
      assert.notDeepEqual(stretches[i][0][1], stretches[i - 1][0][1], `no change at ${stretches[i][0][0]}`)
    }
    for (const [version, value] of Object.entries(values)) {
      assert.deepEqual(results.find(([v]) => v === version)[1], value, `${version}`)
    }
  })
}

/** the results of `scenario` on every supported version, grouped into stretches of equal results (for exploring) */
function stretches (scenario, from) {
  const out = []
  for (const version of range(from)) {
    const value = scenario(dataFor(version), version)
    const last = out.at(-1)
    if (last && isDeepStrictEqual(last.value, value)) last.to = version
    else out.push({ from: version, to: version, value })
  }
  return out
}

module.exports = { SUPPORTED, dataFor, eachVersion, range, boundaryTest, stretches }
