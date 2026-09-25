import assert from 'node:assert'
import { scalar } from '../../../../lib/bedrock/math/crt.ts'
import {
  depthStriderLevel, depthStriderSpeed, frictionInfluencedSpeed, GROUND_FRICTION, LAVA_MOVEMENT_ATTRIBUTE, liquidSpeed, UNDERWATER_MOVEMENT_ATTRIBUTE, moveRelative, movementAttributeOf,
  movementSpeed, setMovementAttribute, setSprintBoost, walkSpeed, walkSpeedBase, walkSpeedParts
} from '../../../../lib/bedrock/movement/travel.ts'
import type { Player } from '../../../../lib/bedrock/types.ts'
import { player, settings } from '../helpers.ts'

const f = Math.fround
const S = settings()
const KEY = S.movementSpeedAttribute
const withAttribute = (attr: Record<string, unknown>, bedrock = {}): Player => player(undefined, { attributes: { [KEY]: attr }, bedrock })

describe('bedrock movement/travel', () => {
  describe('the movement attribute', () => {
    it('is used when it carries a number', () => {
      assert.deepStrictEqual(movementAttributeOf(withAttribute({ base: 0.1 }), S), { base: 0.1 })
      assert.deepStrictEqual(movementAttributeOf(withAttribute({ value: 0.2 }), S), { value: 0.2 })
      assert.strictEqual(movementAttributeOf(withAttribute({ base: 'x' }), S), null)
      assert.strictEqual(movementAttributeOf(player(), S), null)
    })

    it('gives the walking speed: the current value, else the default speed with the sprint boost', () => {
      assert.strictEqual(walkSpeed(withAttribute({ base: 0.1, current: 0.13 }), S), 0.13)
      assert.strictEqual(walkSpeed(withAttribute({ value: 0.2 }), S), 0.2)
      assert.strictEqual(walkSpeed(withAttribute({ base: 0.11 }), S), 0.11)
      assert.strictEqual(walkSpeed(withAttribute({ default: 0.12 }), S), 0.12)
      assert.strictEqual(walkSpeed(withAttribute({ base: 0.1, current: 'x' }), S), S.playerSpeed)
      assert.strictEqual(walkSpeed(player(), S), S.playerSpeed)
      assert.strictEqual(walkSpeed(player(undefined, { bedrock: { sprintBoost: true } }), S), f(0.1 * f(1.3)))
    })

    it('gives the walking speed without the boost', () => {
      assert.strictEqual(walkSpeedBase(withAttribute({ base: 0.1, current: 0.13 }), S), 0.1)
      assert.strictEqual(walkSpeedBase(withAttribute({ current: 0.13 }), S), 0.13)
      assert.strictEqual(walkSpeedBase(player(), S), S.playerSpeed)
    })

    it('adds and removes the sprint boost on the attribute', () => {
      const p = withAttribute({ base: 0.1, current: 0.1 }) as Player & { bedrock: {} }
      setSprintBoost(p, S, true)
      assert.deepStrictEqual(p.attributes![KEY], { base: 0.1, current: f(0.1 * f(1.3)) })
      assert.strictEqual(p.bedrock.sprintBoost, true)
      setSprintBoost(p, S, false)
      assert.deepStrictEqual(p.attributes![KEY], { base: 0.1, current: 0.1 })
      const bare = player(undefined, { bedrock: {} }) as Player & { bedrock: {} }
      setSprintBoost(bare, S, true)
      assert.strictEqual(bare.attributes, undefined, 'no attribute to change')
      assert.strictEqual(walkSpeed(bare, S), f(0.1 * f(1.3)))
    })

    it('installs a server attribute, reading the boost from its current value', () => {
      const p = player()
      setMovementAttribute(p, S, { base: 0.1, current: 0.13 })
      assert.deepStrictEqual(p.attributes![KEY], { base: f(0.1), current: f(0.13) })
      assert.strictEqual(p.bedrock!.sprintBoost, true)
      setMovementAttribute(p, S, { base: 0.1 })
      assert.deepStrictEqual(p.attributes![KEY], { base: f(0.1), current: f(0.1) })
      assert.strictEqual(p.bedrock!.sprintBoost, false)
    })

    it('reads the boost past the player\'s Speed and Slowness, and keeps the attribute without them', () => {
      const walking = player(undefined, { speed: 1 })
      setMovementAttribute(walking, S, { base: 0.1, current: f(f(0.1) * f(1.2)) })
      assert.deepStrictEqual([walking.attributes![KEY]!.current, walking.bedrock!.sprintBoost], [f(0.1), false])
      const sprinting = player(undefined, { speed: 1 })
      setMovementAttribute(sprinting, S, { base: 0.1, current: f(f(f(0.1) * f(1.3)) * f(1.2)) })
      assert.deepStrictEqual([sprinting.attributes![KEY]!.current, sprinting.bedrock!.sprintBoost], [f(f(0.1) * f(1.3)), true])
    })

    it('keeps the boost of a sprint started after the packet\'s tick, and only while sprinting', () => {
      const sprinting = player(undefined, { bedrock: { sprinting: true } })
      setMovementAttribute(sprinting, S, { base: 0.1, current: 0.1, sprintStartedSince: true })
      assert.deepStrictEqual([sprinting.attributes![KEY]!.current, sprinting.bedrock!.sprintBoost], [f(f(0.1) * f(1.3)), true])
      const stopped = player(undefined, { bedrock: { sprinting: false } })
      setMovementAttribute(stopped, S, { base: 0.1, current: 0.1, sprintStartedSince: true })
      assert.deepStrictEqual([stopped.attributes![KEY]!.current, stopped.bedrock!.sprintBoost], [f(0.1), false])
      const before = player(undefined, { bedrock: { sprinting: true } })
      setMovementAttribute(before, S, { base: 0.1, current: 0.1 })
      assert.strictEqual(before.bedrock!.sprintBoost, false, 'a sprint running since before the tick takes the packet')
    })
  })

  it('multiplies the speed and slowness effects in turn', () => {
    assert.strictEqual(movementSpeed(0.1, 0, 0), f(0.1))
    assert.strictEqual(movementSpeed(0.1, 2, 0), f(f(f(f(0.2) * 2) + 1) * f(0.1)))
    assert.strictEqual(movementSpeed(0.1, 2, 2), f(f(f(f(-0.15) * 2) + 1) * f(f(f(f(0.2) * 2) + 1) * f(0.1))))
    assert.strictEqual(movementSpeed(0.1, 0, 7), 0, 'never negative')
  })

  it("reads a liquid's speed from its movement attribute, 0.02 without one", () => {
    assert.strictEqual(liquidSpeed(player(), UNDERWATER_MOVEMENT_ATTRIBUTE), f(0.02))
    assert.strictEqual(liquidSpeed(player(undefined, { attributes: { [LAVA_MOVEMENT_ATTRIBUTE]: { base: 0.02, current: 0.04 } } }), LAVA_MOVEMENT_ATTRIBUTE), f(0.04))
    assert.strictEqual(liquidSpeed(player(undefined, { attributes: { [LAVA_MOVEMENT_ATTRIBUTE]: {} } }), LAVA_MOVEMENT_ATTRIBUTE), f(0.02))
  })

  describe('the travel speed on foot', () => {
    const base = { walkSpeed: 0.1, slipperiness: 0.6, onGround: true }
    it('is the walking speed on normal ground', () => {
      assert.strictEqual(frictionInfluencedSpeed(base), f(f(f(f(f(GROUND_FRICTION / f(f(0.6) * f(0.91))) ** 2)) * f(GROUND_FRICTION / f(f(0.6) * f(0.91)))) * f(0.1)))
    })
    it('boosts the sprint after the effects, as the boost modifier comes last', () => {
      const ratio = f(GROUND_FRICTION / f(f(0.6) * f(0.91)))
      const cube = f(f(ratio * ratio) * ratio)
      const affected = movementSpeed(0.1, 1, 2)
      assert.strictEqual(frictionInfluencedSpeed({ ...base, speedLevel: 1, slownessLevel: 2, sprintBoost: true }), f(cube * f(affected * f(1.3))))
    })

    it('takes the boost apart from an attribute holding exactly the boosted base', () => {
      const S = settings()
      const key = S.movementSpeedAttribute
      const boosted = player(undefined, { attributes: { [key]: { base: f(0.1), current: f(f(0.1) * f(1.3)) } } })
      assert.deepStrictEqual(walkSpeedParts(boosted, S), { walk: f(0.1), boost: true })
      const server = player(undefined, { attributes: { [key]: { base: f(0.1), current: f(0.12) } } })
      assert.deepStrictEqual(walkSpeedParts(server, S), { walk: f(0.12), boost: false })
    })

    it('is faster on slippery ground relative to its friction, slower on soul sand', () => {
      assert.ok(frictionInfluencedSpeed({ ...base, slipperiness: 0.98 }) < frictionInfluencedSpeed(base))
      assert.ok(frictionInfluencedSpeed({ ...base, soulSand: true }) < frictionInfluencedSpeed(base))
    })
    it('is 0.02 in the air and in liquids, 0.026 sprinting in the air', () => {
      assert.strictEqual(frictionInfluencedSpeed({ ...base, onGround: false }), f(0.02))
      assert.strictEqual(frictionInfluencedSpeed({ ...base, onGround: false, sprinting: true }), f(0.025999999))
      assert.strictEqual(frictionInfluencedSpeed({ ...base, inWater: true }), f(0.02))
      assert.strictEqual(frictionInfluencedSpeed({ ...base, inLava: true, liquidSpeed: f(0.05) }), f(0.05), "the liquid's own speed")
      assert.strictEqual(frictionInfluencedSpeed({ ...base, inLava: true }), f(0.02))
    })
    it('is slowed by using an item and by the effects', () => {
      assert.ok(frictionInfluencedSpeed({ ...base, speedLevel: 1 }) > frictionInfluencedSpeed(base))
      assert.ok(frictionInfluencedSpeed({ ...base, slownessLevel: 1 }) < frictionInfluencedSpeed(base))
    })
  })

  it('takes Depth Strider up to level 3, halved off the ground, and lerps the water speed to the walking speed', () => {
    assert.strictEqual(depthStriderLevel(2, true), 2)
    assert.strictEqual(depthStriderLevel(5, true), 3)
    assert.strictEqual(depthStriderLevel(-1, true), 0)
    assert.strictEqual(depthStriderLevel(undefined, true), 0)
    assert.strictEqual(depthStriderLevel(3, false), 1.5)
    assert.strictEqual(depthStriderSpeed(0.02, 0.1, 0), 0.02)
    assert.strictEqual(depthStriderSpeed(f(0.02), f(0.1), 3), f(f(0.02) + f(f(f(f(0.1) - f(0.02)) * 3) / 3)))
  })

  it('adds the input rotated by the yaw and scaled to the speed', () => {
    const vel = { x: 0, y: 0, z: 0 }
    moveRelative(vel, 0, 0, 1, 0.1, scalar)
    assert.deepStrictEqual(vel, { x: 0, y: 0, z: f(0.1) }, 'forward at yaw 0 is south')
    const west = { x: 0, y: 0, z: 0 }
    moveRelative(west, 90, 0, 1, 0.1, scalar)
    assert.ok(Math.abs(west.x + 0.1) < 1e-7 && Math.abs(west.z) < 1e-7, `${west.x} ${west.z}`)
    const strafe = { x: 0, y: 0, z: 0 }
    moveRelative(strafe, 0, 1, 0, 0.1, scalar)
    assert.deepStrictEqual(strafe, { x: f(0.1), y: 0, z: 0 }, 'left at yaw 0 is east')
  })

  it('keeps a short input short, normalises a long one, and ignores a negligible one', () => {
    const short = { x: 0, y: 0, z: 0 }
    moveRelative(short, 0, 0, 0.5, 0.1, scalar)
    assert.strictEqual(short.z, f(0.05))
    const long = { x: 0, y: 0, z: 0 }
    moveRelative(long, 0, 0, 2, 0.1, scalar)
    assert.strictEqual(long.z, f(0.1))
    const none = { x: 1, y: 0, z: 1 }
    moveRelative(none, 0, 0.001, 0.001, 0.1, scalar)
    assert.deepStrictEqual(none, { x: 1, y: 0, z: 1 })
  })
})
