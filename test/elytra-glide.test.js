/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LivingEntity.travel while gliding, one tick facing south at a pitch, from a motion vanilla had: the motion vanilla
// had after it. The versions differ in the lift (-0.08 + c * 0.06 up to 1.12, gravity * (-1 + c * 0.75) since), the
// cosine (float Mth.cos up to 1.18.1, double Math.cos since) and the look vector (getVectorForRotation up to 1.12,
// calculateViewVector since, both through the Mth tables).
const TICKS = [
  ['1.12.2', -30, [-4.736901240716188e-18, -0.4074753125250561, 0.12844054578420458], [-4.89777701051576e-18, -0.39305394633712204, 0.15443390974142007]],
  ['1.12.2', 30, [-4.500190782334404e-18, -0.3671087840192751, 0.12389735119872566], [-4.792978460671676e-18, -0.3645090257197894, 0.14953017860230475]],
  ['1.13.2', -30, [0, -0.35485234596391324, 0.11952658745700447], [0, -0.34590999318030824, 0.14225165870770548]],
  ['1.13.2', 30, [0, -0.3671087840192751, 0.12389735119872566], [0, -0.3645090257197894, 0.14953017860230475]],
  ['1.20.4', -30, [0, -0.2851319831639382, 0.11506319360465993], [0, -0.28298328543683493, 0.13325506984549448]],
  ['1.20.4', 30, [0, -0.29554576472903166, 0.11845902984021583], [0, -0.2996397426537458, 0.13936316129128812]],
  ['1.21.11', -30, [0, -0.2851319831639382, 0.11506319360465993], [0, -0.28298328543683493, 0.13325506984549448]],
  ['1.21.11', 30, [0, -0.29554576472903166, 0.11845902984021583], [0, -0.2996397426537458, 0.13936316129128812]]
]

function glideOneTick (version, pitchDegrees, velocity) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const b = new Block(mcData.blocksByName.air.id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, 130, 0.5),
      velocity: new Vec3(...velocity),
      onGround: false,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: true,
      yaw: Math.PI, // south
      pitch: -pitchDegrees * Math.PI / 180,
      effects: {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: Object.assign([], { 6: { name: 'elytra' } }) }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.velocity
}

describe('gliding', () => {
  for (const [version, pitch, before, after] of TICKS) {
    it(`${version}: glides at pitch ${pitch} as vanilla`, () => {
      const vel = glideOneTick(version, pitch, before)
      expect([vel.x, vel.y, vel.z]).toEqual(after)
    })
  }
})
