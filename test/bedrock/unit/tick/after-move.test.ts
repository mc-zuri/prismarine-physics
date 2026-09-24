import assert from 'node:assert'
import { Vec3 } from 'vec3'
import {
  applyFriction, applyGravity, bounceGravity, gravityOf, lavaDrag, lavaGravity, verticalDecay, waterDrag, waterGravity, bubbleColumns, honeyBlocks, flightVelocity, horizontalFriction, landVelocity, lavaVelocity, levitate,
  standOnSticky, velocityAfterMove, waterVelocity
} from '../../../../lib/bedrock/tick/after-move.ts'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import type { Player, World } from '../../../../lib/bedrock/types.ts'
import { ctx, FLAT, player, worldFrom, worldOf } from '../helpers.ts'

const f = Math.fround

function start (world: World, p: Player) {
  const c = ctx(world)
  const { tick, entity } = beginTick(c, p)
  return { c, tick, entity }
}

const vel = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z)

describe('bedrock tick/after-move', () => {
  it('scales by the friction, zeroing tiny components with their sign and keeping a NaN', () => {
    assert.strictEqual(applyFriction(1, 0.5), 0.5)
    assert.ok(Object.is(applyFriction(1e-8, 0.5), 0))
    assert.ok(Object.is(applyFriction(-1e-8, 0.5), -0))
    assert.ok(Number.isNaN(applyFriction(NaN, 0.5)))
  })

  it('picks slow falling gravity only while falling, and applies gravity and the 0.98 decay', () => {
    assert.strictEqual(gravityOf(-0.1, true, 0.08, 0.01), 0.01)
    assert.strictEqual(gravityOf(0.1, true, 0.08, 0.01), 0.08)
    assert.strictEqual(gravityOf(-0.1, false, 0.08, 0.01), 0.08)
    assert.strictEqual(applyGravity(0, 0.08), f(-0.08))
    assert.strictEqual(verticalDecay(1), f(0.98))
  })

  it('drags in lava and water, and sinks in them', () => {
    const lava = { x: 1, y: 1, z: 1 }
    lavaDrag(lava)
    assert.deepStrictEqual(lava, { x: 0.5, y: 0.5, z: 0.5 })
    assert.strictEqual(lavaGravity(0), f(-0.02))
    const water = { x: 1, y: 1, z: 1 }
    waterDrag(water, true, 0)
    assert.deepStrictEqual(water, { x: f(0.9), y: f(0.8), z: f(0.9) })
    const strider = { x: 1, y: 0, z: 0 }
    waterDrag(strider, false, 3)
    assert.strictEqual(strider.x, f(f(0.6) * f(0.91)))
    const partial = { x: 1, y: 0, z: 0 }
    waterDrag(partial, false, 1)
    assert.strictEqual(partial.x, f(f(f(f(f(0.6) * f(0.91)) - f(0.8)) * f(1 / 3)) + f(0.8)), 'every step rounded to float32')
    const boosted = { x: 1, y: 0, z: 0 }
    waterDrag(boosted, false, 3, 2)
    assert.strictEqual(boosted.x, f(0.8), 'a dolphin boost skips the Depth Strider lerp')
    assert.strictEqual(waterGravity(0, false), f(-0.005))
    assert.strictEqual(waterGravity(0.2, true), 0.2)
  })

  it('levitates: 0.8 of the vertical velocity plus 0.01 per level', () => {
    const v = { x: 0, y: 1, z: 0 }
    levitate(v, 2)
    assert.strictEqual(v.y, f(f(1 * f(0.8)) + f(f(0.0099999998) * 2)))
  })

  it('applies the ground friction from a ground start, 1 from the air, and the hover override', () => {
    const ground = start(worldOf({}, 0, 'ice'), player(undefined, { vel: vel(1, 0, 1) }))
    horizontalFriction(ground.entity, ground.tick)
    assert.strictEqual(ground.entity.vel.x, f(f(f(0.98) * f(0.91))))
    const air = start(FLAT, player(undefined, { vel: vel(1, 0, 1) }))
    air.tick.startedOnGround = false
    horizontalFriction(air.entity, air.tick)
    assert.strictEqual(air.entity.vel.z, f(0.91))
    const hover = start(FLAT, player(undefined, { vel: vel(1, 0, 1) }))
    hover.tick.startedOnGround = false
    hover.entity.bedrock.flightFrictionOverride = f(0.375)
    horizontalFriction(hover.entity, hover.tick)
    assert.strictEqual(hover.entity.vel.x, f(f(f(0.375)) * f(0.91)))
  })

  it('corrects the landing tick gravity for the part of the fall spent reaching the slime', () => {
    const g = 0.08
    const vy = bounceGravity(g, { pre: -0.5, post: -0.3 }, f(0.5))
    const travelled = f(Math.sqrt(f(f(f(f(g) + f(g)) * 0.3) + f(0.25))))
    const overshoot = Math.abs(f(f(0.5 - travelled) / -f(g)))
    assert.strictEqual(vy, f(f(f(g) * f(-1 * f(1 - overshoot))) + f(0.5)))
  })

  it('halves everything in lava, then sinks 0.02 or levitates', () => {
    const lava = start(FLAT, player(undefined, { vel: vel(0.4, 0.4, 0.4) }))
    lavaVelocity(lava.entity)
    assert.deepStrictEqual([lava.entity.vel.x, lava.entity.vel.y], [f(f(0.4) * 0.5), f(f(f(0.4) * 0.5) - f(0.02))])
    const lev = start(FLAT, player(undefined, { vel: vel(0, 0.4, 0), levitation: 1 }))
    lavaVelocity(lev.entity)
    assert.strictEqual(lev.entity.vel.y, f(f(f(f(0.4) * 0.5) * f(0.8)) + f(0.0099999998)))
  })

  it('drags in water: 0.8, 0.9 sprinting, lerped by Depth Strider; sinks unless swimming', () => {
    const walk = start(FLAT, player(undefined, { vel: vel(1, 0, 0) }))
    waterVelocity(walk.entity, walk.tick)
    assert.deepStrictEqual([walk.entity.vel.x, walk.entity.vel.y], [f(0.8), f(-0.005)])
    const sprint = start(FLAT, player(undefined, { vel: vel(1, 0, 0) }))
    sprint.tick.sprinting = true
    waterVelocity(sprint.entity, sprint.tick)
    assert.strictEqual(sprint.entity.vel.x, f(0.9))
    const strider = start(FLAT, player(undefined, { vel: vel(1, 0, 0), depthStrider: 3 }))
    waterVelocity(strider.entity, strider.tick)
    assert.strictEqual(strider.entity.vel.x, f(f(0.6) * f(0.91)))
    const swimmer = start(FLAT, player(undefined, { bedrock: { swimming: true } }))
    waterVelocity(swimmer.entity, swimmer.tick)
    assert.strictEqual(swimmer.entity.vel.y, 0)
    const lev = start(FLAT, player(undefined, { levitation: 1 }))
    waterVelocity(lev.entity, lev.tick)
    assert.strictEqual(lev.entity.vel.y, f(0.0099999998))
  })

  describe('on land', () => {
    it('falls with gravity and decays', () => {
      const s = start(FLAT, player(undefined, { vel: vel(0, 0, 0) }))
      landVelocity(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, f(f(-f(0.08)) * f(0.98)))
    })

    it('falls slowly with slow falling, and only while falling', () => {
      const s = start(FLAT, player(undefined, { vel: vel(0, -0.5, 0), slowFalling: 1 }))
      landVelocity(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, f(f(f(-0.5) - f(0.01)) * f(0.98)))
      const rising = start(FLAT, player(undefined, { vel: vel(0, 0.5, 0), slowFalling: 1 }))
      landVelocity(rising.c, rising.entity, rising.tick)
      assert.strictEqual(rising.entity.vel.y, f(f(f(0.5) - f(0.08)) * f(0.98)))
    })

    it('levitates instead of falling, has no gravity descending scaffolding, and corrects a bounce', () => {
      const lev = start(FLAT, player(undefined, { levitation: 1 }))
      landVelocity(lev.c, lev.entity, lev.tick)
      assert.strictEqual(lev.entity.vel.y, f(f(0.0099999998) * f(0.98)))
      const scaffold = start(FLAT, player(undefined, { vel: vel(0, f(-0.15), 0), bedrock: { scaffoldDescend: true } }))
      landVelocity(scaffold.c, scaffold.entity, scaffold.tick)
      assert.strictEqual(scaffold.entity.vel.y, f(f(-0.15) * f(0.98)))
      const bounce = start(FLAT, player(undefined, { vel: vel(0, 0.5, 0), bedrock: { bounce: { pre: -0.5, post: -0.3 } } }))
      landVelocity(bounce.c, bounce.entity, bounce.tick)
      assert.strictEqual(bounce.entity.vel.y, f(bounceGravity(0.08, { pre: -0.5, post: -0.3 }, f(0.5)) * f(0.98)))
    })

    it('keeps the climb velocity on a push-climb, levitating if levitated', () => {
      const s = start(FLAT, player(undefined, { vel: vel(1, f(0.2), 0) }))
      s.tick.autoClimb = true
      landVelocity(s.c, s.entity, s.tick)
      assert.deepStrictEqual([s.entity.vel.x, s.entity.vel.y], [f(f(0.6) * f(0.91)), f(0.2)])
      const lev = start(FLAT, player(undefined, { vel: vel(0, f(0.2), 0), levitation: 1 }))
      lev.tick.autoClimb = true
      landVelocity(lev.c, lev.entity, lev.tick)
      assert.strictEqual(lev.entity.vel.y, f(f(f(0.2) * f(0.8)) + f(0.0099999998)))
    })
  })

  it('drags a flyer: 0.6 vertically, the flying friction horizontally', () => {
    const s = start(FLAT, player(undefined, { vel: vel(1, 1, 0) }))
    flightVelocity(s.entity, s.tick)
    assert.deepStrictEqual([s.entity.vel.x, s.entity.vel.y], [f(f(f(0.91) * f(0.6)) * 1), f(0.6)])
    const air = start(FLAT, player(undefined, { vel: vel(1, 0, 0) }))
    air.tick.startedOnGround = false
    air.entity.bedrock.flightFrictionOverride = f(0.375)
    flightVelocity(air.entity, air.tick)
    assert.strictEqual(air.entity.vel.x, f(f(0.91) * f(0.375)))
  })

  it('picks the velocity step for the travel type', () => {
    const glide = start(FLAT, player(undefined, { vel: vel(0, 1, 0), levitation: 1 }))
    glide.tick.gliding = true
    velocityAfterMove(glide.c, glide.entity, glide.tick)
    assert.strictEqual(glide.entity.vel.y, f(f(0.8) + f(0.0099999998)))
    const plainGlide = start(FLAT, player(undefined, { vel: vel(0, 1, 0) }))
    plainGlide.tick.gliding = true
    velocityAfterMove(plainGlide.c, plainGlide.entity, plainGlide.tick)
    assert.strictEqual(plainGlide.entity.vel.y, 1)
    const fly = start(FLAT, player(undefined, { vel: vel(0, 1, 0) }))
    fly.tick.flying = true
    velocityAfterMove(fly.c, fly.entity, fly.tick)
    assert.strictEqual(fly.entity.vel.y, f(0.6))
    const lava = start(FLAT, player(undefined, { vel: vel(0, 1, 0) }))
    lava.entity.isInLava = true
    velocityAfterMove(lava.c, lava.entity, lava.tick)
    assert.strictEqual(lava.entity.vel.y, f(f(0.5) - f(0.02)))
    const water = start(FLAT, player(undefined, { vel: vel(0, 1, 0) }))
    water.entity.isInWater = true
    velocityAfterMove(water.c, water.entity, water.tick)
    assert.strictEqual(water.entity.vel.y, f(f(0.8) - f(0.005)))
    const land = start(FLAT, player(undefined, { vel: vel(0, 1, 0) }))
    velocityAfterMove(land.c, land.entity, land.tick)
    assert.strictEqual(land.entity.vel.y, f(f(f(1) - f(0.08)) * f(0.98)))
  })

  it('lets a bubble column push the moved player', () => {
    const column = worldFrom((x, y, z) => x === 0 && z === 0 && y >= 0 && y <= 3 ? 'bubble_column' : (y === -1 ? 'soul_sand' : null))
    const s = start(column, player([0.5, 0, 0.5]))
    bubbleColumns(s.c, s.entity)
    assert.ok(s.entity.vel.y > 0)
    // flying as the client holds it: the server flag it has not restated yet does not count
    const stopped = start(column, player([0.5, 0, 0.5], { flying: true }))
    stopped.entity.bedrock.flying = false
    bubbleColumns(stopped.c, stopped.entity)
    assert.ok(stopped.entity.vel.y > 0)
    const flying = start(column, player([0.5, 0, 0.5]))
    flying.entity.bedrock.flying = true
    bubbleColumns(flying.c, flying.entity)
    assert.strictEqual(flying.entity.vel.y, 0)
  })

  it('slides the moved player down a honey wall, resetting its fall; not out of water', () => {
    const wall = worldOf({ '0,2,0': 'honey_block', '0,3,0': 'honey_block' }, null)
    const s = start(wall, player([0.5, 2.5, f(1.2375)], { onGround: false, vel: vel(0.1, -0.5, -0.1), bedrock: { fallDistance: 3 } }))
    honeyBlocks(s.c, s.entity)
    assert.deepStrictEqual([s.entity.vel.y, s.entity.bedrock.fallDistance], [f(-0.12), 0])
    const wet = start(wall, player([0.5, 2.5, f(1.2375)], { onGround: false, vel: vel(0.1, -0.5, -0.1) }))
    wet.entity.bedrock.wasInWater = true
    honeyBlocks(wet.c, wet.entity)
    assert.strictEqual(wet.entity.vel.y, -0.5)
    const clear = start(FLAT, player(undefined, { bedrock: { fallDistance: 3 } }))
    honeyBlocks(clear.c, clear.entity)
    assert.strictEqual(clear.entity.bedrock.fallDistance, 3)
  })

  describe('standing on slime or honey', () => {
    it('slows the horizontal velocity by 0.4 + 0.2|vy|', () => {
      const s = start(worldOf({}, 0, 'slime'), player(undefined, { vel: vel(1, 0.05, 1) }))
      standOnSticky(s.c, s.entity, s.tick)
      const k = f(f(f(0.05) * f(0.2)) + f(0.40000001))
      assert.deepStrictEqual([s.entity.vel.x, s.entity.vel.z], [f(1 * k), f(1 * k)])
    })

    it('slows a fast fall onto the block too, and takes the block at the edge over the one under the centre', () => {
      const fall = start(worldOf({}, 0, 'honey_block'), player([0.5, f(-0.0625), 0.5], { vel: vel(1, -0.5, 1) }))
      standOnSticky(fall.c, fall.entity, fall.tick)
      assert.strictEqual(fall.entity.vel.x, f(f(f(0.5) * f(0.2)) + f(0.40000001)))
      const edge = start(worldOf({ '0,-1,0': 'soul_sand', '1,-1,0': 'slime' }, null), player([0.8, 0, 0.5], { vel: vel(1, 0, 1) }))
      standOnSticky(edge.c, edge.entity, edge.tick)
      assert.strictEqual(edge.entity.vel.x, f(0.40000001))
    })

    it('does not slow a sneaker, a player off the ground or off sticky blocks, or a rising one', () => {
      const cases: Array<[World, Partial<Player>, boolean]> = [
        [worldOf({}, 0, 'slime'), { onGround: false }, false],
        [worldOf({}, 0, 'slime'), { vel: vel(1, 0.2, 1) }, false],
        [FLAT, {}, false],
        [worldOf({}, 0, 'slime'), {}, true]
      ]
      for (const [world, fields, sneaking] of cases) {
        const s = start(world, player(undefined, { vel: vel(1, 0, 1), ...fields }))
        s.tick.sneaking = sneaking
        s.entity.onGround = fields.onGround ?? true
        standOnSticky(s.c, s.entity, s.tick)
        assert.strictEqual(s.entity.vel.x, 1)
      }
    })
  })
})
