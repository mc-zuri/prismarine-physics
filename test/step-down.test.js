/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A jump into a two-high gap: the floor is the block below y = 60 and from x = 2 a ceiling at y = 62. The player has just
// jumped (0.42 up, on the ground) at x = 1.2 moving east at 0.6, so the plain move goes up 0.42 and then meets the
// ceiling's side, and the step-up (Entity.collide) goes up 0.2 under the ceiling and on across.
// Up to 1.13 the step then goes down by what it went up, to the floor. From 1.14 to 1.20.6 it goes down by that less the
// move's own 0.42 (-vec.y + movement.y), so the player stays 0.2 up, and the vertical collision compares the whole move.
// From 1.21 the step-up tries the heights of the boxes around (collectCandidateStepUpHeights), here the floor.
function jumpUnderCeiling (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const solid = p.y < 60 || (p.x >= 2 && p.y === 62)
      const b = new Block(mcData.blocksByName[solid ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(1.2, 60, 0.5), velocity: new Vec3(0.6, 0.42, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
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

describe('stepping down after a step-up', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.20.6', '1.21.1', '1.21.11', '26.1']) {
    const keepsMove = version !== '1.8.8' && !version.startsWith('1.12') && !version.startsWith('1.13') && !version.startsWith('1.21') && version !== '26.1'
    it(`${version}: the step ends ${keepsMove ? '0.2 up, under the ceiling' : 'on the floor'}`, () => {
      const entity = jumpUnderCeiling(version)
      expect(entity.position.x).toBeCloseTo(1.8, 6)
      expect(entity.position.y).toBeCloseTo(keepsMove ? 60.2 : 60, 6)
      expect(entity.isCollidedVertically).toBe(true)
      expect(entity.onGround).toBe(false)
    })
  }
})

// A fast fall onto a soul sand floor (0.875 high, the blocks at y = 59 for x < 2) while walking into the stone ledge
// beside it (y = 59 from x = 2), from 2.3 above: the plain move lands on the soul sand and meets the ledge's side, and
// the step-up wins. Up to 1.13 the step goes down only by what it went up, so the player hangs where it was. From 1.14
// to 1.20.6 it goes down by that and the 2.5 fall, past the step's own boxes, onto the ledge (the step-down collides on
// its own box); from 1.21 the step starts from the soul sand and goes up onto the ledge.
function fallOntoLedge (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const name = p.y < 59 || (p.y === 59 && p.x >= 2) ? 'stone' : p.y === 59 ? 'soul_sand' : 'air'
      const b = new Block(mcData.blocksByName[name].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(1.6, 62.3, 0.5), velocity: new Vec3(0.3, -2.5, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
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

describe('stepping down after a fall', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.20.6', '1.21.1', '1.21.11', '26.1']) {
    const hangs = ['1.8.8', '1.12.2', '1.13.2'].includes(version)
    it(`${version}: the step ends ${hangs ? 'where the fall started' : 'on the ledge'}`, () => {
      const entity = fallOntoLedge(version)
      expect(entity.position.x).toBeCloseTo(1.9, 6)
      expect(entity.position.y).toBeCloseTo(hangs ? 62.3 : 60, 6)
      expect(entity.onGround).toBe(true)
    })
  }
})
