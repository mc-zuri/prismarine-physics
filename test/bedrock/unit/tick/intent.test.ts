import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import { decideFlight, decidePose, decideSprint, poseRoom, readInput } from '../../../../lib/bedrock/tick/intent.ts'
import type { Player, World } from '../../../../lib/bedrock/types.ts'
import { ctx, FLAT, player, worldFrom, worldOf } from '../helpers.ts'

const f = Math.fround
const KEY = 'minecraft:movement'

function start (world: World, p: Player) {
  const c = ctx(world)
  const { tick, entity } = beginTick(c, p)
  readInput(entity, tick)
  return { c, tick, entity }
}

describe('bedrock tick/intent', () => {
  it('reads the input, keeping the keys for the next tick\'s edges', () => {
    const { tick, entity } = start(FLAT, player(undefined, { control: { forward: true, sneak: true } }))
    assert.deepStrictEqual(entity.bedrock.input!.move, { x: 0, z: f(0.30000001) })
    assert.strictEqual(entity.bedrock.keys!.sneakPressed, true)
    assert.deepStrictEqual(tick.travel, { x: 0, z: f(f(0.30000001) * f(0.98)) })
  })

  it('starts a sprint and puts the boost on the movement attribute', () => {
    const p = player(undefined, { control: { forward: true, sprint: true }, attributes: { [KEY]: { base: 0.1, current: 0.1 } } })
    const { c, tick, entity } = start(FLAT, p)
    const request = decideSprint(c, entity, tick)
    assert.strictEqual(request.start, true)
    assert.strictEqual(tick.sprinting, true)
    assert.strictEqual(entity.attributes![KEY]!.current, f(0.1 * f(1.3)))
    assert.ok(entity.bedrock.actions!.has('startSprinting'))
  })

  it('scales the move of a player using an item to 0.1225, not in a vehicle', () => {
    const using = start(FLAT, player(undefined, { usingItem: true, control: { forward: true } }))
    assert.deepStrictEqual(using.entity.bedrock.input!.move, { x: 0, z: f(0.122499995) })
    assert.deepStrictEqual(using.tick.travel, { x: 0, z: f(f(0.122499995) * f(0.98)) })
    const riding = start(FLAT, player(undefined, { usingItem: true, control: { forward: true }, vehicle: { id: 1n, kind: 'minecart', pos: new Vec3(0, 0, 0), vel: new Vec3(0, 0, 0), yaw: 0, pitch: 0, predicted: false, seat: { x: 0, y: 0, z: 0 } } }))
    assert.deepStrictEqual(riding.entity.bedrock.input!.move, { x: 0, z: 1 })
  })

  it('raises the start of an item use on its tick, once', () => {
    const { c, tick, entity } = start(FLAT, player(undefined, { itemUseStarted: true }))
    decideSprint(c, entity, tick)
    assert.deepStrictEqual([entity.bedrock.actions!.has('startUsingItem'), entity.itemUseStarted], [true, false])
    decideSprint(c, entity, tick)
    assert.strictEqual(entity.bedrock.actions!.has('startUsingItem'), false)
  })

  it('stops a sprint and takes the boost off', () => {
    const p = player(undefined, { control: {}, attributes: { [KEY]: { base: 0.1, current: f(0.13) } }, bedrock: { sprinting: true, sprintBoost: true } })
    const { c, tick, entity } = start(FLAT, p)
    assert.strictEqual(decideSprint(c, entity, tick).stop, true)
    assert.strictEqual(entity.attributes![KEY]!.current, 0.1)
    assert.strictEqual(tick.sprinting, false)
  })

  it('sets the jumping flag from jump or ascend-block, never while flying', () => {
    const jumper = start(FLAT, player(undefined, { control: { jump: true } }))
    decideSprint(jumper.c, jumper.entity, jumper.tick)
    assert.strictEqual(jumper.entity.bedrock.jumpingFlag, true)
    const climber = start(FLAT, player(undefined, { control: { raw: { ascendBlock: true } } }))
    decideSprint(climber.c, climber.entity, climber.tick)
    assert.strictEqual(climber.entity.bedrock.jumpingFlag, true)
    const flyer = start(FLAT, player(undefined, { flying: true, control: { jump: true } }))
    decideSprint(flyer.c, flyer.entity, flyer.tick)
    assert.strictEqual(flyer.entity.bedrock.jumpingFlag, false)
  })

  it('probes the room above the box', () => {
    const low = start(worldOf({ '0,1,0': 'stone' }), player())
    assert.deepStrictEqual(poseRoom(low.c, low.entity), { stand: false, sneak: false, crawl: true })
    const open = start(FLAT, player())
    assert.deepStrictEqual(poseRoom(open.c, open.entity), { stand: true, sneak: true, crawl: true })
  })

  it('toggles flying on a double jump and starts a glide in the air', () => {
    const flyer = start(FLAT, player(undefined, { mayFly: true, control: { jump: true }, bedrock: { jumpTriggerTime: 4, flyTriggerSource: 1 } }))
    decideSprint(flyer.c, flyer.entity, flyer.tick)
    assert.deepStrictEqual(decideFlight(flyer.c, flyer.entity, flyer.tick), { flyIntent: true, glideIntent: false })
    assert.strictEqual(flyer.entity.bedrock.jumpTriggerTime, 0)
    assert.strictEqual(flyer.entity.bedrock.flying, true, 'the client flies from the next tick')
    const lander = start(FLAT, player(undefined, { mayFly: true, flying: true, control: { jump: true }, bedrock: { jumpTriggerTime: 4, flyTriggerSource: 1 } }))
    decideSprint(lander.c, lander.entity, lander.tick)
    assert.strictEqual(decideFlight(lander.c, lander.entity, lander.tick).flyIntent, false)
    assert.strictEqual(lander.entity.bedrock.flying, false)

    const glider = start(worldOf({}, null), player([0.5, 5, 0.5], { onGround: false, elytraEquipped: true, control: { jump: true } }))
    decideSprint(glider.c, glider.entity, glider.tick)
    assert.deepStrictEqual(decideFlight(glider.c, glider.entity, glider.tick), { flyIntent: false, glideIntent: true })
  })

  it('lifts a creative glider holding jump', () => {
    const p = player([0.5, 20, 0.5], { onGround: false, elytraEquipped: true, instabuild: true, control: { jump: true }, bedrock: { gliding: true, fallFlyTicks: 11, wasJumping: true } })
    const s = start(worldOf({}, null), p)
    decideSprint(s.c, s.entity, s.tick)
    decideFlight(s.c, s.entity, s.tick)
    assert.strictEqual(s.entity.vel.y, f(0.1))
    assert.strictEqual(s.entity.bedrock.fallFlyTicks, 12)
  })

  it('stops a glide on a climbable', () => {
    const p = player([0.5, 1, 0.5], { onGround: false, elytraEquipped: true, bedrock: { gliding: true } })
    const s = start(worldOf({ '0,1,0': 'ladder' }, null), p)
    decideSprint(s.c, s.entity, s.tick)
    assert.strictEqual(decideFlight(s.c, s.entity, s.tick).glideIntent, false)
  })

  it('decides the pose: a sneak key sneaks, and the pose amount starts from the swim flag', () => {
    const s = start(FLAT, player(undefined, { control: { sneak: true } }))
    const sprint = decideSprint(s.c, s.entity, s.tick)
    decidePose(s.c, s.entity, s.tick, sprint)
    assert.strictEqual(s.entity.bedrock.sneaking, true)
    assert.strictEqual(s.tick.sneaking, true)
    assert.strictEqual(s.entity.bedrock.poseAmount, 0)
    assert.strictEqual(s.entity.isSwimming, false)
    assert.strictEqual(s.entity.bedrock.headInWater, false)
    assert.ok(s.entity.bedrock.view)
  })

  it('steps a kept pose amount from the swimming and crawling flags', () => {
    const swim = start(FLAT, player(undefined, { bedrock: { poseAmount: 0.5, crawling: true } }))
    decidePose(swim.c, swim.entity, swim.tick, decideSprint(swim.c, swim.entity, swim.tick))
    assert.strictEqual(swim.entity.bedrock.poseAmount, f(0.5 + f(0.1)))
    const first = start(FLAT, player(undefined, { bedrock: { swimming: true } }))
    decidePose(first.c, first.entity, first.tick, decideSprint(first.c, first.entity, first.tick))
    assert.strictEqual(first.entity.bedrock.poseAmount, 1)
  })

  it('starts a swim for a submerged sprinter and stops it out of the water', () => {
    const sea = worldFrom((_x, y) => y < 0 ? 'stone' : y < 4 ? 'water' : null)
    const diver = start(sea, player([0.5, 0, 0.5], { control: { forward: true, sprint: true } }))
    decidePose(diver.c, diver.entity, diver.tick, decideSprint(diver.c, diver.entity, diver.tick))
    assert.ok(diver.entity.bedrock.actions!.has('startSwimming'))
    assert.strictEqual(diver.entity.isSwimming, true)

    const beached = start(FLAT, player(undefined, { bedrock: { swimming: true, sprinting: true } }))
    decidePose(beached.c, beached.entity, beached.tick, decideSprint(beached.c, beached.entity, beached.tick))
    assert.ok(beached.entity.bedrock.actions!.has('stopSwimming'))
  })

  it('stands a spectator up', () => {
    const s = start(worldOf({ '0,1,0': 'stone' }), player(undefined, { gameMode: 'spectator', bedrock: { crawling: true } }))
    decidePose(s.c, s.entity, s.tick, decideSprint(s.c, s.entity, s.tick))
    assert.strictEqual(s.entity.bedrock.crawling, false)
  })
})
