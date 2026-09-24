import assert from 'node:assert'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import { dolphinBoost, tickMovementEffects } from '../../../../lib/bedrock/tick/dolphin.ts'
import { simulatePlayer } from '../../../../lib/bedrock/tick/index.ts'
import type { World } from '../../../../lib/bedrock/types.ts'
import { ctx, FLAT, player } from '../helpers.ts'

function withDolphins (near: boolean): World & { asked: number } {
  const world = { getBlock: FLAT.getBlock, asked: 0, dolphinsNear: () => { world.asked++; return near } }
  return world
}

function start (world: World, bedrock = {}) {
  const c = ctx(world)
  const { tick, entity } = beginTick(c, player(undefined, { bedrock }))
  return { c, tick, entity }
}

describe('bedrock tick/dolphin', () => {
  it('first looks for dolphins after 60 ticks of swimming', () => {
    const world = withDolphins(true)
    const s = start(world, { swimming: true })
    for (let i = 0; i < 59; i++) dolphinBoost(s.c, s.entity, s.tick)
    assert.deepStrictEqual([world.asked, s.entity.bedrock.dolphinScanTimer, s.tick.swimSpeedMultiplier], [0, 1, 1])
    dolphinBoost(s.c, s.entity, s.tick)
    assert.deepStrictEqual([world.asked, s.entity.bedrock.dolphinBoost, s.tick.swimSpeedMultiplier], [1, 60, 2])
  })

  it('looks for dolphins swimming when the countdown runs out; one found boosts the swim speed', () => {
    const world = withDolphins(true)
    const s = start(world, { swimming: true, dolphinScanTimer: 1 })
    dolphinBoost(s.c, s.entity, s.tick)
    assert.deepStrictEqual([world.asked, s.entity.bedrock.dolphinScanTimer, s.entity.bedrock.dolphinBoost, s.tick.swimSpeedMultiplier], [1, 60, 60, 2])
    dolphinBoost(s.c, s.entity, s.tick)
    assert.deepStrictEqual([world.asked, s.entity.bedrock.dolphinScanTimer], [1, 59], 'not again until the countdown runs out')
  })

  it('does not look without a way to find dolphins, nor out of a swim', () => {
    const none = start(FLAT, { swimming: true, dolphinScanTimer: 1 })
    dolphinBoost(none.c, none.entity, none.tick)
    assert.deepStrictEqual([none.entity.bedrock.dolphinBoost, none.tick.swimSpeedMultiplier], [undefined, 1])
    const world = withDolphins(true)
    const dry = start(world, { dolphinBoost: 30 })
    dolphinBoost(dry.c, dry.entity, dry.tick)
    assert.deepStrictEqual([world.asked, dry.tick.swimSpeedMultiplier], [0, 1])
  })

  it('counts the boost down at the end of every tick', () => {
    const s = start(FLAT, { dolphinBoost: 2 })
    tickMovementEffects(s.entity)
    assert.strictEqual(s.entity.bedrock.dolphinBoost, 1)
    tickMovementEffects(s.entity)
    assert.strictEqual(s.entity.bedrock.dolphinBoost, 0)
    tickMovementEffects(s.entity)
    assert.strictEqual(s.entity.bedrock.dolphinBoost, 0)
    const p = player(undefined, { immobile: true, bedrock: { dolphinBoost: 5 } })
    simulatePlayer(ctx(FLAT), p)
    assert.strictEqual(p.bedrock!.dolphinBoost, 4, 'an immobile player too')
  })
})
