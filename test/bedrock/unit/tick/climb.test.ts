import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import { climbBeforeMove, climbOnPush, climbOutOfLiquid } from '../../../../lib/bedrock/tick/climb.ts'
import { readInput } from '../../../../lib/bedrock/tick/intent.ts'
import type { Player, World } from '../../../../lib/bedrock/types.ts'
import { ctx, player, worldFrom, worldOf } from '../helpers.ts'

const f = Math.fround

function start (world: World, p: Player, sneaking = false, modern = true) {
  const c = ctx(world, { modern })
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

  it('rises at 0.15 on a jump off a climbable when the server restated the climbable-block flag set', () => {
    const jumping = start(worldOf({}), player(undefined, { control: { jump: true }, bedrock: { ascendRestated: true } }))
    climbBeforeMove(jumping.c, jumping.entity, jumping.tick)
    assert.deepStrictEqual([jumping.entity.vel.y, jumping.entity.jumpTicks, jumping.tick.ascendJumped, jumping.entity.bedrock.ascendRestated], [f(0.15), 10, true, undefined])
    const still = start(worldOf({}), player(undefined, { vel: new Vec3(0, -0.1, 0), bedrock: { ascendRestated: true } }))
    climbBeforeMove(still.c, still.entity, still.tick)
    assert.deepStrictEqual([still.entity.vel.y, still.tick.ascendJumped], [f(-0.1), false], 'no jump: nothing')
    const sneaking = start(worldOf({}), player(undefined, { control: { jump: true, sneak: true }, bedrock: { ascendRestated: true } }))
    climbBeforeMove(sneaking.c, sneaking.entity, sneaking.tick)
    assert.strictEqual(sneaking.tick.ascendJumped, false, 'sneaking: descending, nothing')
  })

  it('descends through powder snow at 0.15 on the sneak of the tick before over it, without the ladder hold', () => {
    const over = start(worldOf({}), player(undefined, { vel: new Vec3(0, -0.3, 0), leatherBoots: true, bedrock: { wasSneaking: true, overDescendable: true, fallDistance: 2, ascendRestated: true } }), true)
    climbBeforeMove(over.c, over.entity, over.tick)
    assert.deepStrictEqual([over.entity.vel.y, over.entity.bedrock.descendingSnow, over.entity.bedrock.fallDistance, over.entity.bedrock.ascendRestated], [f(-0.15), true, 0, undefined])
    const inside = start(worldOf({ '0,0,0': 'powder_snow' }), player(undefined, { vel: new Vec3(0, -0.1, 0), leatherBoots: true, bedrock: { wasSneaking: true, overDescendable: true } }), true)
    climbBeforeMove(inside.c, inside.entity, inside.tick)
    assert.strictEqual(inside.entity.vel.y, f(-0.15), 'inside it too: not held')
    const fresh = start(worldOf({}), player(undefined, { bedrock: { wasSneaking: false, overDescendable: true } }), true)
    climbBeforeMove(fresh.c, fresh.entity, fresh.tick)
    assert.strictEqual(fresh.entity.bedrock.descendingSnow, false, 'a sneak of this tick waits a tick')
    const inScaffold = start(SCAFFOLD, player(undefined, { bedrock: { wasSneaking: true, overDescendable: true } }), true)
    climbBeforeMove(inScaffold.c, inScaffold.entity, inScaffold.tick)
    assert.strictEqual(inScaffold.entity.bedrock.descendingSnow, false, 'scaffolding descends by its own rule')
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

  it('holds a sneaker on a ladder (not on the tick a crawl ends), and climbs on jump', () => {
    const sneak = start(LADDER, player(undefined, { vel: new Vec3(0, -0.1, 0) }), true)
    climbBeforeMove(sneak.c, sneak.entity, sneak.tick)
    assert.strictEqual(sneak.entity.vel.y, 0)
    const uncrawl = start(LADDER, player(undefined, { vel: new Vec3(0, -0.1, 0) }), true)
    uncrawl.entity.bedrock.actions = new Set(['stopCrawling'])
    climbBeforeMove(uncrawl.c, uncrawl.entity, uncrawl.tick)
    assert.strictEqual(uncrawl.entity.vel.y, f(-0.1), 'no hold on the tick a crawl ends')
    const jump = start(LADDER, player(undefined, { control: { jump: true } }))
    climbBeforeMove(jump.c, jump.entity, jump.tick)
    assert.strictEqual(jump.entity.vel.y, f(0.2))
    const queued = start(LADDER, player(undefined, { jumpQueued: true }))
    climbBeforeMove(queued.c, queued.entity, queued.tick)
    assert.strictEqual(queued.entity.vel.y, f(0.2))
  })

  it('descends scaffolding on the sneak key, and climbs it on jump while the last move left it climbable', () => {
    const down = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { sneak: true } }))
    climbBeforeMove(down.c, down.entity, down.tick)
    assert.deepStrictEqual([down.entity.bedrock.scaffoldDescend, down.entity.vel.y], [true, f(-0.15)])
    // the server restated the scaffolding flags cleared since: the sneak does not descend, once
    const held = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { sneak: true }, vel: new Vec3(0, -0.147, 0), bedrock: { scaffoldRestated: false } as any }))
    climbBeforeMove(held.c, held.entity, held.tick)
    assert.deepStrictEqual([held.entity.bedrock.scaffoldDescend, held.entity.vel.y, held.entity.bedrock.scaffoldRestated], [false, f(-0.147), undefined])
    const up = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { jump: true } }))
    climbBeforeMove(up.c, up.entity, up.tick)
    assert.strictEqual(up.entity.vel.y, f(0.15))
    const left = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { jump: true }, bedrock: { ascendable: false } as any }))
    climbBeforeMove(left.c, left.entity, left.tick)
    assert.strictEqual(left.entity.vel.y, 0, 'the last move left it out of the climbable block')
    // before 1.26.20: a move about to cross into a cell without scaffolding stops the climb
    const leaving = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control: { jump: true }, vel: new Vec3(0.6, 0, 0) }), false, false)
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

  it('descends scaffolding by the input mode: the descend key on touch, a sneak with the toggle held on a gamepad', () => {
    const descends = (control: Player['control']) => {
      const s = start(SCAFFOLD, player([0.5, 0.2, 0.5], { control }))
      climbBeforeMove(s.c, s.entity, s.tick)
      return s.entity.bedrock.scaffoldDescend
    }
    assert.deepStrictEqual([
      descends({ inputMode: 'touch', sneak: true }),
      descends({ inputMode: 'touch', raw: { descendBlock: true } }),
      descends({ inputMode: 'game_pad', sneak: true }),
      descends({ inputMode: 'game_pad', sneak: true, raw: { sneakToggleDown: true } })
    ], [false, true, false, true])
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
