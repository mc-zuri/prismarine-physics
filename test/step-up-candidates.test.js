/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// Walking into a lantern: its base is 7/16 high and its top, narrower, 9/16. The floor is the block below y = 60, the
// lantern stands at x = 2 and the player, on the floor at x = 1.9, moves 0.3 east, which meets the base.
// Up to 1.20.6 the step goes up the whole step height, across over the lantern, and down on to its top. From 1.21
// (Entity.collide, collectCandidateStepUpHeights) it tries the heights of the boxes around from the lowest, and takes the
// first that goes further than the plain move: the base's top, from where the player meets the lantern's top.
function walkIntoLantern (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const name = p.y < 60 ? 'stone' : p.x === 2 && p.y === 60 && p.z === 0 ? 'lantern' : 'air'
      const b = Block.fromStateId(mcData.blocksByName[name].defaultState, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(1.9, 60, 0.5), velocity: new Vec3(0.3, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
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

describe('the heights a step-up tries', () => {
  for (const version of ['1.14.4', '1.17.1', '1.20.4', '1.20.6', '1.21.1', '1.21.4', '1.21.11', '26.1']) {
    const candidates = !version.startsWith('1.14') && !version.startsWith('1.17') && !version.startsWith('1.20')
    it(`${version}: steps ${candidates ? 'on to the base, against the top' : 'over the lantern on to its top'}`, () => {
      const entity = walkIntoLantern(version)
      expect(entity.position.x).toBeCloseTo(candidates ? 2.075 : 2.2, 6)
      expect(entity.position.y).toBeCloseTo(candidates ? 60.4375 : 60.5625, 9)
      expect(entity.isCollidedHorizontally).toBe(candidates)
    })
  }
})
