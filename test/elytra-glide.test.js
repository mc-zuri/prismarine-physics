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

// `blockAt`: the block name at a y (air by default); `y`: the start height; `flying`: creative flying; `rocket`: ticks of
// firework boost left
function glideOneTick (version, pitchDegrees, velocity, { blockAt = () => 'air', y = 130, flying = false, rocket = 0 } = {}) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const info = mcData.blocksByName[blockAt(Math.floor(pos.y))]
      const b = info.defaultState !== undefined ? Block.fromStateId(info.defaultState, 0) : new Block(info.id, 0, 0)
      b.position = pos
      return b
    }
  }
  const bot = {
    entity: {
      position: new Vec3(0.5, y, 0.5),
      velocity: new Vec3(...velocity),
      onGround: false,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: true,
      flying,
      flyingSpeed: 0.05,
      yaw: Math.PI, // south
      pitch: -pitchDegrees * Math.PI / 180,
      effects: {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: rocket,
    version,
    inventory: { slots: Object.assign([], { 6: { name: 'elytra' } }) }
  }
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return Object.assign(bot.entity.velocity, { elytraFlying: bot.entity.elytraFlying, onGround: bot.entity.onGround, pos: bot.entity.position })
}

describe('gliding', () => {
  // FireworkRocketEntity.tick boosts along Entity.getLookAngle, the view vector: looking due south its x is 0 exactly
  for (const version of ['1.13.2', '1.20.4', '1.21.11', '26.1']) {
    it(`${version}: a rocket boosts along the view vector`, () => {
      expect(glideOneTick(version, 0, [0, 0, 0.5], { rocket: 10 }).x).toBe(0)
    })
  }

  // The client ticks the firework after the player up to 1.13 and from 1.17, so the boost comes after the move; on 1.14
  // to 1.16 the engine boosts before it (the client's order there follows the entity ids)
  for (const [version, after] of [['1.12.2', true], ['1.14.4', false], ['1.16.5', false], ['1.17.1', true], ['1.21.11', true]]) {
    it(`${version}: a rocket boosts ${after ? 'after' : 'before'} the move`, () => {
      const boosted = glideOneTick(version, 10, [0, -0.2, 0.5], { rocket: 10 })
      const plain = glideOneTick(version, 10, [0, -0.2, 0.5])
      if (after) expect(boosted.pos).toEqual(plain.pos)
      else expect(boosted.pos.z).toBeGreaterThan(plain.pos.z)
      expect(boosted.z).toBeGreaterThan(plain.z)
    })
  }

  for (const [version, pitch, before, after] of TICKS) {
    it(`${version}: glides at pitch ${pitch} as vanilla`, () => {
      const vel = glideOneTick(version, pitch, before)
      expect([vel.x, vel.y, vel.z]).toEqual(after)
    })
  }

  // The server ends a glide, through entity data; the client ends it only while creative flying up to 1.21.1
  // (Player.travel) and from 1.21.5 on a climbable block out of fluids (LivingEntity.travelFallFlying, stopFallFlying).
  for (const version of ['1.12.2', '1.15.2', '1.21.4', '1.21.11']) {
    it(`${version}: keeps gliding after touching the ground`, () => {
      const landed = glideOneTick(version, 0, [0, -0.5, 0.1], { blockAt: y => y < 60 ? 'stone' : 'air', y: 60.2 })
      expect(landed.onGround).toBe(true)
      expect(landed.elytraFlying).toBe(true)
    })
  }
  // Block.updateEntityAfterFallOn stops the fall: = 0.0 up to 1.13, multiplied by 0.0 from 1.14, which leaves -0.0
  for (const [version, zero] of [['1.12.2', 0], ['1.13.2', 0], ['1.14.4', -0], ['1.21.11', -0], ['26.1', -0]]) {
    it(`${version}: a glide that lands ends its fall at ${Object.is(zero, -0) ? '-0' : '0'}`, () => {
      const landed = glideOneTick(version, 0, [0, -0.5, 0.1], { blockAt: y => y < 60 ? 'stone' : 'air', y: 60.2 })
      expect(landed.onGround).toBe(true)
      expect(Object.is(landed.y, zero)).toBe(true)
    })
  }
  for (const [version, stops] of [['1.21.4', false], ['1.21.5', true], ['1.21.11', true]]) {
    it(`${version}: ${stops ? 'stops' : 'keeps'} gliding on a ladder`, () => {
      expect(glideOneTick(version, 0, [0, -0.3, 0.1], { blockAt: y => y === 130 ? 'ladder' : 'air' }).elytraFlying).toBe(!stops)
    })
  }
  it('1.21.11: keeps gliding on a ladder in water', () => {
    const inWater = glideOneTick('1.21.11', 0, [0, -0.3, 0.1], { blockAt: y => y === 130 ? 'ladder' : y === 131 ? 'water' : 'air' })
    expect(inWater.elytraFlying).toBe(true)
  })
  for (const [version, stops] of [['1.12.2', true], ['1.20.4', true], ['1.21.1', true], ['1.21.4', false], ['1.21.11', false]]) {
    it(`${version}: creative flight damps the glide's fall${stops ? ' and ends the glide' : ''}`, () => {
      const flying = glideOneTick(version, 0, [0, -0.3, 0.1], { flying: true })
      expect(flying.y).toBe(-0.3 * 0.6)
      expect(flying.elytraFlying).toBe(!stops)
    })
  }
})
