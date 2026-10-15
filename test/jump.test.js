/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')
const { firstTick } = require('./helpers/walk')

// LivingEntity.jumpFromGround: 0.42F times the block jump factor, plus 0.1F per Jump Boost level, summed in double up to
// 1.13 and on 1.17 to 1.19, in float otherwise; from 1.20.6 the jump_strength attribute replaces 0.42F.
const DOUBLE_SUM = 0.5199999883770943 // (double)0.42F + (double)0.1F, Jump Boost I
const FLOAT_SUM = 0.5199999809265137 // 0.42F + 0.1F in float
const VERSIONS = [
  ['1.8.8', DOUBLE_SUM],
  ['1.13.2', DOUBLE_SUM],
  ['1.14.4', FLOAT_SUM],
  ['1.16.5', FLOAT_SUM],
  ['1.17.1', DOUBLE_SUM],
  ['1.19.4', DOUBLE_SUM],
  ['1.20.4', FLOAT_SUM],
  ['1.20.6', FLOAT_SUM],
  ['1.21.11', FLOAT_SUM],
  ['26.1', FLOAT_SUM]
]

// One jump tick from the ground at y = 60 on `floor`, standing still; returns the position after it
function jump (version, { floor = 'stone', effects = {}, attributes, velocityY = 0 } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const block = new Block(pos.y < 60 ? mcData.blocksByName[floor].id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, 60, 0.5),
      velocity: new Vec3(0, velocityY, 0),
      onGround: true,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: Math.PI,
      pitch: 0,
      effects,
      attributes
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: true, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.position
}

describe('jumping', () => {
  for (const [version, boosted] of VERSIONS) {
    describe(version, () => {
      it('rises by the jump power', () => {
        expect(jump(version).y).toBe(60 + Math.fround(0.42))
      })

      it('adds 0.1F per Jump Boost level, in double or float as the version sums', () => {
        const jumpBoost = require('minecraft-data')(version).effectsByName.JumpBoost.id
        expect(jump(version, { effects: { [jumpBoost]: { amplifier: 0, duration: 100 } } }).y).toBe(60 + boosted)
      })

      it('turns a sprinting jump\'s boost by the sine table', () => {
        // facing east the table's cosine is exactly 0, so the boost adds nothing along z
        const vel = firstTick(version, { yawDegrees: -90, controls: { forward: true, sprint: true, jump: true } })
        expect(vel.z).toBe(0)
      })
    })
  }

  // honey (1.15+) halves the jump: Entity.getBlockJumpFactor 0.5F
  for (const version of ['1.15.2', '1.20.4', '26.1']) {
    it(`${version}: jumps half as high off honey`, () => {
      expect(jump(version, { floor: 'honey_block' }).y).toBe(60 + Math.fround(Math.fround(0.42) * Math.fround(0.5)))
    })
  }

  it('1.20.6+: jumps by the jump_strength attribute', () => {
    for (const version of ['1.21.1', '1.21.11', '26.1']) {
      const resource = require('minecraft-data')(version).attributesByName.jumpStrength.resource
      expect(jump(version, { attributes: { [resource]: { value: 0.5, modifiers: [] } } }).y).toBe(60.5)
    }
  })

  // from 1.21.2 a jump keeps a higher upward motion (Math.max), before it replaces it
  for (const [version, keeps] of [['1.21.1', false], ['1.21.4', true], ['26.1', true]]) {
    it(`${version}: ${keeps ? 'keeps' : 'replaces'} a higher upward motion`, () => {
      expect(jump(version, { velocityY: 0.75 }).y).toBe(keeps ? 60.75 : 60 + Math.fround(0.42))
    })
  }
})
