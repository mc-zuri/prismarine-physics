/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.16 lava pushes a player along its current like water (Entity.updateInWaterStateAndDoFluidPushing): at
// 0.0023333333333333335, or 0.007 in an ultrawarm dimension (the nether; from 26.1 the fast_lava attribute). Up to 1.15
// lava does not push. A player in a lava stream that runs east (levels 0 to 4 from x = 0) moving south at 0.05, so the
// minimum push of a player at rest does not apply, and east at 0.01, so the push is not lost as a negligible motion; the
// push is what the stream adds over a still pool of source lava.
function tickInLava (version, { stream, dimension }) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const lava = mcData.blocksByName.lava
  const lavaBlock = level => mcData.version['>=']('1.13') ? Block.fromStateId(lava.minStateId + level, 0) : new Block(lava.id, 0, level)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      let b
      if (p.y < 60) b = new Block(mcData.blocksByName.stone.id, 0, 0)
      else if (p.y === 60 && p.x >= 0 && p.x <= 4 && p.z >= -2 && p.z <= 2) b = lavaBlock(stream ? p.x : 0)
      else b = new Block(mcData.blocksByName.air.id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(2.5, 60, 0.5), velocity: new Vec3(0.01, 0, 0.05), onGround: true, isInWater: false, isInLava: true, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    game: { gameMode: 'survival', dimension },
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

const pushOf = (version, dimension) =>
  tickInLava(version, { stream: true, dimension }).velocity.x - tickInLava(version, { stream: false, dimension }).velocity.x

describe('lava currents', () => {
  for (const version of ['1.8.8', '1.12.2', '1.14.4', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    const pushes = !['1.8.8', '1.12.2', '1.14.4'].includes(version)
    it(`${version}: ${pushes ? 'a stream pushes the player, three times as hard in the nether' : 'lava does not push'}`, () => {
      const overworld = pushOf(version, 'overworld')
      const nether = pushOf(version, 'the_nether')
      if (pushes) {
        expect(overworld).toBeGreaterThan(0)
        expect(nether / overworld).toBeCloseTo(0.007 / 0.0023333333333333335, 6)
      } else {
        expect(overworld).toBe(0)
        expect(nether).toBe(0)
      }
    })
  }
})
