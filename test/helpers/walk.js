const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')

// One tick of a player at rest on a flat floor (the block below y = 60), or `airborne` high above it with no
// velocity, with the given keys held, facing yRot `yawDegrees` (vanilla's degrees: 0 south, -90 east). Returns the
// velocity after the tick. `attributes` are the entity's attributes as the server synced them, `state` other entity
// fields as the tick before left them.
function firstTick (version, { floor = 'stone', yawDegrees = 0, controls = { forward: true }, airborne = false, attributes, state } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const block = new Block(pos.y < 60 ? mcData.blocksByName[floor].id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const player = {
    entity: {
      position: new Vec3(0.5, airborne ? 80 : 60, 0.5),
      velocity: new Vec3(0, 0, 0),
      onGround: !airborne,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: Math.PI - yawDegrees * Math.PI / 180,
      pitch: 0,
      effects: {},
      attributes,
      ...state
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const keys = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false, ...controls }
  const physics = Physics(mcData, world)
  physics.simulatePlayer(new PlayerState(player, keys), world).apply(player)
  return player.entity.velocity
}

module.exports = { firstTick }
