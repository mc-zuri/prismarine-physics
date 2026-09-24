/* eslint-env mocha */
// docs/bedrock/reference.md is generated from the comments in lib/bedrock; it must match them (npm run docs).
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { build } = require('../../scripts/bedrock-reference')

describe('bedrock reference documentation', () => {
  it('is up to date with the sources', () => {
    const file = path.join(__dirname, '..', '..', 'docs', 'bedrock', 'reference.md')
    assert.strictEqual(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), build(), 'run npm run docs')
  })
})
