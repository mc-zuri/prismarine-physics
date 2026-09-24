import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { Physics } from '../../../../lib/bedrock/index.ts'
import { agedDuration, BedrockSession, flagValue, movementAttribute, restatedFlags } from '../../../../lib/bedrock/network/session.ts'
import { FLAT, player } from '../helpers.ts'

const f = Math.fround
const EYE = 1.6200100183486938

// test/bedrock/session.test.js covers the packets end to end; these cover the decisions around them.
function session () {
  const physics = Physics({ version: { minecraftVersion: '1.26.20' } }, FLAT)
  const s = new BedrockSession({ physics, world: FLAT })
  s.handlePacket('start_game', { runtime_entity_id: 7n, rewind_history_size: 40 })
  return s
}

describe('bedrock network/session', () => {
  it('takes the history size from start_game', () => {
    assert.strictEqual(session().rewind.history, 40)
    const s = new BedrockSession({ physics: Physics({}, FLAT), world: FLAT })
    s.handlePacket('start_game', { runtime_entity_id: 1 })
    assert.strictEqual(s.rewind.history, 16)
  })

  it('ignores other packets, other entities, and corrections for anything but the player', () => {
    const s = session()
    assert.strictEqual(s.handlePacket('text', {}), false)
    assert.strictEqual(s.handlePacket('correct_player_move_prediction', { prediction_type: 'other', position: {}, delta: {} }), false)
    assert.strictEqual(s.handlePacket('correct_player_move_prediction', { prediction_type: 0, tick: 1n, position: { x: 0, y: 0, z: 0 }, delta: { x: 0, y: 0, z: 0 } }), true)
    assert.strictEqual(s.handlePacket('update_attributes', { runtime_entity_id: 8n, attributes: [] }), false)
    assert.strictEqual(s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [] }), false)
    assert.strictEqual(s.handlePacket('set_entity_data', { runtime_entity_id: 8n, metadata: [] }), false)
    assert.strictEqual(s.handlePacket('set_entity_data', { runtime_entity_id: 7n, metadata: [] }), false)
    assert.strictEqual(new BedrockSession({ physics: Physics({}, FLAT), world: FLAT }).handlePacket('move_player', { runtime_id: 7n }), false, 'no local player yet')
  })

  it('takes a move mode by number or by name', () => {
    const s = session()
    const p = player([0, 0, 0])
    s.handlePacket('move_player', { runtime_id: 7n, position: { x: 1, y: EYE, z: 1 }, mode: 0, on_ground: true })
    s.runDue(p, 0)
    assert.strictEqual(p.bedrock!.teleported, undefined)
    s.handlePacket('move_player', { runtime_id: 7n, position: { x: 1, y: EYE, z: 1 }, mode: 'teleport' })
    s.runDue(p, 0)
    assert.strictEqual(p.bedrock!.teleported, true)
  })

  describe('whether a correction is filed', () => {
    const at = (t: number, pos: [number, number, number], vel: [number, number, number], onGround = true) => {
      const s = session()
      const p = player(pos, { vel: new Vec3(...vel), onGround })
      for (let tick = 1; tick <= t; tick++) {
        s.rewind.push({ t: tick })
        s.rewind.snapshot(tick, p)
      }
      return { s, p }
    }
    const correction = (over = {}) => ({ tick: 3, x: 0.5, y: f(10 + f(EYE)), z: 0.5, dx: 0, dy: 0, dz: 0, onGround: true, ...over })

    it('drops one that agrees with the frame of its tick', () => {
      const { s } = at(5, [0.5, 10, 0.5], [0, 0, 0])
      assert.strictEqual(s.correctionFiles(correction()), false)
    })

    it('files one whose ground flag, position or velocity differs', () => {
      const { s } = at(5, [0.5, 10, 0.5], [0, 0, 0])
      assert.strictEqual(s.correctionFiles(correction({ onGround: false })), true)
      assert.strictEqual(s.correctionFiles(correction({ x: 0.6 })), true)
      assert.strictEqual(s.correctionFiles(correction({ dy: 0.1 })), true)
    })

    it('files one with no frame for its tick, and refuses one older than the history', () => {
      const { s } = at(5, [0.5, 10, 0.5], [0, 0, 0])
      s.rewind.snapshots.delete(3)
      assert.strictEqual(s.correctionFiles(correction()), true)
      s.rewind.reset(4)
      assert.strictEqual(s.correctionFiles(correction()), false)
    })
  })

  it('decodes the additive modifiers of the movement attribute, by number or by name', () => {
    const packet = (modifiers: unknown[]) => ({ tick: 3n, attributes: [{ name: 'minecraft:movement', default: 0.1, current: 0.1, modifiers }] })
    assert.strictEqual(movementAttribute(packet([{ operation: 'addition', amount: -0.05 }]))!.walk, f(f(0.1) + f(-0.05)))
    assert.strictEqual(movementAttribute(packet([{ operation: 'multiply_base', amount: 2 }]))!.walk, f(0.1))
    // an addition to the bounds (operand 0 or 1) is not the value
    assert.strictEqual(movementAttribute(packet([{ operation: 0, operand: 1, amount: 5 }, { operation: 0, operand: 2, amount: -0.05 }]))!.walk, f(f(0.1) + f(-0.05)))
    assert.strictEqual(movementAttribute(packet([]))!.walk, f(0.1))
    assert.strictEqual(movementAttribute({ tick: 1n, attributes: [{ name: 'minecraft:movement', default: 0.1, current: 0.1 }] })!.walk, f(0.1))
    assert.strictEqual(movementAttribute({ tick: 1n }), null)
  })

  it('reads a flags word as an object of booleans or a list of names', () => {
    assert.strictEqual(flagValue({ sprinting: true }, 'sprinting'), true)
    assert.strictEqual(flagValue({ sprinting: true }, 'sneaking'), false)
    assert.strictEqual(flagValue(['sneaking'], 'sneaking'), true)
    assert.strictEqual(flagValue(['sneaking'], 'swimming'), false)
    assert.strictEqual(flagValue(12n, 'sneaking'), undefined)
    assert.deepStrictEqual(restatedFlags({ tick: 1n, metadata: [{ key: 'flags', value: 5n }] }), null)
    assert.deepStrictEqual(restatedFlags({ tick: 2n, metadata: [{ key: 'flags_extended', value: ['push_towards_closest_space'] }] }), { tick: 2, crawling: false, pushTowardsClosestSpace: true })
    assert.deepStrictEqual(restatedFlags({ tick: 1n }), null)
  })

  it('writes only the restated flags that differ from the frame, and all of them with no frame', () => {
    const s = session()
    const p = player(undefined, { bedrock: { sneaking: true, poseHeight: 1.49 } })
    s.rewind.push({ t: 1 })
    s.rewind.snapshot(1, p)
    p.bedrock!.sneaking = false
    s.actorFlags(p, { tick: 1, sneaking: true, height: 1.49 })
    assert.strictEqual(p.bedrock!.sneaking, false, 'the frame had it: a stale restatement')
    s.actorFlags(p, { tick: 9, sneaking: true })
    assert.strictEqual(p.bedrock!.sneaking, true, 'no frame for its tick')
    const bare = player()
    s.rewind.snapshot(2, bare)
    s.actorFlags(bare, { tick: 2, swimming: true })
    assert.strictEqual(bare.bedrock!.swimming, true, 'a frame without engine state')
  })

  it('writes what it takes into the frame the next restatement compares with', () => {
    const s = session()
    const p = player(undefined, { bedrock: { sprinting: false } })
    for (let t = 1; t <= 3; t++) {
      s.rewind.push({ t })
      s.rewind.snapshot(t, p)
    }
    s.rewind.push({ t: 4 })
    s.actorFlags(p, { tick: 1, sprinting: true })
    assert.deepStrictEqual([p.bedrock!.sprinting, s.rewind.snapshots.get(3)!.bedrock!.sprinting], [true, true])
    p.bedrock!.sprinting = false
    s.actorFlags(p, { tick: 3, sprinting: true })
    assert.strictEqual(p.bedrock!.sprinting, false, "the frame already had it: a stop of the player's own stands")
  })

  it('simulates a frame with its rotation and controls, running the before-step first', () => {
    const s = session()
    const p = player([0.5, 0, 0.5])
    const order: string[] = []
    s.tick(p, { t: 1, bedrockYaw: 90, bedrockPitch: 10, control: { forward: true } }, () => order.push('before'))
    assert.deepStrictEqual([p.bedrockYaw, p.bedrockPitch, order], [90, 10, ['before']])
    assert.ok(p.pos.x < 0.5, 'walked west')
    s.tick(p, { t: 2, yaw: 0, pitch: 0.5 })
    assert.deepStrictEqual([p.yaw, p.pitch], [0, 0.5])
    assert.ok(s.rewind.snapshots.has(2))
  })

  it('hands a frame\'s riptide launch and spin hits to the tick, which consumes them', () => {
    const s = session()
    const p = player([0.5, 0, 0.5])
    s.tick(p, { t: 1, riptideLaunch: 1, spinHits: 0 })
    assert.deepStrictEqual([p.bedrock!.spinning, p.riptideLaunch, p.spinHits], [true, 0, 0])
  })

  it('clears the client history on a far teleport only', () => {
    const s = session()
    const p = player([0, 0, 0])
    s.teleport(p, 5, { x: 3, y: EYE, z: 0 })
    assert.strictEqual(s.ringOldest, -Infinity)
    s.teleport(p, 6, { x: 30, y: EYE, z: 0 })
    assert.strictEqual(s.ringOldest, 6)
    assert.strictEqual(s.rewind.oldest, 6)
  })

  it('writes a movement attribute onto the history frames from its tick', () => {
    const s = session()
    const p = player()
    for (let t = 1; t <= 3; t++) s.rewind.snapshot(t, { ...p, attributes: t === 3 ? { other: { base: 1 } } : undefined })
    s.movementAttribute(p, { tick: 2, walk: 0.1, current: 0.13 })
    assert.strictEqual(s.rewind.snapshots.get(1)!.attributes, undefined)
    assert.strictEqual(s.rewind.snapshots.get(2)!.attributes!['minecraft:movement']!.current, f(0.13))
    assert.deepStrictEqual(Object.keys(s.rewind.snapshots.get(3)!.attributes!), ['other', 'minecraft:movement'])
  })

  it('keeps the sprint boost when the player started sprinting after the attribute\'s tick', () => {
    const at = (startTick: number) => {
      const s = session()
      const p = player(undefined, { bedrock: { sprinting: true } })
      for (let t = 1; t <= 4; t++) s.rewind.snapshot(t, { ...p, bedrock: { actions: new Set(t === startTick ? ['startSprinting'] : []) } })
      s.rewind.snapshot(5, { ...p, bedrock: undefined })
      s.movementAttribute(p, { tick: 2, walk: 0.1, current: 0.1 })
      return p.bedrock!.sprintBoost
    }
    assert.strictEqual(at(3), true, 'started after the tick')
    assert.strictEqual(at(2), false, 'started on the tick itself')
  })

  describe('a mob effect', () => {
    const packet = (over = {}) => ({ runtime_entity_id: 7n, event_id: 'add', effect_id: 24, amplifier: 1, tick: 0n, ...over })

    it('sets the level live, or removes it, for the player only and the effects the engine reads', () => {
      const s = session()
      const p = player()
      assert.strictEqual(s.handlePacket('mob_effect', packet({ runtime_entity_id: 8n })), false)
      assert.strictEqual(s.handlePacket('mob_effect', packet({ effect_id: 99 })), false)
      assert.strictEqual(s.handlePacket('mob_effect', packet()), true)
      s.runDue(p, 0)
      assert.strictEqual(p.levitation, 2)
      s.handlePacket('mob_effect', packet({ event_id: 'remove' }))
      s.runDue(p, 0)
      assert.strictEqual(p.levitation, 0)
    })

    it('installs a stamped one on the frames from its tick and simulates the ticks since again', () => {
      const s = session()
      const p = player([0.5, 5, 0.5], { onGround: false })
      for (let t = 1; t <= 4; t++) s.tick(p, { t })
      const fell = p.pos.y
      s.handlePacket('mob_effect', packet({ tick: 2n, amplifier: 4 }))
      s.tick(p, { t: 5 })
      assert.strictEqual(s.rewind.snapshots.get(3)!.levitation, 5)
      assert.ok(p.pos.y > fell, 'levitating from tick 2 on')
    })

    it('leaves the history alone when unstamped, so a later rewind does not apply it to earlier ticks', () => {
      const s = session()
      const p = player([0.5, 5, 0.5], { onGround: false })
      for (let t = 1; t <= 4; t++) s.tick(p, { t })
      s.handlePacket('mob_effect', packet({ amplifier: 4 }))
      s.runDue(p, 5)
      assert.strictEqual(p.levitation, 5)
      assert.deepStrictEqual([...s.rewind.snapshots.values()].map(frame => frame.levitation ?? 0), [0, 0, 0, 0])
    })
  })

  describe('a glide boost', () => {
    const packet = (over = {}) => ({ runtime_id: 7n, effect_type: 'GLIDE_BOOST', effect_duration: 20, tick: 2n, ...over })
    const gliding = () => player([0.5, 50, 0.5], { onGround: false, elytraFlying: true, elytraEquipped: true, bedrockPitch: 0, bedrockYaw: 0, vel: new Vec3(0, 0, 0.5) })

    it('ages what is left by the ticks since its stamp; -1 lasts', () => {
      assert.deepStrictEqual([agedDuration(20, 3), agedDuration(20, 30), agedDuration(-1, 5), agedDuration(20, 0)], [17, 0, -1, 20])
    })

    it('is taken for the player only, and only the glide boost', () => {
      const s = session()
      assert.strictEqual(s.handlePacket('movement_effect', packet({ runtime_id: 8n })), false)
      assert.strictEqual(s.handlePacket('movement_effect', packet({ effect_type: 'invalid' })), false)
      assert.strictEqual(s.handlePacket('movement_effect', packet({ effect_type: 0, effect_duration: -5 })), true)
      const p = player()
      s.runDue(p, 0)
      assert.strictEqual(p.fireworkRocketDuration, 0, 'a negative duration is none')
    })

    it('starting, boosts from the frame after its tick on, the ticks since simulated again', () => {
      const s = session()
      const p = gliding()
      const plain = gliding()
      for (let t = 1; t <= 4; t++) { s.tick(p, { t }); new BedrockSession({ physics: s.physics, world: FLAT }).tick(plain, { t }) }
      s.handlePacket('movement_effect', packet())
      s.tick(p, { t: 5 })
      assert.ok(p.vel.z > plain.vel.z, 'boosted since tick 3')
      assert.strictEqual(p.fireworkRocketDuration, 20 - 2 * 3)
    })

    it('replays a firework used on a tick simulated again', () => {
      const s = session()
      const p = gliding()
      s.tick(p, { t: 1, usingItem: false, itemUseStarted: false })
      s.tick(p, { t: 2, fireworkUsed: true })
      s.tick(p, { t: 3 })
      assert.strictEqual(p.fireworkRocketDuration, 16)
      s.handlePacket('correct_player_move_prediction', { prediction_type: 'player', tick: 1n, position: { x: 0.5, y: f(40 + f(EYE)), z: 0.5 }, delta: { x: 0, y: 0, z: 0 }, on_ground: false })
      s.tick(p, { t: 4 })
      assert.ok(p.pos.y < 40, 'rewound to the correction')
      assert.strictEqual(p.fireworkRocketDuration, 14, 'the use on tick 2 is replayed')
    })

    it('restating one already on, sets what is left live and in the history; unstamped, as sent', () => {
      const s = session()
      const p = gliding()
      p.fireworkRocketDuration = 30
      for (let t = 1; t <= 4; t++) s.tick(p, { t })
      s.handlePacket('movement_effect', packet({ effect_duration: 10 }))
      s.runDue(p, 5)
      assert.deepStrictEqual([p.fireworkRocketDuration, s.rewind.snapshots.get(3)!.fireworkRocketDuration, s.rewind.snapshots.get(1)!.fireworkRocketDuration], [8, 8, 28])
      s.handlePacket('movement_effect', packet({ effect_duration: 4, tick: 0n }))
      s.runDue(p, 5)
      assert.strictEqual(p.fireworkRocketDuration, 4)
      assert.deepStrictEqual([s.rewind.snapshots.get(3)!.fireworkRocketDuration, s.rewind.snapshots.get(1)!.fireworkRocketDuration], [8, 28], 'unstamped: the history keeps what it had')
    })
  })

  describe('a correction of the vehicle the player steers', () => {
    const boat = (x: number) => ({ id: 5n, kind: 'boat', pos: new Vec3(x, f(0.375), 0.5), vel: new Vec3(0, 0, 0), yaw: 0, pitch: 0, predicted: true, seat: { x: 0, y: 1, z: 0 }, onGround: true })
    const correction = (over = {}) => ({ prediction_type: 'vehicle', tick: 2n, position: { x: 0.5, y: f(0.375), z: 0.5 }, delta: { x: 0, y: 0, z: 0 }, on_ground: true, ...over })

    it('is filed against the vehicle of its tick, and installs the position there', () => {
      const s = session()
      const p = player([0.5, 0, 0.5], { vehicle: boat(0.5) })
      for (let t = 1; t <= 3; t++) s.tick(p, { t })
      assert.strictEqual(s.vehicleCorrectionFiles(p, { tick: 2, x: p.vehicle!.pos.x, y: p.vehicle!.pos.y, z: p.vehicle!.pos.z, dx: p.vehicle!.vel.x, dy: p.vehicle!.vel.y, dz: p.vehicle!.vel.z, onGround: !!p.vehicle!.onGround }), false, 'agrees with its frame')
      assert.strictEqual(s.handlePacket('correct_player_move_prediction', correction({ position: { x: 3, y: f(0.375), z: 0.5 } })), true)
      s.tick(p, { t: 4 })
      assert.ok(p.vehicle!.pos.x > 2.9, 'installed on tick 2 and simulated since')
    })

    it('is dropped without a predicted vehicle or before the history, filed with no vehicle in its frame', () => {
      const s = session()
      const walker = player()
      const c = { tick: 2, x: 1, y: 0, z: 0, dx: 0, dy: 0, dz: 0, onGround: true }
      assert.strictEqual(s.vehicleCorrectionFiles(walker, c), false)
      const p = player([0.5, 0, 0.5], { vehicle: boat(0.5) })
      s.rewind.push({ t: 1 })
      s.rewind.snapshot(1, player())
      assert.strictEqual(s.vehicleCorrectionFiles(p, { ...c, tick: 1 }), true, 'a frame from before the mount')
      s.rewind.reset(5)
      assert.strictEqual(s.vehicleCorrectionFiles(p, c), false)
      assert.strictEqual(s.vehicleCorrectionFiles({ ...p, vehicle: { ...boat(0.5), predicted: false } }, c), false)
    })

    it('keeps the vehicle the player rides when its frame is from before the mount', () => {
      const s = session()
      const p = player([0.5, 0, 0.5])
      s.tick(p, { t: 1 })
      p.vehicle = boat(0.5)
      s.tick(p, { t: 2 })
      s.correctVehicle(p, { tick: 1, x: 2, y: f(0.375), z: 0.5, dx: 0, dy: 0, dz: 0, onGround: true })
      assert.ok(p.vehicle && p.vehicle.pos.x >= 2)
      const walker = player()
      s.correctVehicle(walker, { tick: 1, x: 2, y: 0, z: 0, dx: 0, dy: 0, dz: 0, onGround: true })
      assert.strictEqual(walker.vehicle, undefined)
    })
  })

  it('sets a knockback live, and re-simulates the ticks since a stamped one', () => {
    const s = session()
    const p = player([0.5, 10, 0.5], { onGround: false })
    assert.strictEqual(s.handlePacket('set_entity_motion', { runtime_entity_id: 8n, velocity: { x: 1, y: 0, z: 0 }, tick: 0n }), false)
    assert.strictEqual(s.handlePacket('set_entity_motion', { runtime_entity_id: 7n, velocity: { x: 0.4, y: 0.3, z: 0 }, tick: 0n }), true)
    s.runDue(p, 0)
    assert.deepStrictEqual([p.vel.x, p.vel.y, p.vel.z], [f(0.4), f(0.3), 0])
    for (let t = 1; t <= 4; t++) s.tick(p, { t })
    const after4 = p.pos.x
    s.handlePacket('set_entity_motion', { runtime_entity_id: 7n, velocity: { x: 0, y: 0, z: 0.5 }, tick: 2n })
    s.tick(p, { t: 5 })
    assert.ok(p.pos.z > 0.9, 'the push from tick 2 on, re-simulated')
    assert.ok(p.pos.x < after4 + 0.01, 'the x motion stopped at tick 2')
  })
})
