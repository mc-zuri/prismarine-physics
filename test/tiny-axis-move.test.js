/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')
const { firstTick } = require('./helpers/walk')

// From 1.13 (Shapes.collide) a move along an axis under 1.0E-7 is none when there is a shape to collide with: on 1.13 one
// touching the box the move sweeps, from 1.14 to 1.17 always the world border's, from 1.18 one in the swept box.

// From 1.21.5 LivingEntity.aiStep stops the horizontal motion as a whole (under x² + z² < 9.0E-6) rather than each axis
// under 0.003, so a knockback can leave such an axis: a player moving 0.05 south and 5.0E-8 east stays at the same x on
// the ground, where the floor is in the swept box, and drifts east in the open air, where nothing is.
function tinyEastMove (version, onGround) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const block = new Block(pos.y < 60 ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, onGround ? 60 : 80, 0.5),
      velocity: new Vec3(5e-8, onGround ? -0.0784000015258789 : 0, 0.05),
      onGround,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: onGround,
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
  return bot.entity.position
}

describe('a motion along an axis under 1.0E-7', () => {
  for (const version of ['1.21.5', '1.21.11', '26.1']) {
    it(`${version}: is none with a shape in the swept box`, () => {
      const position = tinyEastMove(version, true)
      expect(position.x).toBe(0.5)
      expect(position.z).toBe(0.55)
    })
    it(`${version}: moves with nothing to collide with`, () => {
      const position = tinyEastMove(version, false)
      expect(position.x).toBe(0.5 + 5e-8)
      expect(position.z).toBe(0.55)
    })
  }

  // Up to 1.21.4 the motion under 0.003 on an axis has stopped before the move, on the ground and in the air
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.21.4']) {
    it(`${version}: has stopped before the move`, () => {
      expect(tinyEastMove(version, true).x).toBe(0.5)
      expect(tinyEastMove(version, false).x).toBe(0.5)
    })
  }
})

// Walking west (yRot 90) the input's z is the sine table's cos(90°) residual, about 1.0E-17. Up to 1.17.1 a cut of the
// move stops the motion along z (Entity.move), and from 1.18.2 a cut under 1.0E-5 does not. On the ground the floor
// cuts it from 1.13; in the air the world border does from 1.14 to 1.17, and nothing does on 1.13 or from 1.18. Up to
// 1.12 the move keeps it.
describe('walking west', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.18.2', '1.20.4', '1.21.4', '1.21.11', '26.1']) {
    const stopsInAir = ['1.14.4', '1.16.5', '1.17.1'].includes(version)
    const stopsOnGround = stopsInAir || version === '1.13.2'
    it(`${version}: ${stopsOnGround ? 'stops' : 'keeps'} the residual motion along z on the ground, ${stopsInAir ? 'stops' : 'keeps'} it in the air`, () => {
      const onGround = firstTick(version, { yawDegrees: 90, state: { velocity: new Vec3(0, -0.0784000015258789, 0) } })
      expect(onGround.z === 0).toBe(stopsOnGround)
      expect(firstTick(version, { yawDegrees: 90, airborne: true }).z === 0).toBe(stopsInAir)
    })
  }
})
