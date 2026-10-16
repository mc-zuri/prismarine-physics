/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LocalPlayer.aiStep, after the move (super.aiStep): a flying player on the ground stops flying, unless a spectator. One
// tick of a flyer 0.1 above the floor (the block below y = 60), coming down at 0.2.
function landFlying (version, gameMode) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const b = new Block(mcData.blocksByName[pos.y < 60 ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 60.1, 0.5), velocity: new Vec3(0, -0.2, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, flying: true },
    game: { gameMode },
    abilities: { mayFly: true },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  const state = new PlayerState(bot, controls)
  Physics(mcData, world).simulatePlayer(state, world).apply(bot)
  return { entity: bot.entity, state }
}

describe('landing ends creative flight', () => {
  for (const version of ['1.8.8', '1.12.2', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: a creative flyer stops flying on the ground`, () => {
      const { entity, state } = landFlying(version, 'creative')
      expect(entity.onGround).toBe(true)
      expect(entity.flying).toBe(false)
      expect(state.flightEndedOnLanding).toBe(true)
    })
    it(`${version}: a spectator keeps flying`, () => {
      const { entity, state } = landFlying(version, 'spectator')
      expect(entity.flying).toBe(true)
      expect(state.flightEndedOnLanding).toBe(false)
    })
  }
})
