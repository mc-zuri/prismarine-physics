import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { ascendableAt, climbableAt, exitingScaffolding, scaffoldingUnder } from '../../../../lib/bedrock/world/climbables.ts'
import { worldOf } from '../helpers.ts'

const at = (x: number, y: number, z: number) => ({ x, y, z })
const box = (x: number, y: number, z: number): Box => new Box(x - 0.3, y, z - 0.3, x + 0.3, y + 1.8, z + 0.3)

describe('bedrock world/climbables', () => {
  it('finds scaffolding in a layer under the footprint', () => {
    const world = worldOf({ '1,0,0': 'scaffolding' }, null)
    assert.ok(scaffoldingUnder(world, box(0.9, 1, 0.5), 0))
    assert.ok(!scaffoldingUnder(world, box(0.5, 1, 0.5), 0))
  })

  it('climbs the ladder, vine or scaffolding at the feet', () => {
    assert.strictEqual(climbableAt(worldOf({ '0,0,0': 'ladder' }, null), at(0.5, 0, 0.5), box(0.5, 0, 0.5)), 'ladder')
    assert.strictEqual(climbableAt(worldOf({ '0,0,0': 'vine' }, null), at(0.5, 0, 0.5), box(0.5, 0, 0.5)), 'vine')
    assert.strictEqual(climbableAt(worldOf({ '0,0,0': 'scaffolding' }, null), at(0.5, 0, 0.5), box(0.5, 0, 0.5)), 'scaffolding')
    assert.strictEqual(climbableAt(worldOf({}, null), at(0.5, 0, 0.5), box(0.5, 0, 0.5)), null)
  })

  it('finds a block to go up by jumping: scaffolding on something that is not air or water, powder snow in leather boots', () => {
    assert.ok(ascendableAt(worldOf({ '1,1,0': 'scaffolding', '1,0,0': 'stone' }, null), box(0.9, 1, 0.5)))
    assert.ok(!ascendableAt(worldOf({ '1,1,0': 'scaffolding' }, null), box(0.9, 1, 0.5)), 'nothing under it')
    assert.ok(!ascendableAt(worldOf({ '0,1,0': 'scaffolding', '0,0,0': 'water' }, null), box(0.5, 1, 0.5)), 'water under it')
    assert.ok(ascendableAt(worldOf({ '0,1,0': 'powder_snow' }, null), box(0.5, 1, 0.5), true))
    assert.ok(!ascendableAt(worldOf({ '0,1,0': 'powder_snow' }, null), box(0.5, 1, 0.5)), 'without leather boots')
  })

  it('climbs scaffolding anywhere under the box in the feet layer', () => {
    const world = worldOf({ '1,0,0': 'scaffolding' }, null)
    assert.strictEqual(climbableAt(world, at(0.9, 0, 0.5), box(0.9, 0, 0.5)), 'scaffolding')
  })

  it('leaves scaffolding sideways only into a cell that is not scaffolding', () => {
    const world = worldOf({ '0,0,0': 'scaffolding', '0,0,1': 'scaffolding' }, null)
    const pos = at(0.5, 0.2, 0.9)
    assert.ok(exitingScaffolding(world, pos, at(0.6, 0, 0), false), 'into air at x = 1')
    assert.ok(!exitingScaffolding(world, pos, at(0, 0, 0.2), false), 'into more scaffolding')
    assert.ok(!exitingScaffolding(world, pos, at(0, 0, 0.05), false), 'staying in the cell')
    assert.ok(!exitingScaffolding(world, pos, at(0.6, 0, 0), true), 'against a ceiling')
    assert.ok(!exitingScaffolding(world, at(3.5, 0.2, 0.5), at(0.6, 0, 0), false), 'not in scaffolding')
  })
})
