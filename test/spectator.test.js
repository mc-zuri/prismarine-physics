/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A spectator moves through blocks (Player.tick: noPhysics, and never on the ground; Entity.move: noPhysics moves the
// position, or up to 1.16 the box, by the whole move). A flying player at x = 1.5 moving 0.5 east into a wall at x = 2
// (two high, on a floor at y = 60) stops against it; a spectator goes on into it.
function flyIntoWall (version, gameMode) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const solid = p.y < 60 || (p.x === 2 && p.y < 62)
      const b = new Block(mcData.blocksByName[solid ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(1.5, 60, 0.5), velocity: new Vec3(0.5, 0, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: true, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {}, flying: true },
    game: { gameMode },
    abilities: { mayFly: true },
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

describe('spectators', () => {
  for (const version of ['1.8.8', '1.12.2', '1.16.5', '1.20.4', '1.21.8', '1.21.9', '1.21.11', '26.1']) {
    // from 1.21.9 the move clears the collision flags (here set by the tick before); before they stay
    const clears = ['1.21.9', '1.21.11', '26.1'].includes(version)
    it(`${version}: a creative flyer stops at the wall`, () => {
      const entity = flyIntoWall(version, 'creative')
      expect(entity.position.x).toBeCloseTo(1.7, 6)
      expect(entity.isCollidedHorizontally).toBe(true)
    })
    it(`${version}: a spectator moves into the wall, off the ground`, () => {
      const entity = flyIntoWall(version, 'spectator')
      expect(entity.position.x).toBeCloseTo(2, 6)
      expect(entity.position.y).toBe(60)
      expect(entity.isCollidedHorizontally).toBe(!clears)
      expect(entity.onGround).toBe(false)
      expect(entity.flying).toBe(true)
    })
  }
})
