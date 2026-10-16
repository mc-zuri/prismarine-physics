/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

const HALF_WIDTH = Math.fround(0.3)

// Bamboo and pointed dripstone move their shapes by a hash of their x and z (OffsetType.XZ): Mth.getSeed(5, 0, 3) has
// 13 in its low four bits and 9 in bits 8 to 11, so at (5, 60, 3) the shapes move east by (13 / 15F - 0.5) * 0.5 =
// 0.18333333730697632, which pointed dripstone limits to 0.125 (getMaxHorizontalOffset), and south by
// (9 / 15F - 0.5) * 0.5. A player walking east into the block stops at the moved shape's west face: bamboo's
// collision box starts 6.5 / 16 in, a pointed dripstone tip merge 5 / 16 in.
function walkInto (version, name) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const type = p.y < 60 ? mcData.blocksByName.stone : p.x === 5 && p.y === 60 && p.z === 3 ? mcData.blocksByName[name] : mcData.blocksByName.air
      const block = Block.fromStateId(type.minStateId, 0)
      block.position = pos.clone()
      return block
    }
  }
  const bot = {
    entity: { position: new Vec3(4.9, 60, 3.55), velocity: new Vec3(0.5, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: true, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('blocks offset by their position', () => {
  for (const version of ['1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.21.1', '1.21.11', '26.1']) {
    it(`${version}: bamboo stops the player at its moved shape`, () => {
      const entity = walkInto(version, 'bamboo')
      expect(entity.position.x).toBeCloseTo(5 + 6.5 / 16 + 0.18333333730697632 - HALF_WIDTH, 9)
      expect(entity.isCollidedHorizontally).toBe(true)
    })
    if (version === '1.14.4' || version === '1.16.5') continue
    it(`${version}: pointed dripstone stops the player at its moved shape, moved at most 0.125`, () => {
      const entity = walkInto(version, 'pointed_dripstone')
      expect(entity.position.x).toBeCloseTo(5 + 5 / 16 + 0.125 - HALF_WIDTH, 9)
      expect(entity.isCollidedHorizontally).toBe(true)
    })
  }
})
