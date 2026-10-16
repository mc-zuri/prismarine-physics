/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// TridentItem.releaseUsing (1.13+): letting go of a riptide trident pushes the player along its look by
// 3 * (1 + level) / 4, and on the ground first moves it 1.1999999F up. A player faces east (level look) on a stone floor
// (below y = 60) or high in the air; `riptide` is the level of the trident let go of before the tick.
function release (version, riptide, onGround) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const block = new Block(pos.y < 60 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos.floored()
      return block
    }
  }
  const bot = {
    riptide,
    entity: { position: new Vec3(0.5, onGround ? 60 : 80, 0.5), velocity: new Vec3(0, onGround ? -0.0784000015258789 : 0, 0), onGround, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: onGround, elytraFlying: false, yaw: -Math.PI / 2, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot
}

describe('a riptide trident let go of', () => {
  for (const version of ['1.13.2', '1.14.4', '1.16.5', '1.20.4', '1.21.1', '1.21.11', '26.1']) {
    it(`${version}: pushes the player along its look, harder with each level`, () => {
      const one = release(version, 1, false)
      const three = release(version, 3, false)
      expect(one.entity.velocity.x).toBeGreaterThan(1)
      expect(three.entity.velocity.x / one.entity.velocity.x).toBeCloseTo(2, 6)
      expect(Math.abs(one.entity.velocity.z)).toBeLessThan(1e-6)
      expect(one.riptide).toBe(0)
    })
    it(`${version}: lifts a player on the ground first`, () => {
      expect(release(version, 1, true).entity.position.y).toBeGreaterThan(61.1)
      expect(release(version, 0, true).entity.position.y).toBe(60)
    })
  }
})
