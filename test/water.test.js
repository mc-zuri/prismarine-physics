/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LivingEntity.travel in water: 0.02F acceleration, 0.8F drag, then sinking: 0.02 up to 1.12, gravity / 16 from 1.13
// (not while sprinting). From 1.13 a sprinting player keeps 0.9F. From 1.21 the water_movement_efficiency attribute
// moves the drag towards 0.54600006F and the acceleration towards the walking speed. One tick walking east from rest,
// standing on the floor of water two blocks deep.
const FLOAT_MOVE = 0.015680000419616702 // moveFlying in float, before 1.14
const DOUBLE_MOVE = 0.01568000018835067
const VERSIONS = [
  ['1.8.8', FLOAT_MOVE, -0.02],
  ['1.12.2', FLOAT_MOVE, -0.02],
  ['1.13.2', FLOAT_MOVE, -0.005],
  ['1.14.4', DOUBLE_MOVE, -0.005],
  ['1.20.4', DOUBLE_MOVE, -0.005],
  ['1.21.11', DOUBLE_MOVE, -0.005],
  ['26.1', DOUBLE_MOVE, -0.005]
]

// `boots`: the item in the boots slot
function walkInWater (version, { sprint = false, efficiency, boots } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const name = pos.y < 60 ? 'stone' : pos.y < 62 ? 'water' : 'air'
      const block = new Block(mcData.blocksByName[name].id, 0, 0)
      block.position = pos
      return block
    }
  }
  const resource = mcData.attributesByName.waterMovementEfficiency?.resource
  const bot = {
    entity: {
      position: new Vec3(0.5, 60, 0.5),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      isInWater: true,
      isUnderWater: true,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      isSprinting: sprint,
      yaw: Math.PI + Math.PI / 2, // east
      pitch: 0,
      effects: {},
      attributes: efficiency === undefined ? undefined : { [resource]: { value: efficiency, modifiers: [] } }
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: Object.assign([], { 8: boots }) }
  }
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('water', () => {
  for (const [version, x, y] of VERSIONS) {
    it(`${version}: walks and sinks at vanilla's speed`, () => {
      const entity = walkInWater(version)
      expect(entity.velocity.x).toBe(x)
      expect(entity.velocity.y).toBe(y)
    })
  }

  for (const version of ['1.13.2', '1.20.4', '26.1']) {
    it(`${version}: keeps 0.9F of the motion and does not sink while sprinting`, () => {
      const entity = walkInWater(version, { sprint: true })
      const accelerated = version === '1.13.2' ? Math.fround(Math.fround(0.98) * Math.fround(0.02)) : Math.fround(0.98) * Math.fround(0.02)
      expect(entity.velocity.x).toBe(accelerated * Math.fround(0.9))
      expect(entity.velocity.y).toBe(0)
    })
  }

  // the moved distance (velocity before the drag) vanilla gives with the attribute at 1 and at 0.33
  for (const [efficiency, moved] of [[1, 0.0979999960660933], [0.33, 0.0454720003067255]]) {
    it(`1.21.11: water_movement_efficiency ${efficiency} speeds the player up as vanilla`, () => {
      expect(walkInWater('1.21.11', { efficiency }).position.x - 0.5).toBeCloseTo(moved, 15)
    })
  }

  // Depth Strider III on the ground: the drag becomes 0.54600006F and the acceleration the walking speed, each
  // f + (target - f) * 3F / 3F in float. Before 1.20.5 the boots carry it in their NBT, from 1.20.5 in their
  // enchantments component (as prismarine-item keeps it, in componentMap).
  it('reads Depth Strider from the boots, as NBT before 1.20.5 and as a component since', () => {
    const f = Math.fround
    const towards = (from, to) => f(from + f(f(f(to - from) * 3) / 3))
    const expected = (f(0.98) * towards(f(0.02), f(0.1))) * towards(f(0.8), f(0.54600006))
    const nbt = require('prismarine-nbt')
    const nbtBoots = { nbt: nbt.comp({ Enchantments: nbt.list(nbt.comp([{ id: nbt.string('minecraft:depth_strider'), lvl: nbt.short(3) }])) }) }
    expect(walkInWater('1.20.4', { boots: nbtBoots }).velocity.x).toBe(expected)
    const id = require('minecraft-data')('1.20.6').enchantmentsByName.depth_strider.id
    const componentBoots = { componentMap: new Map([['enchantments', { type: 'enchantments', data: { enchantments: [{ id, level: 3 }], showTooltip: true } }]]) }
    expect(walkInWater('1.20.6', { boots: componentBoots }).velocity.x).toBe(expected)
  })
})
