import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { defaultSettings, FEATURES, Physics, supportFeature, versionAtLeast, versionOf } from '../../../lib/bedrock/index.ts'
import { FLAT, player, worldOf } from './helpers.ts'

const f = Math.fround
const registry = (minecraftVersion: string) => ({ version: { minecraftVersion } })

describe('bedrock physics object', () => {
  it('reads the registry version', () => {
    assert.deepStrictEqual(versionOf(registry('1.26.20')), [1, 26, 20])
    assert.deepStrictEqual(versionOf({ version: { majorVersion: '1.21' } }), [1, 21])
    assert.deepStrictEqual(versionOf({}), [0])
    assert.deepStrictEqual(versionOf(registry('1.x.3')), [1, 0, 3])
    assert.ok(versionAtLeast(registry('1.26.20'), 1, 26, 20))
    assert.ok(versionAtLeast(registry('1.26.51'), 1, 26, 20))
  })

  it('keys the version-dependent rules on the full version, from features.json', () => {
    assert.deepStrictEqual(FEATURES.map(feature => feature.name), ['scalarTrig', 'landingBounceCorrection', 'scaffoldingClimbFlag'])
    assert.ok(supportFeature(registry('1.26.20'), 'landingBounceCorrection'))
    assert.ok(!supportFeature(registry('1.26.10'), 'landingBounceCorrection'), 'the same major version, before it')
    assert.ok(!supportFeature(registry('1.26.51'), 'noSuchFeature'), 'an unknown feature: never')
    assert.ok(versionAtLeast(registry('1.27.0'), 1, 26, 20))
    assert.ok(versionAtLeast(registry('2.0.0'), 1, 26, 20))
    assert.ok(!versionAtLeast(registry('1.26.10'), 1, 26, 20))
    assert.ok(!versionAtLeast(registry('1.25.99'), 1, 26, 20))
    assert.ok(!versionAtLeast({}, 1, 26, 20))
  })

  it('carries the default tunables', () => {
    const settings = defaultSettings()
    assert.deepStrictEqual([settings.gravity, settings.jumpVelocity, settings.eyeHeight, settings.movementSpeedAttribute], [0.08, f(0.42), 1.6200100183486938, 'minecraft:movement'])
  })

  it('simulates a tick with its tunables, which a caller may change', () => {
    const physics = Physics(registry('1.26.20'), FLAT)
    const p = player([0.5, 10, 0.5], { onGround: false })
    physics.gravity = 0.04
    physics.simulatePlayer(p, FLAT)
    assert.strictEqual(p.vel.y, f(f(-f(0.04)) * f(0.98)))
  })

  it('bounces slow landings on slime only before 1.26.20', () => {
    const slime = worldOf({}, 0, 'slime')
    const land = (version: string) => {
      const p = player([0.5, 0.01, 0.5], { onGround: false, vel: new Vec3(0, -0.05, 0) })
      Physics(registry(version), slime).simulatePlayer(p, slime)
      return p.vel.y
    }
    // the older build rebounds 0.05 and then falls a tick; the newer one lands dead and falls from rest
    assert.strictEqual(land('1.26.10'), f(f(f(0.05) - f(0.08)) * f(0.98)))
    assert.strictEqual(land('1.26.20'), f(f(-f(0.08)) * f(0.98)))
  })

  it('builds the input packet with its eye height', () => {
    const physics = Physics(registry('1.26.20'), FLAT)
    const p = player([0, 64, 0])
    assert.strictEqual((physics.playerAuthInput(p).position as { y: number }).y, f(64 + f(physics.eyeHeight)))
  })

  it('applies the server packets with its eye height and attribute name', () => {
    const physics = Physics(registry('1.26.20'), FLAT)
    const p = player()
    physics.setMovementAttribute(p, { base: 0.1, current: 0.13 })
    assert.strictEqual(p.attributes!['minecraft:movement']!.current, f(0.13))
    physics.handleTeleport(p, { x: 0, y: 64 + physics.eyeHeight, z: 0 })
    assert.strictEqual(p.pos.y, f(f(64 + physics.eyeHeight) - f(physics.eyeHeight)))
    physics.respawn(p, { x: 0, y: 66 + physics.eyeHeight, z: 0 })
    assert.strictEqual(p.pos.y, f(f(66 + physics.eyeHeight) - f(physics.eyeHeight)))
    physics.applyCorrection(p, { x: 0, y: 70 + physics.eyeHeight, z: 0 })
    assert.strictEqual(p.pos.y, f(f(70 + physics.eyeHeight) - f(physics.eyeHeight)))
    physics.setActorFlags(p, { sneaking: true })
    physics.applyMotion(p, { x: 0, y: 0.5, z: 0 })
    assert.strictEqual(p.vel.y, 0.5)
    assert.strictEqual(p.bedrock!.sneaking, true)
  })

  describe('sensing the liquids of the coming tick', () => {
    const shallow = worldOf({ '0,0,0': 'water' })
    const physics = Physics(registry('1.26.20'), shallow)

    it('builds a box around the position when none is kept', () => {
      assert.deepStrictEqual(physics.senseLiquids(player(), shallow), { isInWater: true, isInLava: false })
      assert.deepStrictEqual(physics.senseLiquids(player([0.5, 5, 0.5]), shallow), { isInWater: false, isInLava: false })
      assert.deepStrictEqual(physics.senseLiquids(player(undefined, { control: { sneak: true } }), shallow).isInWater, true)
      assert.deepStrictEqual(physics.senseLiquids(player(undefined, { elytraFlying: true, elytraEquipped: true }), shallow).isInWater, true)
    })

    it('uses the kept box, resized to the pose height', () => {
      const p = player()
      physics.simulatePlayer(p, shallow)
      assert.strictEqual(physics.senseLiquids(p, shallow).isInWater, true)
      p.bedrock!.poseHeight = f(1.8)
      assert.strictEqual(physics.senseLiquids(p, shallow).isInWater, true, 'the kept box as it is')
      p.bedrock!.poseHeight = 0.6
      p.bedrock!.swimming = true
      assert.strictEqual(physics.senseLiquids(p, shallow).isInWater, true)
    })
  })

  it('drops a position onto the ground below it', () => {
    const physics = Physics(registry('1.26.20'), FLAT)
    const pos = { x: 0.5, y: 0.5, z: 0.5 }
    physics.adjustPositionHeight(pos)
    assert.strictEqual(pos.y, 0)
    const high = { x: 0.5, y: 5, z: 0.5 }
    physics.adjustPositionHeight(high)
    assert.strictEqual(high.y, 4)
  })
  it('dismounts a rider in its world', () => {
    const physics = Physics(registry('1.26.20'), FLAT)
    const rider = player([0.5, 1, 0.5], { vehicle: { id: 1n, kind: 'boat', pos: new Vec3(0.5, Math.fround(0.375), 0.5), vel: new Vec3(0, 0, 0), yaw: 0, pitch: 0, predicted: true, seat: { x: 0, y: 1, z: 0 } } })
    physics.dismount(rider)
    assert.deepStrictEqual([rider.pos.z, rider.vehicle], [-0.5, undefined])
  })
})
