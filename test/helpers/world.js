// Small worlds for the engine: blocks by "x,y,z", a floor of one block below y = floorY, air elsewhere.
const prismarineBlock = require('prismarine-block')
const { Vec3 } = require('vec3')

// names the blocks had before the flattening, or that minecraft-data spells differently across versions
const ALIASES = { cobweb: ['web'], red_bed: ['bed'], slime_block: ['slime'], oak_trapdoor: ['trapdoor'], soul_sand: ['soul_sand'], enchanting_table: ['enchanting_table', 'enchantment_table'] }

function blockId (data, name) {
  for (const candidate of [name, ...(ALIASES[name] ?? [])]) {
    const block = data.blocksByName[candidate]
    if (block) return block
  }
  return null
}

/**
 * world(data, { 'x,y,z': name | { name, properties } }, { floorY = 64, floor = 'stone' })
 * Properties pick a block state on flattened versions (1.13+); before, `metadata` does. A block the version lacks
 * becomes `otherwise` (air unless given).
 */
function world (data, blocks = {}, { floorY = 64, floor = 'stone', fill = null } = {}) {
  const Block = prismarineBlock(data)
  // block states by properties since the flattening (1.13); metadata before
  const flattened = data.version['>=']('1.13')
  const cache = new Map()
  function make (spec, pos) {
    let { name, properties, metadata, otherwise = 'air' } = typeof spec === 'string' ? { name: spec } : spec
    // (a block the version does not have yet: what stands there instead, in its default state)
    let info = blockId(data, name)
    if (!info) {
      info = blockId(data, otherwise)
      properties = metadata = undefined
    }
    const key = JSON.stringify([info.name, properties, metadata])
    let block = cache.get(key)
    if (!block) {
      if (properties && flattened) block = Block.fromProperties(info.name, properties, 0)
      else if (info.defaultState !== undefined && metadata === undefined) block = Block.fromStateId(info.defaultState, 0)
      else block = new Block(info.id, 0, metadata ?? 0)
      cache.set(key, block)
    }
    const placed = Object.create(block)
    placed.position = pos
    return placed
  }
  return {
    getBlock (pos) {
      const p = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))
      const spec = blocks[`${p.x},${p.y},${p.z}`] ?? (fill ? fill(p) : null) ?? (p.y < floorY ? floor : 'air')
      return make(spec, p)
    }
  }
}

module.exports = { world, blockId }
