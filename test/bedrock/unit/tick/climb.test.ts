import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import { climbBeforeMove, climbOnPush, climbOutOfLiquid } from '../../../../lib/bedrock/tick/climb.ts'
import { readInput } from '../../../../lib/bedrock/tick/intent.ts'
import type { Player, World } from '../../../../lib/bedrock/types.ts'
import { ctx, player, worldFrom, worldOf } from '../helpers.ts'

const f = Math.fround

function start (world: World, p: Player, sneaking = false) {
  const c = ctx(world)
  const { tick, entity } = beginTick(c, p)
  readInput(entity, tick)
  tick.sneaking = sneaking
  return { c, tick, entity }
}

describe('bedrock tick/climb', () => {
  const LADDER = worldOf({ '0,0,0': 'ladder' })
  const SCAFFOLD = worldOf({ '0,0,0': 'scaffolding' })

  it('does nothing off a climbable', () => {
    const s = start(worldOf({}), player(undefined, { vel: new Vec3(0, -0.5, 0) }))
    climbBeforeMove(s.c, s.entity, s.tick)
    assert.deepStrictEqual([s.entity.bedrock.climbable, s.entity.bedrock.scaffoldDescend, s.entity.vel.y], [null, false, -0.5])
  })

  it('clamps a fall on a ladder to the climb speed', () => {
    const s = start(LADDER, player(undefined, { vel: new Vec3(0, -0.5, 0) }))
    climbBeforeMove(s.c, s.entity, s.tick)
    assert.strictEqual(s.entity.bedrock.climbable, 'ladder')
    assert.strictEqual(s.entity.vel.y, f(-0.2))
    const slow = start(LADDER, player(undefined, { vel: new Vec3(0, -0.1, 0) }))
    climbBeforeMove(slow.c, slow.entity, slow.tick)
    assert.strictEqual(slow.entity.vel.y, f(-0.1))
  })

  it('holds a sneaker on a ladder, and climbs on jump', () => {
    const sneak = start(LADDER, player(undefined, { vel: new Vec3(0, -0.1, 0) }), true)
    climbBeforeMove(sneak.c, sneak.entity, sneak.tick)
    assert.strictEqual(sneak.entity.vel.y, 0)
    const jump = start(LADDER, player(undefined, { control: { jump: true } }))
    climbBeforeMove(jump.c, jump.entity, jump.tick)
    assert.strictEqual(jump.entity.vel.y, f(0.2))
    const queued = start(LADDER, player(undefined, { jumpQueued: true }))
    climbBeforeMove(queued.c, queued.entity, queued.tick)
    assert.strictEqual(queued.entity.vel.y, f(0.2))
  })

  it('descends scaffolding on the sneak key, and climbs it on jump unless leaving sideways', () => {
    const down = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { sneak: true } }))
    climbBeforeMove(down.c, down.entity, down.tick)
    assert.deepStrictEqual([down.entity.bedrock.scaffoldDescend, down.entity.vel.y], [true, f(-0.15)])
    const up = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { jump: true } }))
    climbBeforeMove(up.c, up.entity, up.tick)
    assert.strictEqual(up.entity.vel.y, f(0.15))
    const leaving = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { jump: true }, vel: new Vec3(0.6, 0, 0) }))
    climbBeforeMove(leaving.c, leaving.entity, leaving.tick)
    assert.strictEqual(leaving.entity.vel.y, 0)
    const falling = start(SCAFFOLD, player([0.5, 0.2, 0.5], { vel: new Vec3(0, -0.5, 0) }))
    climbBeforeMove(falling.c, falling.entity, falling.tick)
    assert.strictEqual(falling.entity.vel.y, -0.5, 'scaffolding does not clamp a fall')
    // the server cleared the climbable-block flag since: the climb does not rise, once
    const cleared = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { jump: true }, bedrock: { ascendRestated: false } as any }))
    climbBeforeMove(cleared.c, cleared.entity, cleared.tick)
    assert.deepStrictEqual([cleared.entity.vel.y, cleared.entity.bedrock.ascendRestated], [0, undefined])
    const restated = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { jump: true }, bedrock: { ascendRestated: true } as any }))
    climbBeforeMove(restated.c, restated.entity, restated.tick)
    assert.strictEqual(restated.entity.vel.y, f(0.15))
  })

  it('climbs on pushing into a wall on a ladder, not on scaffolding or without a push', () => {
    const push = start(LADDER, player(undefined, { isCollidedHorizontally: true }))
    assert.strictEqual(climbOnPush(push.c, push.entity), true)
    assert.strictEqual(push.entity.vel.y, f(0.2))
    const free = start(LADDER, player())
    assert.strictEqual(climbOnPush(free.c, free.entity), false)
    const scaffold = start(SCAFFOLD, player(undefined, { isCollidedHorizontally: true }))
    assert.strictEqual(climbOnPush(scaffold.c, scaffold.entity), false)
    const nothing = start(worldOf({}), player(undefined, { isCollidedHorizontally: true }))
    assert.strictEqual(climbOnPush(nothing.c, nothing.entity), false)
  })

  describe('climbing out of a liquid', () => {
    // water up to y = 1 with a ledge at x = 1 whose top is at y = 1
    const pool = worldFrom((x, y) => y < 0 ? 'stone' : x >= 1 && y === 0 ? 'stone' : y === 0 ? 'water' : null)
    const swimmer = (fields: Partial<Player> = {}) => player([0.7, 0.5, 0.5], { isInWater: true, isCollidedHorizontally: true, vel: new Vec3(0.02, 0, 0), ...fields })

    it('boosts a swimmer pushing against a ledge with room above it', () => {
      const s = start(pool, swimmer())
      s.entity.isInWater = true
      climbOutOfLiquid(s.c, s.entity, 0.5)
      assert.strictEqual(s.entity.vel.y, f(0.3))
    })

    it('does not boost out of a liquid, without a push, into liquid, or into a block', () => {
      const dry = start(pool, swimmer())
      dry.entity.isInWater = false
      climbOutOfLiquid(dry.c, dry.entity, 0.5)
      assert.strictEqual(dry.entity.vel.y, 0)
      const loose = start(pool, swimmer())
      loose.entity.isInWater = true
      loose.entity.isCollidedHorizontally = false
      climbOutOfLiquid(loose.c, loose.entity, 0.5)
      assert.strictEqual(loose.entity.vel.y, 0)
      const deep = start(worldFrom((x, y) => y < 0 ? 'stone' : x >= 1 && y === 0 ? 'stone' : y <= 2 ? 'water' : null), swimmer())
      deep.entity.isInWater = true
      climbOutOfLiquid(deep.c, deep.entity, 0.5)
      assert.strictEqual(deep.entity.vel.y, 0)
      const wall = start(worldFrom((x, y) => y < 0 ? 'stone' : x >= 1 && y <= 2 ? 'stone' : y === 0 ? 'water' : null), swimmer())
      wall.entity.isInWater = true
      climbOutOfLiquid(wall.c, wall.entity, 0.5)
      assert.strictEqual(wall.entity.vel.y, 0)
    })

    it('climbs out of lava the same way', () => {
      const s = start(pool, swimmer())
      s.entity.isInWater = false
      s.entity.isInLava = true
      climbOutOfLiquid(s.c, s.entity, 0.5)
      assert.strictEqual(s.entity.vel.y, f(0.3))
    })
  })
})
