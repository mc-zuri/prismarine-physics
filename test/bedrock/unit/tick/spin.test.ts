import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import { spinAttack } from '../../../../lib/bedrock/tick/spin.ts'
import { simulatePlayer } from '../../../../lib/bedrock/tick/index.ts'
import type { Player } from '../../../../lib/bedrock/types.ts'
import { ctx, EMPTY, FLAT, player } from '../helpers.ts'

const f = Math.fround

function start (p: Player, world = FLAT) {
  const c = ctx(world)
  const { tick, entity } = beginTick(c, p)
  entity.bedrock.actions = new Set()
  return { c, tick, entity }
}

describe('bedrock tick/spin', () => {
  it('launches on request, adding the impulse and raising the start action', () => {
    const s = start(player([0.5, 5, 0.5], { onGround: false, riptideLaunch: 1, bedrockPitch: 0, bedrockYaw: 0, vel: new Vec3(0, -0.5, 0) }), EMPTY)
    spinAttack(s.entity, s.tick)
    assert.deepStrictEqual([s.entity.vel.x, s.entity.vel.y, s.entity.vel.z], [0, f(-0.5), f(1.5)])
    assert.deepStrictEqual([s.entity.bedrock.spinning, s.entity.bedrock.spinTicks, s.entity.riptideLaunch], [true, 1, 0])
    assert.ok(s.entity.bedrock.actions!.has('startSpinAttack'))
  })

  it('launches in water with the head out, and not at all when immobile', () => {
    const wet = start(player(undefined, { riptideLaunch: 1, bedrockPitch: -90, bedrockYaw: 0, bedrock: { headInWater: false } }))
    wet.entity.isInWater = true
    spinAttack(wet.entity, wet.tick)
    assert.strictEqual(wet.entity.vel.y, f(f(f(1.5) / f(0.80000001)) * f(0.98000002)))
    const held = start(player(undefined, { riptideLaunch: 2, immobile: true }))
    spinAttack(held.entity, held.tick)
    assert.deepStrictEqual([held.entity.vel.x, held.entity.vel.y, held.entity.vel.z, held.entity.bedrock.spinning], [0, 0, 0, true])
  })

  it('bounces off the reported hits and ends the spin', () => {
    const s = start(player(undefined, { spinHits: 1, vel: new Vec3(0, 0, 1), bedrock: { spinning: true, spinTicks: 3 } }))
    spinAttack(s.entity, s.tick)
    assert.deepStrictEqual([s.entity.vel.z, s.entity.bedrock.spinning, s.entity.spinHits], [f(-0.2), false, 0])
    assert.ok(s.entity.bedrock.actions!.has('stopSpinAttack'))
  })

  it('does nothing without a spin or a launch', () => {
    const s = start(player())
    spinAttack(s.entity, s.tick)
    assert.deepStrictEqual([s.entity.bedrock.spinning, s.entity.bedrock.spinTicks, s.entity.bedrock.actions!.size], [false, 0, 0])
  })

  it('takes the horizontal pose while spinning and stands again when it ends', () => {
    const c = ctx(EMPTY)
    const p = player([0.5, 10, 0.5], { onGround: false, riptideLaunch: 1, bedrockPitch: -90, bedrockYaw: 0 })
    simulatePlayer(c, p)
    assert.strictEqual(p.bedrock!.poseHeight, f(0.6))
    for (let i = 0; i < 19; i++) simulatePlayer(c, p)
    assert.deepStrictEqual([p.bedrock!.spinning, p.bedrock!.poseHeight], [false, 1.8])
  })
})
