/* eslint-env mocha */

const expect = require('expect')
const { firstTick } = require('./helpers/walk')

// Using an item (drawing a bow, eating) scales the input by 0.2F: LocalPlayer.aiStep up to 1.21.4, modifyInput since.
// Walking south on stone from rest while using an item, velocity z after one tick, before 1.14 in float (moveFlying),
// since in double.
const VERSIONS = [
  ['1.8.8', 0.01070160035293688],
  ['1.12.2', 0.01070160035293688],
  ['1.13.2', 0.01070160035293688],
  ['1.14.4', 0.01070160193620929],
  ['1.20.4', 0.01070160193620929],
  ['1.21.4', 0.01070160193620929],
  ['1.21.5', 0.01070160193620929],
  ['1.21.11', 0.01070160193620929],
  ['26.1', 0.01070160193620929]
]

describe('item use slowdown', () => {
  for (const [version, z] of VERSIONS) {
    it(`${version}: walks at a fifth of the speed while using an item`, () => {
      expect(firstTick(version, { usingItem: true }).z).toBe(z)
    })
  }
})

// The order of the three scalings shows with a sneaking_speed other than 0.3: 0.2F * 0.13F * 0.98F on 1.21.4 (use,
// sneak, 0.98F) and 0.98F * 0.2F * 0.13F from 1.21.5 (LocalPlayer.modifyInput, then the square-movement step) round
// differently.
describe('item use and sneaking together', () => {
  const f = Math.fround
  for (const [version, zza] of [['1.21.4', 0.0254799984395504], ['1.21.5', 0.02548000030219555], ['1.21.11', 0.02548000030219555]]) {
    it(`${version}: scales in that version's order`, () => {
      const resource = require('minecraft-data')(version).attributesByName.sneakingSpeed.resource
      const vel = firstTick(version, {
        usingItem: true,
        controls: { forward: true, sneak: true },
        state: { shiftKeyDown: true, attributes: { [resource]: { value: 0.13, modifiers: [] } } }
      })
      expect(vel.z).toBe(zza * f(0.1) * f(f(0.6) * f(0.91)))
    })
  }
})
