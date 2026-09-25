import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { beginTick } from '../../../../lib/bedrock/tick/begin.ts'
import { decideSprint, readInput } from '../../../../lib/bedrock/tick/intent.ts'
import { flightControls, glideTick, isGliding, jump, jumpFromGround, swimSteering, travel, travelSpeed } from '../../../../lib/bedrock/tick/travel.ts'
import type { Player, World } from '../../../../lib/bedrock/types.ts'
import { ctx, FLAT, player, worldOf } from '../helpers.ts'

const f = Math.fround

function start (world: World, p: Player) {
  const c = ctx(world)
  const { tick, entity } = beginTick(c, p)
  readInput(entity, tick)
  decideSprint(c, entity, tick)
  return { c, tick, entity }
}

describe('bedrock tick/travel', () => {
  it('glides with the glide flag, out of liquids and climbables', () => {
    const s = start(FLAT, player(undefined, { elytraFlying: true }))
    assert.ok(isGliding(s.entity))
    s.entity.isInWater = true
    assert.ok(!isGliding(s.entity))
    s.entity.isInWater = false
    s.entity.bedrock.climbable = 'ladder'
    assert.ok(!isGliding(s.entity))
    assert.ok(!isGliding(start(FLAT, player()).entity))
  })

  it('glides a tick, boosted while a firework burns', () => {
    const s = start(FLAT, player(undefined, { fireworkRocketDuration: 3, bedrockPitch: -10, vel: new Vec3(0, 0, 0.5) }))
    glideTick(s.entity)
    assert.strictEqual(s.entity.fireworkRocketDuration, 1, 'two a tick')
    const plain = start(FLAT, player(undefined, { bedrockPitch: -10, vel: new Vec3(0, 0, 0.5) }))
    glideTick(plain.entity)
    assert.ok(s.entity.vel.z > plain.entity.vel.z)
  })

  it('applies the fly controls: creative hover, the vertical fly speed, survival friction', () => {
    const hover = start(FLAT, player(undefined, { vel: new Vec3(0, 0.4, 0) }))
    flightControls(hover.c, hover.entity)
    assert.deepStrictEqual([hover.entity.vel.y, hover.entity.bedrock.flightFrictionOverride], [f(f(0.4) * f(0.375)), f(0.375)])
    const up = start(FLAT, player(undefined, { gameMode: 'survival', verticalFlySpeed: 2, control: { jump: true } }))
    flightControls(up.c, up.entity)
    assert.deepStrictEqual([up.entity.vel.y, up.entity.bedrock.flightFrictionOverride], [f(2 * f(0.15000001)), f(0.75)])
    const queued = start(FLAT, player(undefined, { jumpQueued: true, control: { forward: true, raw: { wantDownSlow: true, wantUpSlow: true } } }))
    flightControls(queued.c, queued.entity)
    assert.strictEqual(queued.entity.bedrock.flightFrictionOverride, undefined)
    const down = start(FLAT, player(undefined, { control: { sneak: true } }))
    flightControls(down.c, down.entity)
    assert.strictEqual(down.entity.vel.y, f(-0.22))
  })

  describe('the jump', () => {
    it('jumps from the ground, restarting the cooldown and raising the start action', () => {
      const s = start(FLAT, player(undefined, { control: { jump: true } }))
      jump(s.c, s.entity, s.tick)
      assert.deepStrictEqual([s.entity.vel.y, s.entity.jumpTicks], [f(0.42), 10])
      assert.ok(s.entity.bedrock.actions!.has('startJumping'))
    })

    it('does not jump in the air, on cooldown, or without the key', () => {
      for (const fields of [{ onGround: false }, { jumpTicks: 3 }]) {
        const s = start(FLAT, player(undefined, { control: { jump: true }, ...fields }))
        s.entity.jumpTicks = fields.jumpTicks ?? 0
        jump(s.c, s.entity, s.tick)
        assert.strictEqual(s.entity.vel.y, 0)
      }
      const idle = start(FLAT, player())
      jump(idle.c, idle.entity, idle.tick)
      assert.strictEqual(idle.entity.vel.y, 0)
    })

    it('jumps with no cooldown counted yet, the key held from the first tick', () => {
      const s = start(FLAT, player(undefined, { control: { jump: true }, jumpTicks: undefined }))
      jump(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, f(0.42))
    })

    it('does not jump from powder snow, but restarts the cooldown', () => {
      const s = start(worldOf({ '0,0,0': 'powder_snow' }, null), player([0.5, 0, 0.5], { control: { jump: true } }))
      jumpFromGround(s.c, s.entity, s.tick)
      assert.deepStrictEqual([s.entity.vel.y, s.entity.jumpTicks], [0, 10])
    })

    it('jumps lower from honey, higher with Jump Boost, and never lowers a rising velocity', () => {
      const honey = start(worldOf({ '0,0,0': 'honey_block' }), player([0.5, f(0.9375), 0.5], { control: { jump: true } }))
      jump(honey.c, honey.entity, honey.tick)
      assert.strictEqual(honey.entity.vel.y, f(f(0.42) * f(0.60000002)))
      const boosted = start(FLAT, player(undefined, { jumpBoost: 1, control: { jump: true } }))
      jump(boosted.c, boosted.entity, boosted.tick)
      assert.strictEqual(boosted.entity.vel.y, f(f(0.42) + f(0.1)))
      const rising = start(FLAT, player(undefined, { vel: new Vec3(0, 1, 0), control: { jump: true } }))
      jump(rising.c, rising.entity, rising.tick)
      assert.strictEqual(rising.entity.vel.y, 1)
    })

    it('adds the push along the facing while sprinting, whatever the input', () => {
      const s = start(FLAT, player(undefined, { control: { jump: true, forward: true, sprint: true } }))
      jump(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.z, f(0.2), 'yaw 0 faces south')
      const back = start(FLAT, player(undefined, { control: { jump: true, back: true } }))
      back.tick.sprinting = true
      jump(back.c, back.entity, back.tick)
      assert.strictEqual(back.entity.vel.z, f(0.2), 'the facing, not the input')
      const walk = start(FLAT, player(undefined, { control: { jump: true, forward: true } }))
      jump(walk.c, walk.entity, walk.tick)
      assert.strictEqual(walk.entity.vel.z, 0, 'not sprinting')
    })

    it('rises in water and lava', () => {
      const s = start(FLAT, player(undefined, { control: { jump: true } }))
      s.entity.bedrock.wasInWater = true
      jump(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, f(0.04))
    })

    it('climbs a ladder or vine at 0.2 while jump is held, before any liquid rise', () => {
      const s = start(FLAT, player(undefined, { control: { jump: true } }))
      s.entity.bedrock.climbable = 'vine'
      jump(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, f(0.2))
      s.entity.vel.y = 0
      jump(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, f(0.2), 'held')
      const wet = start(FLAT, player(undefined, { control: { jump: true, sneak: true } }))
      wet.entity.bedrock.climbable = 'ladder'
      wet.entity.bedrock.wasInWater = true
      jump(wet.c, wet.entity, wet.tick)
      assert.strictEqual(wet.entity.vel.y, f(0.2), 'in water: no rise on top of the climb, and the sink is replaced')
    })

    it('climbs scaffolding on a fresh press only, never lowering the velocity', () => {
      const s = start(FLAT, player(undefined, { control: { jump: true }, vel: new Vec3(0, 0.3, 0) }))
      s.entity.bedrock.climbable = 'scaffolding'
      jump(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, f(0.3))
      s.entity.vel.y = 0
      jump(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, 0, 'held: the climb step climbs')
    })

    it('holds a swimmer with the head out on a climbable, as the swim pose comes first', () => {
      const s = start(FLAT, player(undefined, { control: { jump: true }, vel: new Vec3(0, 0.3, 0), bedrock: { swimming: true, headInWater: false } }))
      s.entity.bedrock.climbable = 'ladder'
      s.entity.bedrock.wasInWater = true
      jump(s.c, s.entity, s.tick)
      assert.strictEqual(s.entity.vel.y, 0)
    })
  })

  describe('the travel speed', () => {
    it('flies at the fly speed', () => {
      const s = start(FLAT, player(undefined, { flying: true, flySpeed: 0.1 }))
      assert.strictEqual(travelSpeed(s.c, s.entity, s.tick), f(0.1))
      const d = start(FLAT, player(undefined, { flying: true }))
      assert.strictEqual(travelSpeed(d.c, d.entity, d.tick), f(0.05))
    })

    it('walks at the ground speed, soul sand slower unless the boots have Soul Speed', () => {
      const ground = start(FLAT, player())
      const soul = start(worldOf({}, 0, 'soul_sand'), player())
      assert.ok(travelSpeed(soul.c, soul.entity, soul.tick) < travelSpeed(ground.c, ground.entity, ground.tick))
      const fast = start(worldOf({}, 0, 'soul_sand'), player(undefined, { soulSpeed: 1 }))
      assert.strictEqual(travelSpeed(fast.c, fast.entity, fast.tick), travelSpeed(ground.c, ground.entity, ground.tick))
    })

    it("moves at water's movement attribute in water and lava's in lava", () => {
      const attributes = { 'minecraft:underwater_movement': { base: 0.03, current: 0.03 }, 'minecraft:lava_movement': { base: 0.01, current: 0.01 } }
      const water = start(FLAT, player(undefined, { attributes }))
      water.entity.isInWater = true
      water.entity.isInLava = true
      assert.strictEqual(travelSpeed(water.c, water.entity, water.tick), f(0.03))
      const lava = start(FLAT, player(undefined, { attributes }))
      lava.entity.isInLava = true
      assert.strictEqual(travelSpeed(lava.c, lava.entity, lava.tick), f(0.01))
    })

    it('swims at 0.02, lerped toward the walking speed by Depth Strider', () => {
      const s = start(FLAT, player(undefined, { depthStrider: 3 }))
      s.entity.isInWater = true
      const plain = start(FLAT, player())
      plain.entity.isInWater = true
      assert.strictEqual(travelSpeed(plain.c, plain.entity, plain.tick), f(0.02))
      assert.ok(travelSpeed(s.c, s.entity, s.tick) > f(0.02))
    })

    it('swims twice as fast with a dolphin boost, from 0.7 to 1 of it by Depth Strider', () => {
      const s = start(FLAT, player(undefined, { depthStrider: 3 }))
      s.entity.isInWater = true
      s.tick.swimSpeedMultiplier = 2
      assert.strictEqual(travelSpeed(s.c, s.entity, s.tick), f(f(0.02) * 2))
    })
  })

  it('steers a swimmer toward the look, and stops it looking up at the surface', () => {
    const s = start(FLAT, player(undefined, { bedrock: { swimming: true } }))
    s.entity.isInWater = true
    s.entity.bedrock.view = { x: 0, y: -0.5, z: 0.86 }
    swimSteering(s.entity)
    assert.strictEqual(s.entity.vel.y, f(f(f(-0.5 - 0) * f(0.085)) + 0))
    s.entity.bedrock.view = { x: 0, y: -0.1, z: 0.99 }
    s.entity.vel.y = 0
    swimSteering(s.entity)
    assert.strictEqual(s.entity.vel.y, f(f(-0.1 * f(0.06))))
    s.entity.bedrock.view = { x: 0, y: 0.5, z: 0.86 }
    // looking up it rises only with a liquid block at the eye, even one whose surface is below the eye
    s.entity.bedrock.headInWater = false
    s.entity.bedrock.breathingInLiquid = false
    swimSteering(s.entity)
    assert.strictEqual(s.entity.vel.y, 0)
    s.entity.bedrock.breathingInLiquid = true
    swimSteering(s.entity)
    assert.strictEqual(s.entity.vel.y, f(f(0.5 * f(0.06))))
  })

  it('does not steer a jumping or dry swimmer, or a non-swimmer', () => {
    const cases: Array<[string, Partial<Player>, boolean]> = [
      ['jump held', { bedrock: { swimming: true }, control: { jump: true } }, true],
      ['jump queued', { bedrock: { swimming: true }, jumpQueued: true }, true],
      ['out of water', { bedrock: { swimming: true } }, false],
      ['not swimming', {}, true]
    ]
    for (const [name, fields, inWater] of cases) {
      const s = start(FLAT, player(undefined, fields))
      s.entity.isInWater = inWater
      s.entity.bedrock.view = { x: 0, y: -1, z: 0 }
      swimSteering(s.entity)
      assert.strictEqual(s.entity.vel.y, 0, name)
    }
  })

  it('pushes the input along the yaw at the travel speed', () => {
    const s = start(FLAT, player(undefined, { control: { forward: true } }))
    travel(s.c, s.entity, s.tick)
    assert.ok(s.entity.vel.z > 0.09 && s.entity.vel.x === 0)
  })
})
