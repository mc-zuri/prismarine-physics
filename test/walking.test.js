/* eslint-env mocha */

const expect = require('expect')
const { firstTick } = require('./helpers/walk')

// The velocity of a player that starts walking from rest on the ground, after the first tick, as vanilla computes it
// in float: the input 0.98F, the speed (float)0.1, the ground speed factor of the friction under the player
// (LivingEntity.getFrictionInfluencedSpeed), Entity.moveRelative and the inertia friction * 0.91F.
//
// Ground speed factor: up to 1.12 0.16277136F / (friction * 0.91F)^3, on 1.13 0.16277137F / (friction * 0.91F)^3,
// since 1.14 0.21600002F / friction^3. moveRelative: all float before 1.14, double since; a diagonal input is
// normalized with a float length on 1.14 to 1.16 and a double one since.

// facing east, forward: velocity x
const STRAIGHT = {
  inertiaFactor: { stone: 0.05350800074768003, ice: 0.020057144802124727, packed_ice: 0.020057144802124727 },
  inertiaFactor113: { stone: 0.05350800074768003, ice: 0.020057148124338786, packed_ice: 0.020057148124338786, blue_ice: 0.01969376389201316 },
  frictionFactor: { stone: 0.053508008053839436, ice: 0.02005714406293894, packed_ice: 0.02005714406293894, blue_ice: 0.019693761928400874 }
}

// facing east, forward and sprinting: velocity x. The speed is (float)(0.1F * (1 + 0.3F)), the player's base movement
// speed and the sprint modifier as Player and LivingEntity declare them, floats widened to double.
const SPRINT = {
  inertiaFactor: { stone: 0.06956039771757005, ice: 0.02607428907331566 },
  inertiaFactor113: { stone: 0.06956040585360501, ice: 0.02607429405663675, blue_ice: 0.025601895741796388 },
  frictionFactor: { stone: 0.0695604148553142, ice: 0.026074288584128563, blue_ice: 0.02560189214975598 }
}

// facing south, forward and left: velocity x and z (the same)
const DIAGONAL = {
  float: 0.038608028381237336,
  floatLength: 0.03860803453293311,
  double: 0.03860803531251473
}

const VERSIONS = [
  ['1.8.8', STRAIGHT.inertiaFactor, SPRINT.inertiaFactor, DIAGONAL.float],
  ['1.9.4', STRAIGHT.inertiaFactor, SPRINT.inertiaFactor, DIAGONAL.float],
  ['1.12.2', STRAIGHT.inertiaFactor, SPRINT.inertiaFactor, DIAGONAL.float],
  ['1.13.2', STRAIGHT.inertiaFactor113, SPRINT.inertiaFactor113, DIAGONAL.float],
  ['1.14.4', STRAIGHT.frictionFactor, SPRINT.frictionFactor, DIAGONAL.floatLength],
  ['1.16.5', STRAIGHT.frictionFactor, SPRINT.frictionFactor, DIAGONAL.floatLength],
  ['1.17.1', STRAIGHT.frictionFactor, SPRINT.frictionFactor, DIAGONAL.double],
  ['1.20.4', STRAIGHT.frictionFactor, SPRINT.frictionFactor, DIAGONAL.double],
  ['1.21.1', STRAIGHT.frictionFactor, SPRINT.frictionFactor, DIAGONAL.double],
  ['1.21.4', STRAIGHT.frictionFactor, SPRINT.frictionFactor, DIAGONAL.double],
  // 1.21.5+ normalizes a diagonal input before scaling it (not covered here)
  ['1.21.11', STRAIGHT.frictionFactor, SPRINT.frictionFactor, null],
  ['26.1', STRAIGHT.frictionFactor, SPRINT.frictionFactor, null]
]

// forward and left, off the axes, where every float rounding of moveRelative shows: [version, floor, yaw, x, z]
const OFF_AXIS = [
  ['1.12.2', 'ice', 30, 0.00529774373323133, 0.019768924460293658],
  ['1.12.2', 'stone', 137.3, -0.05455615799513769, -0.002187523514799228],
  ['1.13.2', 'ice', 30, 0.005297744563784845, 0.019768927782507717],
  ['1.16.5', 'ice', 30, 0.0052977445541222724, 0.019768924849912706],
  ['1.20.4', 'ice', 30, 0.0052977446610954545, 0.01976892524909103]
]

describe('walking from rest', () => {
  for (const [version, straight, sprint, diagonal] of VERSIONS) {
    describe(version, () => {
      for (const [floor, x] of Object.entries(straight)) {
        it(`walks east on ${floor} at vanilla's speed`, () => {
          expect(firstTick(version, { floor, yawDegrees: -90 }).x).toBe(x)
        })
      }

      for (const [floor, x] of Object.entries(sprint)) {
        it(`sprints east on ${floor} at vanilla's speed`, () => {
          expect(firstTick(version, { floor, yawDegrees: -90, controls: { forward: true, sprint: true } }).x).toBe(x)
        })
      }

      if (diagonal !== null) {
        it('walks forward and left at vanilla\'s speed', () => {
          const vel = firstTick(version, { controls: { forward: true, left: true } })
          expect(vel.x).toBe(diagonal)
          expect(vel.z).toBe(diagonal)
        })
      }
    })
  }

  for (const [version, floor, yaw, x, z] of OFF_AXIS) {
    it(`${version}: walks forward and left on ${floor} at yaw ${yaw} at vanilla's velocity`, () => {
      const vel = firstTick(version, { floor, yawDegrees: yaw, controls: { forward: true, left: true } })
      expect(vel.x).toBe(x)
      expect(vel.z).toBe(z)
    })
  }

  // In the air the input accelerates by 0.02F and the motion keeps 0.91F of itself (LivingEntity.travel): one tick
  // forward from rest, facing east, before 1.14 in float (moveFlying), since in double.
  for (const [version, x] of [['1.8.8', 0.017836000725567347], ['1.13.2', 0.017836000725567347], ['1.14.4', 0.017836000462502232], ['1.21.11', 0.017836000462502232], ['26.1', 0.017836000462502232]]) {
    it(`${version}: moves forward in the air at vanilla's speed`, () => {
      expect(firstTick(version, { yawDegrees: -90, airborne: true }).x).toBe(x)
    })
  }
})
