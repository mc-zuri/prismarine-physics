/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// The blocks a player is inside act on it (Entity.checkInsideBlocks). Up to 1.21.1 that happens during the move,
// before the tick's drag and gravity; from 1.21.2 after travel (LivingEntity.applyEffectsFromBlocks). A downward bubble
// column limits a fall inside it to 0.3: from 1.21.2 the tick ends there, before the water's drag and sinking change it.
function sinkInBubbleColumn (version, { y = 65 } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const column = mcData.blocksByName.bubble_column
  const world = {
    getBlock: (pos) => {
      // drag=true (pulls down) is the column's first state
      const block = Math.floor(pos.y) < 60
        ? new Block(mcData.blocksByName.stone.id, 0, 0)
        : Math.floor(pos.y) < 70 ? Block.fromStateId(column.minStateId, 0) : new Block(mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, y, 0.5),
      velocity: new Vec3(0, -0.5, 0),
      onGround: false,
      isInWater: true,
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
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.velocity.y
}

describe('block effects', () => {
  for (const [version, last] of [['1.13.2', false], ['1.20.4', false], ['1.21.1', false], ['1.21.3', true], ['1.21.11', true], ['26.1', true]]) {
    it(`${version}: a bubble column acts ${last ? 'after' : 'before'} the water's drag`, () => {
      const vy = sinkInBubbleColumn(version)
      if (last) expect(vy).toBe(-0.3)
      else expect(vy).toBeGreaterThan(-0.3)
    })
  }

  // Sinking from the column's top cell (below air: -0.03 down to -0.9) into the one under it (down to -0.3). Up to 1.21.8
  // the box's cells go upwards (BlockPos.betweenClosed), so the top cell acts last; from 1.21.9 the walk starts from the
  // corner the move leaves, the top, so the cell under it acts last.
  for (const [version, vy] of [['1.21.3', -0.3 - 0.03], ['1.21.8', -0.3 - 0.03], ['1.21.9', -0.3], ['1.21.11', -0.3], ['26.1', -0.3]]) {
    it(`${version}: sinking from a column's top cell, the ${vy === -0.3 ? 'cell under it' : 'top cell'} acts last`, () => {
      expect(sinkInBubbleColumn(version, { y: 68.5 })).toBe(vy)
    })
  }
})

// From 1.21.5 a move is walked one axis at a time, y first: falling sideways past a cobweb, the box after the y step
// touches it though the end box does not. Up to 1.21.4 only the end box's cells count.
function fallSidewaysPastCobweb (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const b = new Block(mcData.blocksByName[p.y < 55 ? 'stone' : p.x === 0 && p.y === 60 && p.z === 0 ? 'cobweb' : 'air'].id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 61.2, 0.5), velocity: new Vec3(1, -0.3, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.isInWeb
}

// From 1.21.10 a bubble column acts only when the step's end box touches it: rising out of a column's top cell, the box
// where the step began touches it, the end box does not
function riseOutOfColumn (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const column = mcData.blocksByName.bubble_column
  const world = {
    getBlock: (pos) => {
      const y = Math.floor(pos.y)
      const block = y < 60 ? new Block(mcData.blocksByName.stone.id, 0, 0) : y <= 64 ? Block.fromStateId(column.minStateId + 1, 0) : new Block(mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 64.9, 0.5), velocity: new Vec3(0, 0.5, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.velocity.y
}

describe('blocks along the move', () => {
  for (const [version, stuck] of [['1.21.4', false], ['1.21.5', true], ['1.21.11', true]]) {
    it(`${version}: falling sideways past a cobweb ${stuck ? 'gets' : 'does not get'} stuck`, () => {
      expect(fallSidewaysPastCobweb(version)).toBe(stuck)
    })
  }

  it('from 1.21.10 a bubble column the end box leaves does not act', () => {
    expect(riseOutOfColumn('1.21.9')).toBeGreaterThan(riseOutOfColumn('1.21.10'))
  })
})

// A player at rest with its feet 0.0002 below the top of a cobweb's cell. Up to 1.21.1 Entity.checkInsideBlocks finds
// the blocks in the box shrunk by 0.001, which leaves that cell out, and from 1.19.3 by 1.0E-7, which keeps it; from
// 1.21.2 the blocks along the move are found with no such margin, and the cobweb holds the player too.
describe('the blocks the player is inside', () => {
  for (const version of ['1.8.8', '1.12.2', '1.14.4', '1.16.5', '1.18.2', '1.19.2', '1.19.3', '1.20.4', '1.21.1', '1.21.3', '1.21.11', '26.1']) {
    const found = !['1.8.8', '1.12.2', '1.14.4', '1.16.5', '1.18.2', '1.19.2'].includes(version)
    it(`${version}: ${found ? 'include' : 'leave out'} a cell 0.0002 into the box`, () => {
      const mcData = require('minecraft-data')(version)
      const Block = require('prismarine-block')(version)
      const web = (mcData.blocksByName.cobweb ?? mcData.blocksByName.web).id
      const world = {
        getBlock: (pos) => {
          const p = pos.floored()
          const b = new Block(p.y === 60 && p.x === 0 && p.z === 0 ? web : mcData.blocksByName.air.id, 0, 0)
          b.position = pos.clone()
          return b
        }
      }
      const bot = {
        entity: { position: new Vec3(0.5, 60.9998, 0.5), velocity: new Vec3(0, 0, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
        jumpTicks: 0,
        jumpQueued: false,
        fireworkRocketDuration: 0,
        version,
        inventory: { slots: [] }
      }
      const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
      Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
      expect(bot.entity.isInWeb).toBe(found)
    })
  }
})
