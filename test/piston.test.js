/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A piston west of a player standing still (its head's cell at x = 0) extends east: its head moves 0.5 a tick, and
// pushes the player out of its way by as far as it moves into the player's box plus 0.01 (PistonMovingBlockEntity
// .moveCollidedEntities), a move that leaves it off the ground, after the player's tick (physics.tickPistons). The
// positions are the vanilla client's.
describe('a piston head extending into the player', () => {
  for (const version of ['1.12.2', '1.14.4', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: pushes it out of the way`, () => {
      const mcData = require('minecraft-data')(version)
      const Block = require('prismarine-block')(version)
      const world = {
        getBlock: (pos) => {
          const block = new Block(pos.y < 101 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
          block.position = pos.floored()
          return block
        }
      }
      const head = Block.fromProperties('piston_head', { facing: 'east', short: false, type: 'normal' }, 0)
      const bot = {
        entity: { position: new Vec3(0.5, 101, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: true, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
        movingPistons: [{ position: new Vec3(0, 101, 0), direction: 'east', extending: true, source: true, progress: 0, boxes: head.shapes }],
        jumpTicks: 0,
        jumpQueued: false,
        fireworkRocketDuration: 0,
        version,
        inventory: { slots: [] }
      }
      const physics = Physics(mcData, world)
      const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
      physics.tickPistons(physics.simulatePlayer(new PlayerState(bot, controls), world), world).apply(bot)
      expect(bot.entity.position.x).toBe(0.810000011920929)
      expect(bot.entity.onGround).toBe(false)
      expect(bot.movingPistons[0].progress).toBe(0.5)
      physics.tickPistons(physics.simulatePlayer(new PlayerState(bot, controls), world), world).apply(bot)
      expect(bot.entity.position.x).toBe(1.310000011920929)
      expect(bot.movingPistons[0].progress).toBe(1)
      expect(bot.movingPistons[0].finished).toBe(true)
    })
  }
})

// On 1.9 and 1.10 (TileEntityPiston.update) the box the head's plate covers between its last and its new place pushes
// the player it overlaps by as far as the box's far side is past the player's near side, plus 0.01, as an ordinary move,
// on the tick it gets there and once more a tick later. Up to 1.8 a piston pushes no player here.
describe('a piston head extending into the player on 1.8 to 1.10', () => {
  const eastHead = [[0.75, 0, 0, 1, 1, 1], [0, 0.375, 0.375, 0.75, 0.625, 0.625]]
  const run = (version) => {
    const mcData = require('minecraft-data')(version)
    const Block = require('prismarine-block')(version)
    const world = {
      getBlock: (pos) => {
        const block = new Block(pos.y < 101 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
        block.position = pos.floored()
        return block
      }
    }
    const bot = {
      entity: { position: new Vec3(0.5, 101, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: true, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
      movingPistons: [{ position: new Vec3(0, 101, 0), direction: 'east', extending: true, source: true, progress: 0, boxes: eastHead }],
      jumpTicks: 0,
      jumpQueued: false,
      fireworkRocketDuration: 0,
      version,
      inventory: { slots: [] }
    }
    const physics = Physics(mcData, world)
    const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
    const xs = []
    for (let i = 0; i < 3; i++) {
      physics.tickPistons(physics.simulatePlayer(new PlayerState(bot, controls), world), world).apply(bot)
      xs.push(bot.entity.position.x)
    }
    return { xs, piston: bot.movingPistons[0] }
  }
  for (const version of ['1.9.4', '1.10.2']) {
    it(`${version}: pushes it by the box it sweeps, finishing a tick after it gets there`, () => {
      const { xs, piston } = run(version)
      expect(xs).toEqual([0.810000011920929, 1.310000011920929, 1.310000011920929])
      expect(piston.progress).toBe(1)
      expect(piston.finished).toBe(true)
    })
  }
  it('1.8.8: does not push it', () => {
    const { xs, piston } = run('1.8.8')
    expect(xs).toEqual([0.5, 0.5, 0.5])
    expect(piston.finished).toBe(true)
  })
})
