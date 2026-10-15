/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// Soul sand and honey slow a player walking on them. Up to 1.14 soul sand multiplies the motion by 0.4 when the box
// touches it. From 1.15 Entity.move ends by multiplying it by the block speed factor (getBlockSpeedFactor): the feet
// block's, 0.4F for soul sand and honey. On 1.16 to 1.20 Soul Speed boots cancel it on soul sand; from 1.21 the
// movement_efficiency attribute lerps it to 1. One tick walking east from rest, standing on the block.
const WALK = 0.053508008053839436 // on a block that does not slow
const LEGACY = 0.021403200299072014 // 0.4 (double), up to 1.13 (the float walking of moveFlying)
const LEGACY_114 = WALK * 0.4 // 1.14: 0.4 (double) after the double walking of getInputVector
const FACTOR = 0.021403203540468353 // (double)0.4F, from 1.15

// `on`: a block on top of `block` to stand on; `y`: start in the air at this height instead
function walkOn (version, block, { attributes, soulSpeed = 0, on = 'air', y } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const name = pos.y < 59 ? 'stone' : pos.y === 59 ? block : pos.y === 60 ? on : 'air'
      const b = new Block(mcData.blocksByName[name].id, 0, 0)
      b.position = pos
      return b
    }
  }
  const topOf = name => Math.max(...new Block(mcData.blocksByName[name].id, 0, 0).shapes.map(shape => shape[4]))
  const standAt = y ?? (on === 'air' ? 59 + topOf(block) : 60 + topOf(on))
  const nbt = require('prismarine-nbt')
  const boots = soulSpeed > 0
    ? { nbt: nbt.comp({ Enchantments: nbt.list(nbt.comp([{ id: nbt.string('minecraft:soul_speed'), lvl: nbt.short(soulSpeed) }])) }) }
    : undefined
  const bot = {
    entity: {
      position: new Vec3(0.5, standAt, 0.5),
      velocity: new Vec3(0, 0, 0),
      onGround: y === undefined,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: Math.PI + Math.PI / 2, // east
      pitch: 0,
      effects: {},
      attributes
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: Object.assign([], { 8: boots }) }
  }
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.velocity.x
}

describe('block speed factor', () => {
  for (const [version, x] of [['1.8.8', LEGACY], ['1.12.2', LEGACY], ['1.14.4', LEGACY_114], ['1.15.2', FACTOR], ['1.20.4', FACTOR], ['1.21.1', FACTOR], ['1.21.11', FACTOR], ['26.1', FACTOR]]) {
    it(`${version}: slows a player walking on soul sand`, () => {
      expect(walkOn(version, 'soul_sand')).toBe(x)
    })
  }

  for (const version of ['1.15.2', '1.20.4', '1.21.11']) {
    it(`${version}: slows a player walking on honey`, () => {
      expect(walkOn(version, 'honey_block')).toBe(FACTOR)
    })
  }

  // a block that does not slow takes the factor of the block under it (Entity.getBlockPosBelowThatAffectsMyMovement)
  for (const version of ['1.15.2', '1.19.4', '1.20.4', '1.21.11']) {
    it(`${version}: slows a player on a carpet over soul sand`, () => {
      expect(walkOn(version, 'soul_sand', { on: 'white_carpet' })).toBe(FACTOR)
    })
  }

  // that block is 0.5000001 under the box up to 1.19, (double)0.500001F under the position from 1.20 (Entity.getOnPos)
  it('from 1.20 the block below is found 0.500001F down', () => {
    const y = 60.5000005
    expect(walkOn('1.19.4', 'soul_sand', { y })).toBe(walkOn('1.19.4', 'stone', { y }))
    expect(walkOn('1.20.4', 'soul_sand', { y })).toBeLessThan(walkOn('1.20.4', 'stone', { y }))
  })

  it('1.16 to 1.20: Soul Speed cancels the factor on soul sand', () => {
    expect(walkOn('1.16.5', 'soul_sand', { soulSpeed: 3 })).toBe(WALK)
    expect(walkOn('1.20.4', 'soul_sand', { soulSpeed: 3 })).toBe(WALK)
  })

  // what vanilla moves with movement_efficiency 1 on soul sand and 0.5 on honey
  for (const [block, efficiency, x] of [['soul_sand', 1, WALK], ['honey_block', 0.5, 0.037455608189148254]]) {
    it(`1.21: movement_efficiency ${efficiency} lerps the factor on ${block} towards 1`, () => {
      for (const version of ['1.21.1', '1.21.11']) {
        const resource = require('minecraft-data')(version).attributesByName.movementEfficiency.resource
        expect(walkOn(version, block, { attributes: { [resource]: { value: efficiency, modifiers: [] } } })).toBe(x)
      }
    })
  }
})
