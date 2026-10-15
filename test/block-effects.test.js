/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// The blocks a player is inside act on it (Entity.checkInsideBlocks). Up to 1.21.1 that happens during the move,
// before the tick's drag and gravity; from 1.21.2 after travel (LivingEntity.applyEffectsFromBlocks). A downward bubble
// column limits a fall inside it to 0.3: from 1.21.2 the tick ends there, before the water's drag and sinking change it.
function sinkInBubbleColumn (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const column = mcData.blocksByName.bubble_column
  const world = {
    getBlock: (pos) => {
      // drag=true (pulls down) is the column's first state
      const block = pos.y < 60
        ? new Block(mcData.blocksByName.stone.id, 0, 0)
        : pos.y < 70 ? Block.fromStateId(column.minStateId, 0) : new Block(mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, 65, 0.5),
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
})
