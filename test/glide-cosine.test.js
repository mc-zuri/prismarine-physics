/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { javaCos } = require('prismarine-physics/lib/math')
const { Vec3 } = require('vec3')
const expect = require('expect')

// From 1.18.2 a glide's lift takes the double Math.cos of the pitch, which the Java runtime rounds correctly. At a
// pitch of 56 degrees (56F * 0.017453292F radians) that is 0.5591928973939152, where a JavaScript engine's Math.cos
// may give the next double up. One glide tick at that pitch, from the motion a vanilla client had, ends at the motion it
// went on with: -0.5295571354775266 up and 0.5284796440228063 south.
describe('the cosine of a glide\'s pitch', () => {
  it('is correctly rounded', () => {
    expect(javaCos(Math.fround(Math.fround(56) * Math.fround(0.017453292)))).toBe(0.5591928973939152)
    expect(javaCos(0)).toBe(1)
  })

  for (const version of ['1.18.2', '1.20.4', '1.21.1', '1.21.11', '26.1']) {
    it(`${version}: lifts a glide at a pitch of 56 degrees as the vanilla client does`, () => {
      const mcData = require('minecraft-data')(version)
      const Block = require('prismarine-block')(version)
      const world = {
        getBlock: (pos) => {
          const block = new Block(mcData.blocksByName.air.id, 0, 0)
          block.position = pos
          return block
        }
      }
      const bot = {
        entity: { position: new Vec3(0.5, 120, 0.5), velocity: new Vec3(0, -0.49656865113679033, 0.5181196247863328), onGround: false, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: false, elytraFlying: true, yaw: Math.PI, pitch: -56 * Math.PI / 180, effects: {} },
        jumpTicks: 0,
        jumpQueued: false,
        fireworkRocketDuration: 0,
        version,
        inventory: { slots: [] }
      }
      const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
      Physics(mcData, world).simulatePlayer(new PlayerState(bot, controls), world).apply(bot)
      expect(bot.entity.velocity.y).toBe(-0.5295571354775266)
      expect(bot.entity.velocity.z).toBe(0.5284796440228063)
    })
  }
})
