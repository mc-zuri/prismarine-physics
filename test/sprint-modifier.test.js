/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LivingEntity.setSprinting puts the sprint modifier on the movement speed when sprinting starts and takes it off when
// it stops, and nowhere else; the server's attributes replace all the modifiers (handleUpdateAttributes). So a player
// that sprints while the synced movement speed has no sprint modifier moves at the walking speed until it stops and
// starts again. One tick on a stone floor holding forward (or not), with the synced movement speed `modifiers`.
function walk (version, { sprinting, sprintKey, modifiers, forward = true }) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const block = new Block(pos.y < 60 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const resource = mcData.attributesByName.movementSpeed.resource
  const bot = {
    entity: {
      position: new Vec3(0.5, 60, 0.5),
      velocity: new Vec3(0, -0.0784000015258789, 0),
      onGround: true,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: true,
      isSprinting: sprinting,
      elytraFlying: false,
      yaw: Math.PI,
      pitch: 0,
      effects: {},
      attributes: { [resource]: { value: 0.10000000149011612, modifiers } }
    },
    food: 20,
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const physics = Physics(mcData, world)
  const controls = { forward, back: false, left: false, right: false, jump: false, sprint: sprintKey, sneak: false }
  physics.simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return { velocity: bot.entity.velocity, sprinting: bot.entity.isSprinting, modifiers: bot.entity.attributes[resource].modifiers, sprintId: physics.sprintingUUID }
}

describe('the sprint modifier', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.20.6', '1.21.1', '1.21.11', '26.1']) {
    it(`${version}: a sprint the synced speed has no modifier for moves at the walking speed`, () => {
      const sprinting = walk(version, { sprinting: true, sprintKey: true, modifiers: [] })
      const walking = walk(version, { sprinting: false, sprintKey: false, modifiers: [] })
      expect(sprinting.sprinting).toBe(true)
      expect(sprinting.modifiers).toEqual([])
      expect(sprinting.velocity.z).toBe(walking.velocity.z)
    })
    it(`${version}: starting a sprint puts the modifier on, stopping takes it off`, () => {
      const started = walk(version, { sprinting: false, sprintKey: true, modifiers: [] })
      expect(started.sprinting).toBe(true)
      expect(started.modifiers.map(modifier => modifier.uuid)).toEqual([started.sprintId])
      expect(started.velocity.z).toBeGreaterThan(walk(version, { sprinting: false, sprintKey: false, modifiers: [] }).velocity.z)

      const stopped = walk(version, { sprinting: true, sprintKey: false, modifiers: started.modifiers, forward: false })
      expect(stopped.sprinting).toBe(false)
      expect(stopped.modifiers).toEqual([])
    })
  }
})
