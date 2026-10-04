/* eslint-env mocha */
const assert = require('node:assert/strict')

// lib/math keeps module state (the sine tables), so each test loads a fresh copy.
function freshMath () {
  delete require.cache[require.resolve('../lib/math')]
  return require('../lib/math')
}

describe('math', () => {
  afterEach(() => { delete require.cache[require.resolve('../lib/math')] })

  it('defaults to JavaScript sin and cos', () => {
    const math = freshMath()
    assert.equal(math.trig.sin, Math.sin)
    assert.equal(math.trig.cos, Math.cos)
  })

  it('setTrig supplies the values both sine tables are built from', () => {
    const math = freshMath()
    const inputs = []
    math.setTrig({ sin: x => { inputs.push(x); return Math.sin(x) }, cos: Math.cos })
    const legacy = math.mthSin(1)
    const modern = math.mthSin(1, true)
    // 65536 entries per table, each from the installed sin
    assert.equal(inputs.length, 2 * 65536)
    assert.equal(legacy, Math.fround(Math.sin(Math.trunc(Math.fround(Math.fround(1) * Math.fround(10430.378))) * Math.PI * 2 / 65536)))
    assert.equal(modern, Math.fround(Math.sin(Math.trunc(10430.378350470453) / 10430.378350470453)))
  })

  it('setTrig is refused once a table exists', () => {
    const math = freshMath()
    math.mthCos(0)
    assert.throws(() => math.setTrig({ sin: Math.sin, cos: Math.cos }), /before the sine tables are built/)
  })

  it('trig reads the installed functions at call time', () => {
    const math = freshMath()
    const cos = () => 0.5
    math.setTrig({ sin: Math.sin, cos })
    assert.equal(math.trig.cos(1), 0.5)
  })
})
