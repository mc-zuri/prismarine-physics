import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import { readInput } from '../../../../lib/bedrock/tick/intent.ts'
import { capMoveSpeed, clampMoveLength, landingBounce, requestMove, settleCollisions, slowDown, sweepMove } from '../../../../lib/bedrock/tick/move.ts'
import type { Player, World } from '../../../../lib/bedrock/types.ts'
import { ctx, FLAT, player, worldOf } from '../helpers.ts'

const f = Math.fround

function start (world: World, p: Player, modern = true) {
  const c = ctx(world, { modern })
  const { tick, entity } = beginTick(c, p)
  readInput(entity, tick)
  entity.bedrock.actions = new Set()
  return { c, tick, entity }
}

// Runs the move steps of a tick.
function move (s: ReturnType<typeof start>): void {
  slowDown(s.c, s.entity, s.tick)
  requestMove(s.c, s.entity, s.tick)
  sweepMove(s.c, s.entity, s.tick)
  settleCollisions(s.c, s.entity, s.tick)
}

describe('bedrock tick/move', () => {
  it('drops a move beyond 500 on any lane, or of an immobile player', () => {
    assert.deepStrictEqual(capMoveSpeed({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 })
    assert.deepStrictEqual(capMoveSpeed({ x: 501, y: 0, z: 0 }), { x: 0, y: 0, z: 0 })
    assert.deepStrictEqual(capMoveSpeed({ x: 0, y: -Infinity, z: 0 }), { x: 0, y: 0, z: 0 })
    assert.deepStrictEqual(capMoveSpeed({ x: 0, y: 0, z: 600 }), { x: 0, y: 0, z: 0 })
    assert.deepStrictEqual(capMoveSpeed({ x: 1, y: 0, z: 0 }, true), { x: 0, y: 0, z: 0 })
    assert.ok(Number.isNaN(capMoveSpeed({ x: NaN, y: 0, z: 0 }).x), 'a NaN is not beyond 500')
  })

  it('scales a move longer than 16 down to 16', () => {
    assert.deepStrictEqual(clampMoveLength({ x: 3, y: 4, z: 0 }), { x: 3, y: 4, z: 0 })
    const long = clampMoveLength({ x: 30, y: 40, z: 0 })
    assert.deepStrictEqual(long, { x: f(f(30 / 50) * 16), y: f(f(40 / 50) * 16), z: 0 })
    assert.ok(Number.isNaN(clampMoveLength({ x: NaN, y: 0, z: 0 }).x), 'a NaN length is not over 16')
  })

  it('slows the move inside the blocks of the previous tick, else the current ones', () => {
    const web = start(worldOf({ '0,0,0': 'cobweb' }), player(undefined, { vel: new Vec3(0.4, 0, 0) }))
    slowDown(web.c, web.entity, web.tick)
    assert.deepStrictEqual([web.tick.slowed, web.entity.vel.x], [true, f(f(0.4) * f(0.25))])
    const pending = start(FLAT, player(undefined, { vel: new Vec3(0.4, 0, 0), bedrock: { pendingSlowdowns: new Set(['powder_snow'] as const) } }))
    slowDown(pending.c, pending.entity, pending.tick)
    assert.strictEqual(pending.entity.vel.x, f(f(0.4) * f(0.9)))
    const weaver = start(worldOf({ '0,0,0': 'cobweb' }), player(undefined, { weaving: 1, vel: new Vec3(0.4, 0, 0) }))
    slowDown(weaver.c, weaver.entity, weaver.tick)
    assert.strictEqual(weaver.entity.vel.x, f(f(0.4) * f(0.5)))
    const free = start(FLAT, player(undefined, { vel: new Vec3(0.4, 0, 0) }))
    slowDown(free.c, free.entity, free.tick)
    assert.deepStrictEqual([free.tick.slowed, free.entity.vel.x], [false, f(0.4)])
  })

  it('requests the velocity, nudging a grounded flyer off the ground', () => {
    const s = start(FLAT, player(undefined, { flying: true, vel: new Vec3(0.1, 0, 0) }))
    requestMove(s.c, s.entity, s.tick)
    assert.strictEqual(s.tick.requested.y, 1.401298464324817e-45)
    assert.deepStrictEqual(s.entity.bedrock.lastRequested, { x: f(0.1), y: 1.401298464324817e-45, z: 0 })
    const airborne = start(FLAT, player(undefined, { flying: true, onGround: false }))
    requestMove(airborne.c, airborne.entity, airborne.tick)
    assert.strictEqual(airborne.tick.requested.y, 0)
  })

  it('keeps a sneaker on the ground off the edge', () => {
    const world = worldOf({ '0,-1,0': 'stone' }, null)
    const s = start(world, player([1.2, 0, 0.5], { vel: new Vec3(0.3, 0, 0) }))
    s.tick.sneaking = true
    requestMove(s.c, s.entity, s.tick)
    assert.ok(s.tick.requested.x < 0.3)
  })

  it('sweeps the box and moves the player with it', () => {
    const s = start(worldOf({ '1,0,0': 'stone' }), player(undefined, { vel: new Vec3(0.5, 0, 0) }))
    requestMove(s.c, s.entity, s.tick)
    sweepMove(s.c, s.entity, s.tick)
    assert.strictEqual(s.tick.preMoveY, 0)
    assert.deepStrictEqual(s.entity.bedrock.lastPos, { x: 0.5, y: 0, z: 0.5 })
    assert.strictEqual(s.entity.pos.x, f((s.entity.bedrock.aabb!.minX + s.entity.bedrock.aabb!.maxX) * 0.5))
    assert.ok(s.entity.pos.x > 0.69 && s.entity.pos.x < 0.71)
  })

  it('marks the player penetrating a block, stuck on a second move, and free again', () => {
    // a slab reaching 0.1 into the feet: the sweep pushes the player out and counts the penetration
    const world = worldOf({ '0,-1,0': 'stone', '0,0,0': 'snow_layer' }, null)
    const s = start(world, player([0.5, 0.1, 0.5], { vel: new Vec3(0, -0.1, 0) }))
    requestMove(s.c, s.entity, s.tick)
    sweepMove(s.c, s.entity, s.tick)
    assert.strictEqual(s.entity.bedrock.depenetrationBits, 2)
    s.entity.bedrock.depenetrationBits = 2
    s.entity.bedrock.pushTowardsClosestSpace = true
    s.entity.bedrock.aabb!.minY = f(0.1)
    sweepMove(s.c, s.entity, s.tick)
    assert.strictEqual(s.entity.bedrock.depenetrationBits, 2 | 4 | 16)
    const free = start(FLAT, player(undefined, { bedrock: { depenetrationBits: 6 } }))
    requestMove(free.c, free.entity, free.tick)
    sweepMove(free.c, free.entity, free.tick)
    assert.strictEqual(free.entity.bedrock.depenetrationBits, 0)
  })

  it('stops the blocked axes and lands on a floor', () => {
    const s = start(worldOf({ '1,0,0': 'stone' }), player([0.5, 0.05, 0.5], { onGround: false, vel: new Vec3(0.5, -0.1, 0.2) }))
    move(s)
    assert.deepStrictEqual([s.entity.vel.x, s.entity.vel.y, s.entity.vel.z], [0, 0, f(0.2)])
    assert.deepStrictEqual([s.entity.isCollidedHorizontally, s.entity.isCollidedVertically, s.entity.onGround], [true, true, true])
    const ceiling = start(worldOf({ '0,2,0': 'stone' }), player([0.5, 0.1, 0.5], { onGround: false, vel: new Vec3(0, 0.3, 0) }))
    move(ceiling)
    assert.deepStrictEqual([ceiling.entity.isCollidedVertically, ceiling.entity.onGround], [true, false])
    const zWall = start(worldOf({ '0,0,1': 'stone' }), player(undefined, { vel: new Vec3(0, 0, 0.5) }))
    move(zWall)
    assert.deepStrictEqual([zWall.entity.vel.z, zWall.entity.isCollidedHorizontally], [0, true])
  })

  it('keeps the ground flag through a move with no vertical part, and loses it on a fall', () => {
    const level = start(FLAT, player(undefined, { vel: new Vec3(0.1, 0, 0) }))
    move(level)
    assert.strictEqual(level.entity.onGround, true)
    const falling = start(worldOf({}, null), player([0.5, 5, 0.5], { vel: new Vec3(0, -0.1, 0) }))
    move(falling)
    assert.strictEqual(falling.entity.onGround, false)
  })

  it('drops the velocity after a slowed move, and notes the cobweb', () => {
    const s = start(worldOf({ '0,0,0': 'cobweb' }), player(undefined, { vel: new Vec3(0.4, 0, 0) }))
    move(s)
    assert.deepStrictEqual([s.entity.vel.x, s.entity.vel.y, s.entity.vel.z, s.entity.isInWeb], [0, 0, 0, true])
  })

  it('catches a fall onto scaffolding as a landing', () => {
    const column = worldOf({ '0,0,0': 'scaffolding', '0,1,0': 'scaffolding' }, null)
    const s = start(column, player([0.5, 2.3, 0.5], { onGround: false, vel: new Vec3(0, f(-0.6), 0) }))
    move(s)
    assert.deepStrictEqual([s.entity.pos.y, s.entity.isCollidedVertically, s.entity.onGround], [2, true, true])
  })

  describe('bouncing on slime', () => {
    const SLIME = worldOf({}, 0, 'slime')
    const land = (vy: number, modern = true, fields: Partial<Player> = {}) => {
      const s = start(SLIME, player([0.5, 0.01, 0.5], { onGround: false, vel: new Vec3(0, vy, 0), ...fields }), modern)
      move(s)
      return s
    }

    it('rebounds with the fall speed, remembering the bounce from 1.26.20', () => {
      const s = land(-0.5)
      assert.strictEqual(s.entity.vel.y, f(0.5))
      assert.deepStrictEqual(s.entity.bedrock.bounce, { pre: f(-0.5), post: f(-0.01) })
      const old = land(-0.5, false)
      assert.strictEqual(old.entity.vel.y, f(0.5))
      assert.strictEqual(old.entity.bedrock.bounce, null)
    })

    it('does not rebound off a thin block whose centre is above the plane under the feet, or off stone before 1.26.20', () => {
      const thin = start(worldOf({ '0,0,0': 'snow_layer' }, null), player([0.5, 0.3, 0.5], { onGround: false, vel: new Vec3(0, -0.5, 0) }))
      move(thin)
      assert.deepStrictEqual([thin.entity.isCollidedVertically, thin.entity.vel.y], [true, 0])
      const old = start(FLAT, player([0.5, 0.01, 0.5], { onGround: false, vel: new Vec3(0, -0.5, 0) }), false)
      move(old)
      assert.strictEqual(old.entity.vel.y, 0)
    })

    it('rebounds three quarters off a bed, and not off honey', () => {
      const bed = start(worldOf({}, 0, 'bed'), player([0.5, 0.01, 0.5], { onGround: false, vel: new Vec3(0, -0.5, 0) }))
      move(bed)
      assert.strictEqual(bed.entity.vel.y, f(f(0.75) * f(0.5)))
      const honey = start(worldOf({}, 0, 'honey_block'), player([0.5, f(-0.0525), 0.5], { onGround: false, vel: new Vec3(0, -0.5, 0) }))
      move(honey)
      assert.strictEqual(honey.entity.vel.y, 0)
    })

    it('does not rebound a slow landing from 1.26.20, and does on older versions', () => {
      assert.strictEqual(land(-0.05).entity.vel.y, 0)
      assert.strictEqual(land(-0.05, false).entity.vel.y, f(0.05))
    })

    it('does not rebound a sneaker, or a landing off slime', () => {
      const s = start(SLIME, player([0.5, 0.01, 0.5], { onGround: false, vel: new Vec3(0, -0.5, 0) }))
      s.tick.sneaking = true
      move(s)
      assert.strictEqual(s.entity.vel.y, 0)
      const stone = start(FLAT, player([0.5, 0.01, 0.5], { onGround: false, vel: new Vec3(0, -0.5, 0) }))
      move(stone)
      assert.strictEqual(stone.entity.vel.y, 0)
      assert.strictEqual(landingBounce(stone.c, stone.entity, { ...stone.tick, requested: { x: 0, y: 0.3, z: 0 } }), 0, 'a rise into a ceiling')
    })
  })
})
