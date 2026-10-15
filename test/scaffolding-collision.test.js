/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// ScaffoldingBlock.getCollisionShape (1.14+): its top and legs only to a player standing above it and not descending
// (sneaking); otherwise a player walks into it. One tick from (x, y) moving by `velocity`, with scaffolding (distance 0,
// not a bottom one) at the given cells and stone under y = 60.
function tick (version, { x = 0.5, y = 60, velocity, sneak = false, scaffolds }) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const at = new Set(scaffolds.map(c => c.join(',')))
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const b = at.has(`${p.x},${p.y},${p.z}`)
        ? Block.fromProperties('scaffolding', { distance: 0, bottom: false, waterlogged: false }, 0)
        : new Block(mcData.blocksByName[p.y < 60 ? 'stone' : 'air'].id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(x, y, 0.5),
      velocity: new Vec3(...velocity),
      onGround: velocity[1] === 0,
      isInWater: false,
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
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity
}

describe('scaffolding collision', () => {
  for (const version of ['1.14.4', '1.16.5', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: a player walks into scaffolding beside it`, () => {
      const entity = tick(version, { velocity: [0.3, 0, 0], scaffolds: [[1, 60, 0], [1, 61, 0]] })
      expect(entity.isCollidedHorizontally).toBe(false)
      expect(entity.position.x).toBeGreaterThan(0.7)
    })

    it(`${version}: a player lands on scaffolding, unless sneaking`, () => {
      const landing = { y: 61.3, velocity: [0, -0.5, 0], scaffolds: [[0, 60, 0]] }
      expect(tick(version, landing).position.y).toBe(61)
      expect(tick(version, { ...landing, sneak: true }).position.y).toBeLessThan(61)
    })
  }
})
