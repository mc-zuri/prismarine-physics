import assert from 'node:assert'
import {
  directionFromRotation, javaPitchToBedrockDeg, javaYawToBedrockDeg, lerpRotation, pitchOf, tableCosDeg, tableCosRad,
  tableSin, tableSinDeg, tableSinRad, viewBetween, viewOf, wrapDegrees, yawOf
} from '../../../../lib/bedrock/math/rotation.ts'

const f = Math.fround
const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`)

describe('bedrock math/rotation', () => {
  it('reads the sine table, wrapping the index', () => {
    assert.strictEqual(tableSin(0), 0)
    assert.strictEqual(tableSin(16384), 1)
    assert.strictEqual(tableSin(65536 + 16384), 1)
    assert.strictEqual(tableSin(-16384), tableSin(49152))
    near(tableSin(8192), Math.SQRT1_2)
  })

  it('looks up degrees and radians', () => {
    assert.strictEqual(tableSinDeg(90), 1)
    assert.strictEqual(tableCosDeg(0), 1)
    near(tableCosDeg(60), 0.5, 1e-4)
    assert.strictEqual(tableSinRad(f(Math.PI / 2)), 1)
    near(tableCosRad(f(Math.PI)), -1)
  })

  it('adds the cosine quarter turn before truncating, so negative angles land one entry over', () => {
    const radians = f(-0.00005)
    const scaled = f(radians * f(10430.378))
    assert.strictEqual(tableCosRad(radians), tableSin(f(scaled + 16384) | 0))
    assert.notStrictEqual(f(scaled + 16384) | 0, (scaled | 0) + 16384)
  })

  it('wraps degrees into (-180, 180]', () => {
    assert.strictEqual(wrapDegrees(190), -170)
    assert.strictEqual(wrapDegrees(-190), 170)
    assert.strictEqual(wrapDegrees(180), -180)
    assert.strictEqual(wrapDegrees(45), 45)
  })

  it('lerps rotations the short way round', () => {
    assert.strictEqual(lerpRotation(170, -170, 0.5), 180)
    assert.strictEqual(lerpRotation(-170, 170, 0.5), -180)
    assert.strictEqual(lerpRotation(0, 90, 0.5), 45)
    assert.strictEqual(lerpRotation(10, 20, 0), 10)
  })

  it('turns a pitch and yaw into a look direction: yaw 0 is south, a positive pitch looks down', () => {
    const south = directionFromRotation(0, 0)
    near(south.x, 0)
    near(south.y, 0)
    near(south.z, 1)
    const west = directionFromRotation(0, 90)
    near(west.x, -1)
    near(west.z, 0)
    near(directionFromRotation(90, 0).y, -1)
    near(directionFromRotation(-90, 0).y, 1)
  })

  it('looks between two rotations', () => {
    assert.deepStrictEqual(viewBetween(0, 0, 90, 30, 1), directionFromRotation(lerpRotation(0, 30, 1), lerpRotation(0, 90, 1)))
    assert.deepStrictEqual(viewBetween(0, 0, 90, 30), viewBetween(0, 0, 90, 30, 1))
    assert.deepStrictEqual(viewBetween(10, 20, 90, 30, 0), directionFromRotation(20, 10))
  })

  it('converts mineflayer radians to Bedrock degrees', () => {
    assert.strictEqual(javaYawToBedrockDeg(Math.PI), 0)
    assert.strictEqual(javaYawToBedrockDeg(0), 180)
    assert.strictEqual(javaYawToBedrockDeg(Math.PI / 2), 90)
    assert.strictEqual(javaPitchToBedrockDeg(-Math.PI / 4), 45)
  })

  it('reads the degrees when given, else converts the radians', () => {
    assert.strictEqual(yawOf({ bedrockYaw: 12.3, yaw: 1 }), f(12.3))
    assert.strictEqual(yawOf({ yaw: Math.PI }), 0)
    assert.strictEqual(yawOf({}), 180)
    assert.strictEqual(pitchOf({ bedrockPitch: -7.5, pitch: 1 }), -7.5)
    assert.strictEqual(pitchOf({ pitch: -Math.PI / 4 }), 45)
    assert.strictEqual(pitchOf({}), -0)
    assert.deepStrictEqual(viewOf({ bedrockYaw: 90, bedrockPitch: 10 }), directionFromRotation(10, 90))
  })
})
