/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A sleeping player (bot.isSleeping, the sleeping pose) is 0.2 by 0.2 on every version and keeps that pose through its
// tick (Player.updatePlayerPose wants the sleeping pose first from 1.14). Beside a ledge (stone from x = 1 down) its box
// misses the ledge and it falls, where a standing player's 0.6 wide box lands on it.
describe('a sleeping player', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: is 0.2 wide and stays asleep`, () => {
      const mcData = require('minecraft-data')(version)
      const Block = require('prismarine-block')(version)
      const world = {
        getBlock: (pos) => {
          const block = new Block(pos.y < 101 && pos.x >= 1 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
          block.position = pos.floored()
          return block
        }
      }
      const tick = (sleeping) => {
        const entity = { position: new Vec3(0.85, 101, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: 0, pitch: 0, effects: {}, pose: sleeping ? 'sleeping' : 'standing' }
        const bot = { entity, isSleeping: sleeping, jumpTicks: 0, jumpQueued: false, fireworkRocketDuration: 0, version, inventory: { slots: [] } }
        const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
        Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
        return entity
      }
      const asleep = tick(true)
      expect(asleep.position.y).toBeLessThan(101)
      expect(asleep.pose).toBe('sleeping')
      const awake = tick(false)
      expect(awake.position.y).toBe(101)
      expect(awake.pose).toBe('standing')
    })
  }
})
