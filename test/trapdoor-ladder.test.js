/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.9 an open trapdoor (any kind) right above a ladder facing the same way is climbable (LivingEntity.onClimbable,
// trapdoorUsableAsLadder; EntityLivingBase.isOnLadder up to 1.12), so a player falling into it at 0.5 a tick falls 0.15
// (the climbable's limit), where on a closed one it lands after 0.3125. Both face north, the trapdoor at y = 61 over
// the ladder at y = 60; the player's feet are in the trapdoor's cell at y = 61.5.
function fallIntoTrapdoor (version, { name, open }) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const legacy = !mcData.version['>=']('1.13')
  const trapdoor = legacy
    ? new Block(mcData.blocksByName[name].id, 0, open ? 4 : 0)
    : Block.fromProperties(name, { facing: 'north', half: 'bottom', open, powered: false, waterlogged: false }, 0)
  const ladder = legacy ? new Block(mcData.blocksByName.ladder.id, 0, 2) : Block.fromProperties('ladder', { facing: 'north', waterlogged: false }, 0)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      let b
      if (p.x === 0 && p.z === 0 && p.y === 61) b = Object.assign(Object.create(Object.getPrototypeOf(trapdoor)), trapdoor)
      else if (p.x === 0 && p.z === 0 && p.y === 60) b = Object.assign(Object.create(Object.getPrototypeOf(ladder)), ladder)
      else b = new Block(mcData.blocksByName[p.y < 60 ? 'stone' : 'air'].id, 0, 0)
      b.position = pos.clone()
      return b
    }
  }
  const bot = {
    entity: { position: new Vec3(0.5, 61.5, 0.5), velocity: new Vec3(0, -0.5, 0), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return 61.5 - bot.entity.position.y
}

describe('a trapdoor above a ladder', () => {
  for (const version of ['1.9.4', '1.12.2', '1.16.5', '1.20.4', '1.21.1', '1.21.11', '26.1']) {
    const mcData = require('minecraft-data')(version)
    const kinds = ['oak_trapdoor', 'trapdoor', 'iron_trapdoor', 'bamboo_trapdoor', 'pale_oak_trapdoor', 'copper_trapdoor', 'waxed_oxidized_copper_trapdoor']
      .filter(name => mcData.blocksByName[name])
    for (const name of kinds) {
      it(`${version}: an open ${name} is climbable, a closed one is not`, () => {
        expect(fallIntoTrapdoor(version, { name, open: true })).toBeCloseTo(0.15, 6)
        expect(fallIntoTrapdoor(version, { name, open: false })).toBeCloseTo(0.3125, 6)
      })
    }
  }
})
