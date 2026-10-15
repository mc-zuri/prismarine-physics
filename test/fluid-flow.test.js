/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A fluid flows towards the drop to each side; where a side has no fluid and does not block movement, towards the fluid
// under it (BlockLiquid.getFlowVector up to 1.12, FlowingFluid.getFlow from 1.13). A water source walled in by stone
// except to the east, where the water is a block lower: it flows east, and pushes a player in it east.
// `y`: the player's height in the source (at 60); `level`: the source's level (0: a source)
function tickInWater (version, { y = 60.2 } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      let name = 'stone'
      if (p.y === 60 && p.x === 0 && p.z === 0) name = 'water'
      else if (p.y === 60 && p.x === 1 && p.z === 0) name = 'air'
      else if (p.y === 59 && p.x === 1 && p.z === 0) name = 'water'
      else if (p.y > 60) name = 'air'
      const b = new Block(mcData.blocksByName[name].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, y, 0.5), velocity: new Vec3(0, 0, 0), onGround: false, isInWater: true, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
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

describe('fluid flow', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.16.5', '1.21.11', '26.1']) {
    it(`${version}: water flows towards the drop beside it`, () => {
      expect(tickInWater(version).velocity.x).toBeGreaterThan(0)
    })
  }
})

// From 1.13 (Entity.updateFluidHeightAndDoFluidPushing) the push of a player is the flows' average times 0.014, each
// flow scaled by the fluid's height over the bottom of the box while that is under 0.4; up to 1.12 the flows' sum,
// normalized. Higher in the water (0.29 deep) the push is weaker.
describe('fluid push', () => {
  for (const version of ['1.13.2', '1.16.5', '1.21.11']) {
    it(`${version}: shallow water pushes less`, () => {
      expect(tickInWater(version, { y: 60.6 }).velocity.x).toBeLessThan(tickInWater(version, { y: 60.2 }).velocity.x)
    })
  }
})
