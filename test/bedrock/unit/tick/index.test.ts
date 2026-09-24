import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { simulatePlayer } from '../../../../lib/bedrock/tick/index.ts'
import type { Simulated } from '../../../../lib/bedrock/types.ts'
import { ctx, FLAT, player, worldOf } from '../helpers.ts'

const f = Math.fround

describe('bedrock tick/index (the tick sequence)', () => {
  it('walks forward on flat ground and keeps the ground flag', () => {
    const p = player(undefined, { control: { forward: true } })
    simulatePlayer(ctx(FLAT), p)
    assert.ok(p.vel.z > 0 && p.pos.z > 0.5)
    assert.strictEqual(p.pos.y, 0)
    assert.strictEqual(p.onGround, true)
    assert.ok(p.bedrock!.pendingSlowdowns)
    assert.strictEqual(p.bedrock!.wasRunning, true)
  })

  it('falls from the air with gravity', () => {
    const p = player([0.5, 10, 0.5], { onGround: false })
    simulatePlayer(ctx(FLAT), p)
    assert.strictEqual(p.vel.y, f(f(-f(0.08)) * f(0.98)))
    assert.strictEqual(p.onGround, false)
  })

  it('pushes a player the server asks to push out of the blocks its move ended in, and no other', () => {
    const inStone = worldOf({ '0,0,0': 'stone' })
    const asked = player([0.7, 0, 0.5], { bedrock: { depenetrationBits: 16, pushTowardsClosestSpace: true } })
    simulatePlayer(ctx(inStone), asked)
    assert.deepStrictEqual([asked.vel.x, asked.vel.z], [f(0.1), 0])
    const unasked = player([0.7, 0, 0.5], { bedrock: { depenetrationBits: 16 } })
    simulatePlayer(ctx(inStone), unasked)
    assert.deepStrictEqual([unasked.vel.x, unasked.vel.z], [0, 0])
  })

  it('holds an immobile player still, dropping its jump', () => {
    const p = player(undefined, { immobile: true, vel: new Vec3(0.3, 0.3, 0.3), jumpQueued: true, control: { jump: true } })
    simulatePlayer(ctx(FLAT), p)
    assert.deepStrictEqual([p.vel.x, p.vel.y, p.vel.z, p.jumpQueued], [0, 0, 0, false])
    assert.strictEqual((p as Simulated).bedrock.jumpingFlag, false)
    assert.deepStrictEqual([p.pos.x, p.pos.y, p.pos.z], [0.5, 0, 0.5])
  })

  it('ends a teleport tick after the jump, still pushed by bubble columns', () => {
    const p = player(undefined, { control: { forward: true, jump: true }, jumpQueued: true, bedrock: { teleported: true } })
    simulatePlayer(ctx(FLAT), p)
    assert.strictEqual(p.vel.y, f(0.42), 'the jump runs')
    assert.strictEqual(p.vel.z, 0, 'no travel')
    assert.deepStrictEqual([p.pos.y, p.jumpQueued], [0, false], 'no move')
    assert.ok(p.bedrock!.actions!.has('handledTeleport'))
  })

  it('moves a no-clip player through blocks, without landing', () => {
    const p = player([0.5, 0.2, 0.5], { noClip: true, onGround: false, vel: new Vec3(0, -0.5, 0) })
    simulatePlayer(ctx(FLAT), p)
    assert.ok(p.pos.y < 0, 'through the floor')
    assert.deepStrictEqual([p.onGround, p.isCollidedVertically], [false, false])
  })

  it('leaves a spectator untouched by the blocks it is in', () => {
    const honey = worldOf({ '0,0,0': 'honey_block', '0,1,0': 'honey_block' }, null)
    const spectator = player([0.5, 0.5, 0.5], { gameMode: 'spectator', noClip: true, onGround: false, vel: new Vec3(0, -0.5, 0) })
    simulatePlayer(ctx(honey), spectator)
    assert.ok(spectator.vel.y < f(-0.12), 'no honey slide')
    assert.strictEqual(spectator.bedrock!.pendingSlowdowns!.size, 0)
    const web = player([0.5, 0, 0.5], { gameMode: 'spectator', bedrock: { teleported: true } })
    simulatePlayer(ctx(worldOf({ '0,0,0': 'cobweb' })), web)
    const walker = player([0.5, 0.5, 0.5], { onGround: false, vel: new Vec3(0, -0.5, 0) })
    simulatePlayer(ctx(honey), walker)
    assert.strictEqual(walker.vel.y > spectator.vel.y, true)
  })

  it('moves an immobile player on its teleport tick like any teleport', () => {
    const p = player(undefined, { immobile: true, control: { jump: true }, bedrock: { teleported: true } })
    simulatePlayer(ctx(FLAT), p)
    assert.strictEqual(p.vel.y, f(0.42))
  })

  it('glides with the glide flag, and drops the firework off the glide', () => {
    const glider = player([0.5, 20, 0.5], { onGround: false, elytraFlying: true, elytraEquipped: true, vel: new Vec3(0, 0, 0.5), fireworkRocketDuration: 3 })
    simulatePlayer(ctx(worldOf({}, null)), glider)
    assert.strictEqual(glider.fireworkRocketDuration, 1)
    assert.ok(glider.vel.z > 0.4)
    const walker = player(undefined, { fireworkRocketDuration: 3 })
    simulatePlayer(ctx(FLAT), walker)
    assert.strictEqual(walker.fireworkRocketDuration, 0)
  })

  it('boosts a glide from the tick a firework is used, and only gliding', () => {
    const glider = player([0.5, 20, 0.5], { onGround: false, elytraFlying: true, elytraEquipped: true, vel: new Vec3(0, 0, 0.5), fireworkUsed: true })
    simulatePlayer(ctx(worldOf({}, null)), glider)
    assert.deepStrictEqual([glider.fireworkRocketDuration, glider.fireworkUsed], [18, false])
    const walker = player(undefined, { fireworkUsed: true })
    simulatePlayer(ctx(FLAT), walker)
    assert.deepStrictEqual([walker.fireworkRocketDuration, walker.fireworkUsed], [0, false])
  })

  it('flies with the fly controls and without the jump', () => {
    const p = player(undefined, { flying: true, control: { jump: true } })
    simulatePlayer(ctx(FLAT), p)
    assert.ok(p.vel.y > 0)
    assert.ok(!p.bedrock!.actions!.has('startJumping'))
  })

  it('climbs a ladder pushed against', () => {
    const p = player([0.5, 0, 0.5], { control: { forward: true } })
    const world = worldOf({ '0,0,0': 'ladder', '0,1,0': 'ladder', '0,0,1': 'stone', '0,1,1': 'stone' })
    for (let i = 0; i < 5; i++) simulatePlayer(ctx(world), p)
    assert.ok(p.pos.y > 0.3, `${p.pos.y}`)
  })
})
