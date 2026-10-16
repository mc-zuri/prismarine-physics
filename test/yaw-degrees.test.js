/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// The sine table reads the client's float yRot in degrees, whose table entry depends on the unwrapped angle (the index
// truncates towards zero): a client facing 280 moves a little differently from one facing -80. The engine uses the
// caller's yRot when it looks the same way as the yaw. One tick sprinting forward from rest on the ground.
function sprintOnce (version, yRot) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = { getBlock: (pos) => { const b = new Block(mcData.blocksByName[Math.floor(pos.y) < 100 ? 'stone' : 'air'].id, 0, 0); b.position = pos.clone(); return b } }
  const bot = {
    entity: { position: new Vec3(0.5, 100, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: false, yaw: Math.PI - 280 * Math.PI / 180 + 2 * Math.PI, pitch: 0, effects: {}, yRot },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] },
    food: 20
  }
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: true, sneak: false }
  Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
  return bot.entity.velocity.x
}

describe('yaw in degrees', () => {
  it('1.21.11: moves as a client whose yRot is 280, as vanilla does', () => {
    expect(sprintOnce('1.21.11', 280)).toBe(0.06850415249759495)
    expect(sprintOnce('1.21.11', -80)).not.toBe(sprintOnce('1.21.11', 280))
  })
  for (const version of ['1.12.2', '1.20.4', '1.21.11']) {
    it(`${version}: ignores a yRot that does not look the same way as the yaw`, () => {
      expect(sprintOnce(version, 10)).toBe(sprintOnce(version, undefined))
    })
  }
})
