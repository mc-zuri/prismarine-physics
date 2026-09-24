#!/usr/bin/env node
// Bakes the Java engine's per-tick output for every scenario in test/tools/java-scenarios.js into
// test/fixtures/java/<version>/<name>.json. test/java-regression.test.js replays these and requires exact equality,
// so only re-run this when Java physics is *intentionally* changed, and review the diff.
//
// Usage: node scripts/generate-java-fixtures.js [scenarioName ...]

const fs = require('fs')
const path = require('path')
const { Physics } = require('../index')
const { SCENARIOS, versionsOf, runScenario } = require('../test/tools/java-scenarios')

const only = new Set(process.argv.slice(2))
const outRoot = path.join(__dirname, '..', 'test', 'fixtures', 'java')

let written = 0
for (const scenario of SCENARIOS) {
  if (only.size && !only.has(scenario.name)) continue
  for (const version of versionsOf(scenario)) {
    const ticks = runScenario(Physics, scenario, version)
    const dir = path.join(outRoot, version)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${scenario.name}.json`)
    const body = { version, name: scenario.name, ticks }
    // One tick per line keeps diffs reviewable.
    const json = '{\n  "version": ' + JSON.stringify(version) + ',\n  "name": ' + JSON.stringify(scenario.name) +
      ',\n  "ticks": [\n' + ticks.map(t => '    ' + JSON.stringify(t)).join(',\n') + '\n  ]\n}\n'
    fs.writeFileSync(file, json)
    written++
    const last = body.ticks[body.ticks.length - 1]
    console.log(`${version} ${scenario.name}: ${ticks.length} ticks, final pos ${last.pos.map(v => v.toFixed(4)).join(', ')}`)
  }
}
console.log(`wrote ${written} fixture(s) under ${outRoot}`)
