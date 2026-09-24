import assert from 'node:assert'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import {
  applyCorrection, applyMotion, applySpatialCorrection, applyVelocityCorrection, handleTeleport, MoveMode, setActorFlags
} from '../../../../lib/bedrock/network/corrections.ts'
import { player } from '../helpers.ts'

const f = Math.fround
const EYE = 1.6200100183486938

describe('bedrock network/corrections', () => {
  it('teleports to the eye position less the eye height, zeroing the velocity and marking the next tick', () => {
    const p = player([0, 0, 0], { vel: player().vel.set(1, 1, 1), bedrock: { aabb: new Box(0, 0, 0, 1, 1, 1) } })
    handleTeleport(p, { x: 10.5, y: 64 + EYE, z: -3.5, onGround: true }, EYE)
    assert.deepStrictEqual([p.pos.x, p.pos.y, p.pos.z], [f(10.5), f(f(64 + EYE) - f(EYE)), f(-3.5)])
    assert.deepStrictEqual([p.vel.x, p.vel.y, p.vel.z], [0, 0, 0])
    assert.deepStrictEqual([p.bedrock!.teleported, p.bedrock!.aabb, p.onGround], [true, undefined, true])
  })

  it('zeroes the fall distance on a teleport, and turns only the head (the pitch) for a head rotation', () => {
    const falling = player([0, 0, 0], { bedrock: { fallDistance: 12 } })
    handleTeleport(falling, { x: 0, y: EYE, z: 0 }, EYE)
    assert.strictEqual(falling.bedrock!.fallDistance, 0)
    const head = player([1, 2, 3], { bedrockYaw: 10, bedrockPitch: 0, vel: player().vel.set(1, 0, 0) })
    handleTeleport(head, { x: 50, y: 50, z: 50, yaw: 90, pitch: 30, mode: MoveMode.rotation }, EYE)
    assert.deepStrictEqual([head.pos.x, head.pos.y, head.pos.z, head.vel.x, head.bedrockYaw, head.bedrockPitch, head.bedrock?.teleported], [1, 2, 3, 1, 10, 30, undefined])
  })

  it('moves without the teleport marks in another mode, keeping the ground flag when not given', () => {
    const p = player([0, 0, 0], { onGround: false, vel: player().vel.set(1, 1, 1) })
    handleTeleport(p, { x: 1, y: 1, z: 1, mode: MoveMode.normal }, EYE)
    assert.deepStrictEqual([p.vel.x, p.bedrock!.teleported, p.onGround], [1, undefined, false])
  })

  it('installs the rotation in degrees or converts it to radians, as the player keeps it', () => {
    const radians = player()
    handleTeleport(radians, { x: 0, y: 0, z: 0, yaw: 90, pitch: 45 }, EYE)
    assert.deepStrictEqual([radians.yaw, radians.pitch], [Math.PI - Math.PI / 2, -Math.PI / 4])
    const degrees = player(undefined, { bedrockYaw: 0, bedrockPitch: 0 })
    handleTeleport(degrees, { x: 0, y: 0, z: 0, yaw: 90, pitch: 45 }, EYE)
    assert.deepStrictEqual([degrees.bedrockYaw, degrees.bedrockPitch], [90, 45])
    const bare = player(undefined, { yaw: undefined, pitch: undefined })
    handleTeleport(bare, { x: 0, y: 0, z: 0, yaw: 30, pitch: 10 }, EYE)
    assert.deepStrictEqual([bare.bedrockYaw, bare.bedrockPitch], [30, 10])
  })

  it('installs a correction: position, velocity, ground flag; collisions cleared', () => {
    const p = player(undefined, { isCollidedHorizontally: true, isCollidedVertically: true })
    applyCorrection(p, { x: 1, y: 2 + EYE, z: 3, dx: 0.1, dy: -0.2, dz: 0.3, onGround: true }, EYE)
    assert.deepStrictEqual([p.vel.x, p.vel.y, p.vel.z, p.onGround], [f(0.1), f(-0.2), f(0.3), true])
    assert.deepStrictEqual([p.isCollidedHorizontally, p.isCollidedVertically, p.bedrock!.aabb], [false, false, undefined])
    applyCorrection(p, { x: 1, y: 2, z: 3 }, EYE)
    assert.deepStrictEqual([p.vel.x, p.vel.y, p.vel.z, p.onGround], [0, 0, 0, false])
  })

  it('sets a motion on the velocity alone', () => {
    const p = player([1, 2, 3], { onGround: true })
    applyMotion(p, { x: 0.1, y: 0.4, z: -0.2 })
    assert.deepStrictEqual([p.vel.x, p.vel.y, p.vel.z, p.pos.y, p.onGround], [f(0.1), f(0.4), f(-0.2), 2, true])
  })

  it('writes the restated flags and the box height, keeping the feet', () => {
    const p = player(undefined, { bedrock: { aabb: new Box(0, 1, 0, 1, 2.8, 1) } })
    setActorFlags(p, { sneaking: true, gliding: true, height: 1.49 })
    assert.deepStrictEqual([p.bedrock!.sneaking, p.bedrock!.gliding, p.elytraFlying], [true, true, true])
    assert.deepStrictEqual([p.bedrock!.poseHeight, p.bedrock!.aabb!.maxY, p.bedrock!.height], [f(1.49), f(1 + f(1.49)), f(1.49)])
    const noBox = player()
    setActorFlags(noBox, { height: 0.6, swimming: false })
    assert.deepStrictEqual([noBox.bedrock!.poseHeight, noBox.bedrock!.swimming], [f(0.6), false])
    setActorFlags(noBox, { pushTowardsClosestSpace: true })
    assert.strictEqual(noBox.bedrock!.pushTowardsClosestSpace, true)
    setActorFlags(noBox, {})
    assert.strictEqual(noBox.elytraFlying, undefined)
  })

  it('corrects a plain actor record: a teleport zeroes the velocity, a correction copies it', () => {
    const dims = { width: 0.6, height: 1.8 }
    const moved = applySpatialCorrection({}, { position: { x: 1, y: 2, z: 3 }, velocity: { x: 0.1, y: 0, z: 0 }, onGround: true }, dims)
    assert.deepStrictEqual([moved.velocity, moved.onGround, moved.teleported], [{ x: f(0.1), y: 0, z: 0 }, true, undefined])
    assert.strictEqual(moved.bounds!.minY, 2)
    const teleported = applySpatialCorrection({}, { op: 'teleport', position: { x: 1, y: 2, z: 3 }, velocity: { x: 0.1, y: 0, z: 0 } }, dims)
    assert.deepStrictEqual([teleported.velocity, teleported.teleported, teleported.onGround], [{ x: 0, y: 0, z: 0 }, true, false])
    assert.deepStrictEqual(applyVelocityCorrection({ position: { x: 5, y: 5, z: 5 } }, { x: 0.1, y: 0.2, z: 0.3 }), { position: { x: 5, y: 5, z: 5 }, velocity: { x: f(0.1), y: f(0.2), z: f(0.3) } })
  })
})
