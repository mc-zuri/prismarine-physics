/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// The player's box is its width and height as floats: EntityDimensions 0.6F x 1.8F, so the box reaches
// (double)(0.6F / 2.0F) = 0.30000001192092896 to each side and 1.7999999523162842 up.
const VERSIONS = ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.21.4', '1.21.11', '26.1']

function jumpUnderCeiling (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const solid = pos.y < 60 || pos.y === 62
      const block = new Block(solid ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const player = {
    entity: {
      position: new Vec3(0.5, 60, 0.5),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
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
  const controls = { forward: false, back: false, left: false, right: false, jump: true, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(player, controls), world).apply(player)
  return player.entity
}

describe('player box', () => {
  for (const version of VERSIONS) {
    it(`${version}: a jump under a ceiling two blocks up stops 1.8F below it`, () => {
      const entity = jumpUnderCeiling(version)
      expect(entity.position.y).toBe(62 - Math.fround(1.8))
      expect(entity.isCollidedVertically).toBe(true)
    })
  }
})
