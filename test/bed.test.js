/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.12 a player landing on a bed bounces up at 0.66F of its fall unless sneaking (BedBlock.updateEntityAfterFallOn,
// bounceUp); a living entity keeps all of it. Up to 1.11 a bed stops the fall like any block.
function landOn (version, blockName, { sneak = false } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const b = new Block(mcData.blocksByName[y < 60 ? 'stone' : y === 60 ? blockName : 'air'].id, 0, 0)
      b.position = pos
      return b
    }
  }
  const top = Math.max(...new Block(mcData.blocksByName[blockName].id, 0, 0).shapes.map(shape => shape[4]))
  const bot = {
    entity: {
      position: new Vec3(0.5, 60 + top + 0.3, 0.5),
      velocity: new Vec3(0, -0.5, 0),
      onGround: false,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: Math.PI,
      pitch: 0,
      effects: {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

const bedOf = version => 'bed' in require('minecraft-data')(version).blocksByName ? 'bed' : 'white_bed'
const STOPPED = (0 - 0.08) * Math.fround(0.98)
const BOUNCED = (0.5 * Math.fround(0.66) - 0.08) * Math.fround(0.98)

describe('bed bounce', () => {
  for (const [version, bounces] of [['1.8.8', false], ['1.11.2', false], ['1.12.2', true], ['1.13.2', true], ['1.14.4', true], ['1.20.4', true], ['1.21.11', true], ['26.1', true]]) {
    it(`${version}: ${bounces ? 'bounces' : 'stops'} a player landing on a bed`, () => {
      const landed = landOn(version, bedOf(version))
      expect(landed.position.y).toBeCloseTo(60.5625, 9)
      expect(landed.velocity.y).toBe(bounces ? BOUNCED : STOPPED)
    })
  }

  for (const version of ['1.12.2', '1.21.11']) {
    it(`${version}: does not bounce a sneaking player`, () => {
      expect(landOn(version, bedOf(version), { sneak: true }).velocity.y).toBe(STOPPED)
    })
  }
})
