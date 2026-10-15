/* eslint-env mocha */

const expect = require('expect')
const { firstTick } = require('./helpers/walk')

// The direction of the movement input: Entity.moveRelative turns it by the yaw with Mth.sin and Mth.cos, which read
// a 65536-entry float table, SIN[i] = (float)Math.sin(i * 2 * PI / 65536). The angle is the float
// yRot * 0.017453292F (1.8: yRot * 3.1415927F / 180.0F); the index is (int)(angle * 10430.378F), with 16384
// added for the cosine, both in float, until 1.21.11 computes it in double with a (long) cast.
//
// Walking forward from rest, the tick's velocity is (-sin, cos) times one factor, so its direction is the table's.
//
// [yaw in degrees, sin, cos] as the table gives them, at angles where the 1.8 angle or the 1.21.11 index picks
// another entry than the float index of 1.9 to 1.21.10 (at 118.125 for the cosine, the float sum
// angle * 10430.378F + 16384 rounds up to the next entry).
const LEGACY_ANGLE = [
  [84.375, 0.9951847195625305, 0.0980171412229538],
  [-84.375, -0.9951847195625305, 0.09792172908782959],
  [118.125, 0.8819212913513184, -0.4713967442512512],
  [-118.125, -0.8819212913513184, -0.4713967442512512]
]
const FLOAT_INDEX = [
  [84.375, 0.995175302028656, 0.0980171412229538],
  [-84.375, -0.995175302028656, 0.0980171412229538],
  [118.125, 0.8819664716720581, -0.4713967442512512],
  [-118.125, -0.8819664716720581, -0.47131219506263733]
]
const DOUBLE_INDEX = [
  [84.375, 0.9951847195625305, 0.0980171412229538],
  [-84.375, -0.9951847195625305, 0.09792172908782959],
  [118.125, 0.8819664716720581, -0.47131219506263733],
  [-118.125, -0.8819664716720581, -0.47131219506263733]
]

const VERSIONS = [
  ['1.8.8', LEGACY_ANGLE],
  ['1.9.4', FLOAT_INDEX],
  ['1.12.2', FLOAT_INDEX],
  ['1.13.2', FLOAT_INDEX],
  ['1.14.4', FLOAT_INDEX],
  ['1.16.5', FLOAT_INDEX],
  ['1.17.1', FLOAT_INDEX],
  ['1.20.4', FLOAT_INDEX],
  ['1.21.1', FLOAT_INDEX],
  ['1.21.9', FLOAT_INDEX],
  ['1.21.11', DOUBLE_INDEX],
  ['26.1', DOUBLE_INDEX]
]

describe('movement input direction', () => {
  for (const [version, entries] of VERSIONS) {
    describe(version, () => {
      it('leaves the other axis at exactly 0 facing south and east', () => {
        // SIN[0] = 0 and SIN[49152] = -1
        expect(firstTick(version, { yawDegrees: 0 }).x).toBe(0)
        expect(firstTick(version, { yawDegrees: -90 }).z).toBe(0)
      })

      for (const [yaw, sin, cos] of entries) {
        it(`turns the input by the sine table's entries at yaw ${yaw}`, () => {
          const vel = firstTick(version, { yawDegrees: yaw })
          expect(vel.x / vel.z).toBeCloseTo(-sin / cos, 12)
        })
      }
    })
  }
})
