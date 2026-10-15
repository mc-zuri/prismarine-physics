/* eslint-env mocha */

const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// Where Entity.move leaves the player. Up to 1.16 the box carries the player and the position is read back from it:
// the centre of the moved box (resetPositionToBB, setLocationFromBoundingbox). Since 1.17 the collided move is added
// to the position (setPos). From 1.14 a collided move whose squared length is 1.0E-7 or less is dropped.
const HALF_WIDTH = Math.fround(0.3)

// [version, the position is the box's centre, short moves are dropped]
const VERSIONS = [
  ['1.8.8', true, false],
  ['1.12.2', true, false],
  ['1.13.2', true, false],
  ['1.14.4', true, true],
  ['1.16.5', true, true],
  ['1.17.1', false, true],
  ['1.20.4', false, true],
  ['1.21.1', false, true],
  ['1.21.11', false, true],
  ['26.1', false, true]
]

// `ticks` ticks with no keys held, from a stone floor, moving east at `vx` (and south at `vz`); a stone wall fills
// x >= wallX if given
function slide (version, x, vx, wallX, ticks = 1, vz = 0) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const solid = pos.y < 60 || (wallX !== undefined && pos.x >= wallX)
      const block = new Block(solid ? mcData.blocksByName.stone.id : mcData.blocksByName.air.id, 0, 0)
      block.position = pos
      return block
    }
  }
  const player = {
    entity: {
      position: new Vec3(x, 60, 0.5),
      velocity: new Vec3(vx, 0, vz),
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
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
  const physics = Physics(mcData, world)
  for (let i = 0; i < ticks; i++) physics.simulatePlayer(new PlayerState(player, controls), world).apply(player)
  return player.entity.position.x
}

describe('position after a move', () => {
  for (const [version, fromBox, dropsShortMoves] of VERSIONS) {
    describe(version, () => {
      it(fromBox ? 'is the centre of the moved box' : 'is the position plus the move', () => {
        // the centre, the position plus the move, and the box's corner plus the half-width all differ in the last bit
        // from here
        const x = -0.2164184438993928
        const vx = 0.13783579756106903
        const centre = ((x - HALF_WIDTH) + vx + ((x + HALF_WIDTH) + vx)) / 2
        expect(slide(version, x, vx)).toBe(fromBox ? centre : x + vx)
      })

      if (fromBox) {
        it('moves the box the tick before left, not one rebuilt from the position', () => {
          // the second tick moves on by the first tick's velocity, 0.546F of it kept by the ground; the two boxes
          // differ in the last bit from here
          const x = 0.8673531739060923
          const vx = 0.10323914547626228
          const next = vx * Math.fround(Math.fround(0.6) * Math.fround(0.91))
          const minX = (x - HALF_WIDTH) + vx
          const maxX = (x + HALF_WIDTH) + vx
          expect(slide(version, x, vx, undefined, 2)).toBe(((minX + next) + (maxX + next)) / 2)
        })
      }

      it(dropsShortMoves ? 'drops a move a wall cuts to 1e-4' : 'applies a move a wall cuts to 1e-4', () => {
        const x = 2 - HALF_WIDTH - 1e-4
        expect(slide(version, x, 0.25, 2)).toBe(dropsShortMoves ? x : 2 - HALF_WIDTH)
      })
    })
  }

  // LivingEntity.aiStep stops a negligible motion before the move: each axis under 0.005 on 1.8 and under 0.003 up to
  // 1.21.4; from 1.21.5 a player's horizontal motion as a whole when x² + z² < 9.0E-6
  describe('negligible motion', () => {
    const moves = (version, vx, vz) => slide(version, 0.5, vx, undefined, 1, vz) !== 0.5
    it('stops each axis under 0.005 on 1.8 and under 0.003 later', () => {
      expect(moves('1.8.8', 0.004, 0)).toBe(false)
      expect(moves('1.9.4', 0.004, 0)).toBe(true)
      expect(moves('1.21.4', 0.0025, 0.0025)).toBe(false)
    })
    it('from 1.21.5 stops the horizontal motion when x² + z² < 9.0E-6', () => {
      for (const version of ['1.21.5', '1.21.11', '26.1']) {
        expect(moves(version, 0.0025, 0.0025)).toBe(true) // 1.25e-5
        expect(moves(version, 0.0029, 0)).toBe(false) // 8.41e-6
      }
    })
  })
})
