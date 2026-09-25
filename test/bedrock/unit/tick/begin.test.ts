import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { beginTick, clientFlying, startingPoseHeight, stepJumpCooldown, syncGlideFlag } from '../../../../lib/bedrock/tick/begin.ts'
import type { Block, Simulated, World } from '../../../../lib/bedrock/types.ts'
import { block, ctx, FLAT, player, worldOf } from '../helpers.ts'

const f = Math.fround

describe('bedrock tick/begin', () => {
  it('counts the jump cooldown down while jump is held, and drops it on release', () => {
    const p = player(undefined, { jumpTicks: 3 })
    stepJumpCooldown(p, true)
    assert.strictEqual(p.jumpTicks, 2)
    stepJumpCooldown(p, false)
    assert.strictEqual(p.jumpTicks, 0)
    const none = player(undefined, { jumpTicks: undefined })
    stepJumpCooldown(none, true)
    assert.strictEqual(none.jumpTicks, undefined)
  })

  it('holds the cooldown for a jump key held as a raw bit too', () => {
    const p = player(undefined, { jumpTicks: 10, control: { raw: { jumpDown: true } } })
    beginTick(ctx(), p)
    assert.strictEqual(p.jumpTicks, 9)
  })

  it('starts from the kept pose height, else the pose the controls and flags say', () => {
    assert.strictEqual(startingPoseHeight(player(undefined, { bedrock: { poseHeight: 0.6 } }), 1.8), 0.6)
    assert.strictEqual(startingPoseHeight(player(undefined, { control: { sneak: true } }), 1.8), 1.49)
    assert.strictEqual(startingPoseHeight(player(undefined, { bedrock: { swimming: true } }), 1.8), f(0.6))
    assert.strictEqual(startingPoseHeight(player(undefined, { elytraFlying: true, elytraEquipped: true }), 1.8), f(0.6))
    assert.strictEqual(startingPoseHeight(player(undefined, { elytraFlying: true }), 1.8), 1.8)
    assert.strictEqual(startingPoseHeight(player(undefined, { control: undefined }), 2), 2)
  })

  it('keeps its own glide flag unless the caller changed elytraFlying', () => {
    const p = player(undefined, { elytraFlying: true, bedrock: {} }) as Simulated
    syncGlideFlag(p)
    assert.strictEqual(p.bedrock.gliding, true, 'first read')
    p.bedrock.gliding = false
    p.bedrock.glideMirror = true
    syncGlideFlag(p)
    assert.strictEqual(p.bedrock.gliding, false, 'unchanged by the caller')
    p.elytraFlying = false
    syncGlideFlag(p)
    assert.strictEqual(p.bedrock.gliding, false)
    p.bedrock.gliding = true
    p.elytraFlying = true
    p.bedrock.glideMirror = false
    syncGlideFlag(p)
    assert.strictEqual(p.bedrock.gliding, true)
    p.bedrock.glideMirror = true
    p.elytraFlying = false
    syncGlideFlag(p)
    assert.strictEqual(p.bedrock.gliding, false, 'the caller cleared it')
  })

  it('holds its own flying ability until the server flag changes', () => {
    const st: Record<string, unknown> = {}
    assert.strictEqual(clientFlying(st, false), false)
    st.flying = true
    assert.strictEqual(clientFlying(st, false), true, 'its own toggle, the server unchanged')
    assert.strictEqual(clientFlying(st, true), true)
    st.flying = false
    assert.strictEqual(clientFlying(st, true), false)
    assert.strictEqual(clientFlying(st, false), false, 'the server restates: taken')
    assert.strictEqual(clientFlying({}, true), true)
  })

  it('begins a tick: float32 velocity, the box, the ground, flying and the liquids', () => {
    const p = player([0.5, 0, 0.5], { vel: new Vec3(0.1, 0.2, 0.3), onGround: true, flying: true })
    const { tick, entity } = beginTick(ctx(worldOf({ '0,-1,0': 'ice' })), p)
    assert.deepStrictEqual([entity.vel.x, entity.vel.y, entity.vel.z], [f(0.1), f(0.2), f(0.3)])
    assert.ok(entity.bedrock.aabb)
    assert.strictEqual(tick.startedOnGround, true)
    assert.strictEqual(tick.groundBlock!.name, 'ice')
    assert.strictEqual(tick.groundFriction, 0.98)
    assert.deepStrictEqual([tick.flying, tick.flyIntent], [true, true])
    assert.strictEqual(entity.bedrock.flightFrictionOverride, undefined)
    assert.deepStrictEqual([entity.isInWater, entity.isInLava], [false, false])
    assert.strictEqual(tick.control, p.control)
  })

  it('takes the caller\'s fly intent over the ability, and an empty control state when there is none', () => {
    const { tick } = beginTick(ctx(), player(undefined, { flying: false, flyIntent: true, control: undefined }))
    assert.strictEqual(tick.flyIntent, true)
    assert.deepStrictEqual(tick.control, {})
  })

  it('senses water and lets flowing water push, except a flyer', () => {
    const depth = (d: number): Block => ({ name: 'water', boundingBox: 'empty', _properties: { liquid_depth: d } })
    const stream: World = { getBlock: (pos: Vec3) => pos.y < 0 ? block('stone') : pos.y === 0 && pos.z === 0 && pos.x >= 0 && pos.x <= 5 ? depth(pos.x) : block('air') }
    const { entity } = beginTick(ctx(stream), player([2.5, 0, 0.5]))
    assert.strictEqual(entity.isInWater, true)
    assert.ok(entity.vel.x > 0)
    const flyer = beginTick(ctx(stream), player([2.5, 0, 0.5], { flying: true })).entity
    assert.strictEqual(flyer.vel.x, 0)
    const lava = beginTick(ctx(worldOf({ '0,0,0': 'lava' })), player([0.5, 0, 0.5])).entity
    assert.deepStrictEqual([lava.isInWater, lava.isInLava], [false, true])
    // a teleport tick keeps what the last move sensed, and is not pushed
    const landed = beginTick(ctx(stream), player([2.5, 0, 0.5], { isInWater: false, bedrock: { teleported: true } })).entity
    assert.deepStrictEqual([landed.isInWater, landed.vel.x], [false, 0])
  })

  it('does not jump-cool a released key, and keeps the cooldown while the queue holds jump', () => {
    const released = beginTick(ctx(FLAT), player(undefined, { jumpTicks: 5 })).entity
    assert.strictEqual(released.jumpTicks, 0)
    const queued = beginTick(ctx(FLAT), player(undefined, { jumpTicks: 5, jumpQueued: true })).entity
    assert.strictEqual(queued.jumpTicks, 4)
  })
})
