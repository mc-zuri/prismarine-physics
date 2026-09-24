import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { buildPlayerAuthInput } from '../../../../lib/bedrock/network/input-packet.ts'
import { simulatePlayer } from '../../../../lib/bedrock/tick/index.ts'
import { dismount, moveVehicle, newBoatState, paddle, seatPosition, simulateBoat, vehicleBox, type Vehicle } from '../../../../lib/bedrock/tick/vehicle.ts'
import { ctx, EMPTY, FLAT, player, worldOf } from '../helpers.ts'

const f = Math.fround

function boat (fields: Partial<Vehicle> = {}): Vehicle {
  return { id: 5n, kind: 'boat', pos: new Vec3(0.5, f(0.375), 0.5), vel: new Vec3(0, 0, 0), yaw: 0, pitch: 0, predicted: true, seat: { x: 0, y: f(1.02001), z: 0 }, onGround: true, ...fields }
}

describe('bedrock tick/vehicle', () => {
  it('builds the box around the position, the floor 0.375 below it', () => {
    const box = vehicleBox(boat())
    assert.deepStrictEqual([box.minY, box.maxY, box.minX, box.maxX], [0, f(0.455), f(0.5 - f(0.7)), f(0.5 + f(0.7))])
    const wide = vehicleBox(boat({ width: 2, height: 1 }))
    assert.deepStrictEqual([wide.minX, wide.maxY], [-0.5, 1])
  })

  it('paddles with a force from the move, or with the rowing buttons, counting its ticks', () => {
    const state = newBoatState()
    state.localTick = 10
    paddle(state, { move: { x: 0, z: 1 }, up: false })
    assert.deepStrictEqual([state.paddles[0].force, state.localTick], [3, 11])
    paddle(state, { move: { x: 0, z: 0 }, up: false, rowing: [true, false] })
    assert.deepStrictEqual([state.paddles[0].force, state.paddles[1].force], [3, 1.5], 'the released paddle halves')
  })

  it('keeps the moved box from tick to tick, its corners float32', () => {
    const v = boat({ vel: new Vec3(0.0667260, 0, 0), onGround: false })
    moveVehicle(ctx(EMPTY), v)
    const kept = v.box!
    assert.strictEqual(kept.minX, f(f(0.5 - f(0.7)) + f(0.0667260)))
    v.vel.set(0.1, 0, 0)
    moveVehicle(ctx(EMPTY), v)
    assert.strictEqual(v.box!.minX, f(kept.minX + 0.1), 'moved from the kept box, not rebuilt from the position')
  })

  it('moves through the blocks, stopping a blocked axis and landing', () => {
    const v = boat({ pos: new Vec3(0.5, f(1.375), 0.5), vel: new Vec3(0.2, -1.5, 0), onGround: false })
    moveVehicle(ctx(FLAT), v)
    assert.deepStrictEqual([v.pos.y, v.vel.y, v.onGround, v.isCollidedVertically], [f(0.375), 0, true, true])
    assert.strictEqual(v.vel.x, 0.2)
    const wall = boat({ vel: new Vec3(1, 0, 0) })
    moveVehicle(ctx(worldOf({ '1,0,0': 'stone' })), wall)
    assert.deepStrictEqual([wall.vel.x, wall.isCollidedHorizontally], [0, true])
  })

  it('drives a boat on the ground: paddles, friction, control, the move and gravity', () => {
    const v = boat()
    const drive = () => simulateBoat(ctx(FLAT), v, { move: { x: 0, z: 1 }, up: false }, () => 0.5)
    for (let i = 0; i < 12; i++) drive()
    assert.ok(v.pos.x > 0.5, 'forward is +x at yaw 0')
    assert.strictEqual(v.pos.y, f(0.375))
    assert.strictEqual(v.vel.y, f(f(-0.04) * f(0.98)), 'gravity after the landing each tick')
  })

  it('floats, resets the out-of-control count; resurfacing counts it, and past 24 the paddles do nothing', () => {
    const water = worldOf({ '0,0,0': 'water', '0,-1,0': 'water', '0,1,0': 'water' })
    const floating = boat({ pos: new Vec3(0.5, 0.9, 0.5), onGround: false, boat: { ...newBoatState(), outOfControlTicks: 7 } })
    simulateBoat(ctx(worldOf({ '0,0,0': 'water' })), floating, { move: { x: 0, z: 0 }, up: false })
    assert.strictEqual(floating.boat!.outOfControlTicks, 0)
    const under = boat({ pos: new Vec3(0.5, 0.5, 0.5), onGround: false, boat: { ...newBoatState(), outOfControlTicks: 24 } })
    simulateBoat(ctx(water), under, { move: { x: 0, z: 1 }, up: false }, () => 0.5)
    assert.strictEqual(under.boat!.outOfControlTicks, 25)
    assert.strictEqual(under.yaw, 0)
    const noGravity = boat({ boat: { ...newBoatState(), buoyancy: { ...newBoatState().buoyancy, applyGravity: false } } })
    simulateBoat(ctx(FLAT), noGravity, { move: { x: 0, z: 0 }, up: false })
    assert.strictEqual(noGravity.vel.y, 0)
    const fresh = boat()
    simulateBoat(ctx(FLAT), fresh, { move: { x: 0, z: 0 }, up: false })
    assert.ok(fresh.boat, 'a boat state is made on the first tick')
  })

  it('seats the rider at the seat turned by the yaw', () => {
    const seat = seatPosition(boat({ seat: { x: 1, y: 1, z: 0 }, yaw: 90 }))
    assert.ok(Math.abs(seat.x - 0.5) < 1e-6 && Math.abs(seat.z - 1.5) < 1e-6)
    assert.strictEqual(seat.y, f(f(0.375) + 1))
  })

  describe('riding', () => {
    it('steers a predicted boat and sits in it, neither walking nor colliding', () => {
      const p = player([0.5, 0, 0.5], { vehicle: boat(), control: { forward: true }, bigWaveRoll: () => 0.5, vel: new Vec3(1, 1, 1) })
      for (let i = 0; i < 12; i++) simulatePlayer(ctx(FLAT), p)
      assert.ok(p.vehicle!.pos.x > 0.5)
      assert.deepStrictEqual([p.vel.x, p.onGround, p.isCollidedVertically], [0, false, false])
      assert.strictEqual(p.pos.y, f(f(f(0.375) + f(1.02001)) - f(1.6200100183486938)))
    })

    it('spends the one-tick inputs while riding, so none acts after the dismount', () => {
      const p = player([0.5, 0, 0.5], { vehicle: boat(), bigWaveRoll: () => 0.5, riptideLaunch: 3, spinHits: 1, fireworkUsed: true, itemUseStarted: true })
      simulatePlayer(ctx(FLAT), p)
      assert.deepStrictEqual([p.riptideLaunch, p.spinHits, p.fireworkUsed, p.itemUseStarted], [0, 0, false, false])
    })

    it('only sits in a vehicle the server moves', () => {
      const cart = boat({ kind: 'minecart', predicted: false, pos: new Vec3(3, 1, 3) })
      const p = player([0.5, 0, 0.5], { vehicle: cart, control: { forward: true } })
      simulatePlayer(ctx(EMPTY), p)
      assert.deepStrictEqual([p.vehicle!.pos.x, p.pos.x, p.pos.z], [3, 3, 3])
    })

    it('reports the vehicle it predicts: its position, velocity, rotation and id', () => {
      const v = boat({ vel: new Vec3(0.1, -0.04, 0), yaw: 30, pitch: 0 })
      const packet = buildPlayerAuthInput(player([0.5, 0, 0.5], { vehicle: v })) as Record<string, any>
      assert.deepStrictEqual([packet.position, packet.delta, packet.vehicle_rotation, packet.predicted_vehicle], [{ x: 0.5, y: f(0.375), z: 0.5 }, { x: f(0.1), y: f(-0.04), z: 0 }, { x: 0, z: 30 }, 5n])
      assert.ok(packet.input_data.includes('client_predicted_vehicle'))
      assert.ok(!packet.input_data.includes('vertical_collision'), 'the rider’s own collision is not reported')
      const landed = buildPlayerAuthInput(player([0.5, 0, 0.5], { vehicle: boat({ isCollidedVertically: true }), isCollidedHorizontally: true })) as Record<string, any>
      assert.deepStrictEqual([landed.input_data.includes('vertical_collision'), landed.input_data.includes('horizontal_collision')], [true, false], 'the vehicle’s')
      const turning = buildPlayerAuthInput(player([0.5, 0, 0.5], { vehicle: boat(), bedrock: { keys: { up: true, left: true } } as any })) as Record<string, any>
      assert.deepStrictEqual([turning.input_data.includes('paddling_left'), turning.input_data.includes('paddling_right')], [true, false], 'the left key paddles left')
      const right = buildPlayerAuthInput(player([0.5, 0, 0.5], { vehicle: boat(), bedrock: { keys: { right: true } } as any })) as Record<string, any>
      assert.ok(right.input_data.includes('paddling_right'))
      const seated = buildPlayerAuthInput(player([0.5, 0, 0.5], { vehicle: { ...v, predicted: false } })) as Record<string, any>
      assert.strictEqual(seated.predicted_vehicle, undefined)
    })
  })
  it('dismounts beside the seat, at rest, the box rebuilt; not riding, nothing', () => {
    const rider = player([0.5, 1, 0.5], { vehicle: boat(), vel: new Vec3(0.1, 0, 0), bedrock: { aabb: {} } as any })
    dismount(ctx(FLAT), rider)
    assert.deepStrictEqual([rider.pos.x, rider.pos.y, rider.pos.z], [0.5, f(0.001), -0.5])
    assert.deepStrictEqual([rider.vel.x, rider.vehicle, rider.bedrock!.aabb], [0, undefined, undefined])
    const walker = player([0.5, 0, 0.5])
    dismount(ctx(FLAT), walker)
    assert.strictEqual(walker.pos.z, 0.5)
    const bare = player([0.5, 1, 0.5], { vehicle: boat() })
    dismount(ctx(FLAT), bare)
    assert.strictEqual(bare.pos.y, f(0.001))
  })
})
