import assert from 'node:assert'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import { takePose } from '../../../../lib/bedrock/tick/take-pose.ts'
import type { Player, World } from '../../../../lib/bedrock/types.ts'
import { ctx, FLAT, player, worldOf } from '../helpers.ts'

const f = Math.fround

function start (world: World, p: Player, actions: string[] = []) {
  const c = ctx(world)
  const { tick, entity } = beginTick(c, p)
  entity.bedrock.actions = new Set(actions)
  return { c, tick, entity }
}

describe('bedrock tick/take-pose', () => {
  it('writes the glide flag and takes a first pose height', () => {
    const s = start(FLAT, player(undefined, { bedrock: { gliding: true } }))
    takePose(s.c, s.entity, s.tick)
    assert.deepStrictEqual([s.entity.elytraFlying, s.entity.bedrock.glideMirror], [true, true])
    assert.strictEqual(s.entity.bedrock.poseHeight, f(0.6))
    assert.strictEqual(s.entity.bedrock.aabb!.maxY - s.entity.bedrock.aabb!.minY, f(0.6))
  })

  it('keeps the pose height until a pose action fires', () => {
    const kept = start(FLAT, player(undefined, { bedrock: { poseHeight: 1.8, sneaking: true } }))
    kept.tick.sneaking = true
    takePose(kept.c, kept.entity, kept.tick)
    assert.strictEqual(kept.entity.bedrock.poseHeight, 1.8)
    const changed = start(FLAT, player(undefined, { bedrock: { poseHeight: 1.8, sneaking: true } }), ['startSneaking'])
    changed.tick.sneaking = true
    takePose(changed.c, changed.entity, changed.tick)
    assert.strictEqual(changed.entity.bedrock.poseHeight, 1.49)
    const crawl = start(FLAT, player(undefined, { bedrock: { poseHeight: 1.8, crawling: true } }), ['startCrawling'])
    takePose(crawl.c, crawl.entity, crawl.tick)
    assert.strictEqual(crawl.entity.bedrock.poseHeight, f(0.6))
    const swim = start(FLAT, player(undefined, { bedrock: { poseHeight: 1.8, swimming: true } }), ['startSwimming'])
    takePose(swim.c, swim.entity, swim.tick)
    assert.strictEqual(swim.entity.bedrock.poseHeight, f(0.6))
  })

  it('keeps the tick-start water state and senses lava again on the resized box', () => {
    const s = start(worldOf({ '0,1,0': 'lava' }), player())
    takePose(s.c, s.entity, s.tick)
    assert.deepStrictEqual([s.entity.bedrock.wasInWater, s.entity.bedrock.wasInLava, s.entity.isInLava], [false, true, true])
    const low = start(worldOf({ '0,1,0': 'lava' }), player(undefined, { bedrock: { swimming: true } }), ['startSwimming'])
    takePose(low.c, low.entity, low.tick)
    assert.strictEqual(low.entity.isInLava, false, 'the swim box stays under the lava')
  })

  it('reports a handled teleport once', () => {
    const s = start(FLAT, player(undefined, { bedrock: { teleported: true } }))
    takePose(s.c, s.entity, s.tick)
    assert.strictEqual(s.tick.teleported, true)
    assert.strictEqual(s.entity.bedrock.teleported, false)
    assert.ok(s.entity.bedrock.actions!.has('handledTeleport'))
    const plain = start(FLAT, player())
    takePose(plain.c, plain.entity, plain.tick)
    assert.strictEqual(plain.tick.teleported, false)
  })

  it('reports the paddles its keys pull once, on the tick after a boat it steered was left', () => {
    const s = start(FLAT, player(undefined, { bedrock: { leftSteeredVehicle: true, keys: { left: true, right: true } } as any }))
    takePose(s.c, s.entity, s.tick)
    assert.deepStrictEqual([...s.entity.bedrock.actions!].sort(), ['paddlingLeft', 'paddlingRight'])
    assert.strictEqual(s.entity.bedrock.leftSteeredVehicle, false)
    const none = start(FLAT, player(undefined, { bedrock: { leftSteeredVehicle: true } as any }))
    takePose(none.c, none.entity, none.tick)
    assert.strictEqual(none.entity.bedrock.actions!.size, 0)
  })
})
