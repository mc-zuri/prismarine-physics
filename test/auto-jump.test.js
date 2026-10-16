/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// LocalPlayer.updateAutoJump (from 1.11, with the client's auto-jump option): walking into a step 0.5 to 1.2 high with
// room above makes the next tick jump. A player walks east along a stone floor (below y = 60) towards a stone block at
// x = 3 (one high, or two for a wall); it jumps within 20 ticks only with the option on, from 1.11, and not at the wall.
function walkInto (version, autoJump, wallHeight) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const p = pos.floored()
      const solid = p.y < 60 || (p.x === 3 && p.y < 60 + wallHeight)
      const block = new Block(solid ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos.clone()
      return block
    }
  }
  const bot = {
    entity: { position: new Vec3(1.5, 60, 0.5), velocity: new Vec3(0, -0.0784000015258789, 0), onGround: true, isInWater: false, isInLava: false, isInWeb: false, isCollidedHorizontally: false, isCollidedVertically: true, elytraFlying: false, yaw: -Math.PI / 2, pitch: 0, effects: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version,
    inventory: { slots: [] }
  }
  const physics = Physics(mcData, world)
  physics.autoJump = autoJump
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  for (let tick = 0; tick < 20; tick++) {
    const state = physics.simulatePlayer(new PlayerState(bot, controls), world)
    state.apply(bot)
    // (the tick the jump is pressed for reports it, for the keys a caller sends)
    if (bot.entity.velocity.y > 0) return state.autoJumped
  }
  return false
}

describe('auto-jump', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.16.5', '1.17.1', '1.20.4', '1.21.4', '1.21.5', '1.21.11', '26.1']) {
    const supported = version !== '1.8.8'
    it(`${version}: ${supported ? 'jumps' : 'does not jump'} onto a block walked into with the option on`, () => {
      expect(walkInto(version, true, 1)).toBe(supported)
    })
    it(`${version}: does not jump with the option off, or at a wall two high`, () => {
      expect(walkInto(version, false, 1)).toBe(false)
      expect(walkInto(version, true, 2)).toBe(false)
    })
  }
})
