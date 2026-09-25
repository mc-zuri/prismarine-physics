import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { Physics } from '../../../../lib/bedrock/index.ts'
import { agedDuration, BedrockSession, effectLevel, flagValue, liquidAttributes, movementAttribute, restatedFlags } from '../../../../lib/bedrock/network/session.ts'
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
  it('takes the local game mode for the simulation, refusing one stamped before the history', () => {
    const s = session()
    s.handlePacket('start_game', { runtime_entity_id: 7n, entity_id: -5n, rewind_history_size: 5 })
    const p = player(undefined, { gameMode: 'survival' })
    assert.strictEqual(s.handlePacket('update_player_game_type', { gamemode: 'creative', player_unique_id: -6n, tick: 0n }), false, 'another player')
    for (let t = 1; t <= 10; t++) s.tick(p, { t })
    s.handlePacket('update_player_game_type', { gamemode: 'creative', player_unique_id: -5n, tick: 4n })
    s.tick(p, { t: 11 })
    assert.strictEqual(p.gameMode, 'survival', 'older than the history: refused')
    s.handlePacket('update_player_game_type', { gamemode: 'creative', player_unique_id: -5n, tick: 9n })
    s.tick(p, { t: 12 })
    assert.strictEqual(p.gameMode, 'creative')
    s.handlePacket('update_player_game_type', { gamemode: 'default', player_unique_id: -5n, tick: 0n })
    p.gameMode = 'adventure'
    s.tick(p, { t: 13 })
    assert.strictEqual(p.gameMode, 'adventure', 'the world default is left to the caller')
    const unknown = session()
    assert.strictEqual(unknown.handlePacket('update_player_game_type', { gamemode: 'creative', player_unique_id: -5n, tick: 0n }), false, 'before start_game')
  })

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

  it('moves the player for a teleport stamped before the history but keeps it, so a correction behind it simulates through', () => {
    const s = session()
    s.rewind.history = 5
    const p = player([0.5, 0, 0.5])
    for (let t = 1; t <= 10; t++) s.tick(p, { t })
    s.handlePacket('move_player', { runtime_id: 7n, position: { x: 50.5, y: 10 + EYE, z: 50.5 }, mode: 'teleport', tick: 4n })
    s.handlePacket('correct_player_move_prediction', { prediction_type: 'player', position: { x: 50.5, y: 10 + EYE, z: 50.5 }, delta: { x: 0, y: 0, z: 0 }, on_ground: false, tick: 6n })
    s.tick(p, { t: 11 })
    assert.ok(s.rewind.oldest < 8, 'the history is kept')
    assert.ok(p.bedrock!.actions!.has('handledTeleport'), 'the teleport is still reported')
    assert.ok(p.pos.y < 10 && p.pos.x === 50.5, 'from the correction on, falling through the ticks since and this one')
    // one stamped within the history starts it over
    s.handlePacket('move_player', { runtime_id: 7n, position: { x: 0.5, y: EYE, z: 0.5 }, mode: 'teleport', tick: 9n })
    s.tick(p, { t: 12 })
    assert.strictEqual(s.rewind.oldest, 12)
  })

  it('leaves a player waiting for the chunks it was teleported to where the teleport put it, through a correction', () => {
    const world = { ...FLAT, getBlock: FLAT.getBlock, loaded: (pos: { x: number }) => pos.x < 20 }
    const s = new BedrockSession({ physics: Physics({ version: { minecraftVersion: '1.26.20' } }, world), world })
    s.handlePacket('start_game', { runtime_entity_id: 7n, rewind_history_size: 40 })
    s.rewind.history = 5
    const p = player([0.5, 0, 0.5])
    for (let t = 1; t <= 10; t++) s.tick(p, { t })
    s.handlePacket('move_player', { runtime_id: 7n, position: { x: 50.5, y: 10 + EYE, z: 50.5 }, mode: 'teleport', tick: 4n })
    s.handlePacket('correct_player_move_prediction', { prediction_type: 'player', position: { x: 50.5, y: 10 + EYE, z: 50.5 }, delta: { x: 0, y: 0, z: 0 }, on_ground: false, tick: 6n })
    s.tick(p, { t: 11 })
    assert.ok(p.bedrock!.actions!.has('handledTeleport'))
    assert.deepStrictEqual([p.pos.x, p.pos.y, p.vel.y], [50.5, 10, 0], 'held where it landed')
    // one to a loaded column is simulated through as before
    s.handlePacket('move_player', { runtime_id: 7n, position: { x: 10.5, y: 10 + EYE, z: 0.5 }, mode: 'teleport', tick: 6n })
    s.handlePacket('correct_player_move_prediction', { prediction_type: 'player', position: { x: 10.5, y: 10 + EYE, z: 0.5 }, delta: { x: 0, y: 0, z: 0 }, on_ground: false, tick: 7n })
    s.tick(p, { t: 12 })
    assert.ok(p.pos.y < 10)
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
    // a word with its raw value is read by bit (push 45, crawling 50), whatever its names say
    const pushWord = { _value: String(BigInt.asIntN(64, (1n << 63n) | (1n << 45n))), push_towards_closest_space: false, scenting: true }
    assert.deepStrictEqual(restatedFlags({ tick: 3n, metadata: [{ key: 'flags_extended', value: pushWord }] }), { tick: 3, inAscendable: false, crawling: false, pushTowardsClosestSpace: true })
    assert.deepStrictEqual(restatedFlags({ tick: 4n, metadata: [{ key: 'flags_extended', value: (1n << 50n) | (1n << 35n) }] }), { tick: 4, inAscendable: true, crawling: true, pushTowardsClosestSpace: false })
    assert.deepStrictEqual(restatedFlags({ tick: 5n, metadata: [{ key: 'flags_extended', value: { _value: 0 } }] }), { tick: 5, inAscendable: false, crawling: false, pushTowardsClosestSpace: false })
    assert.deepStrictEqual(restatedFlags({ tick: 1n }), null)
  })

  it('takes the restated climbable-block flag as sent with no frame to weigh it against', () => {
    const s = session()
    const p = player(undefined, { bedrock: {} as any })
    s.actorFlags(p, { tick: 1, inAscendable: false })
    assert.strictEqual(p.bedrock!.ascendRestated, false)
    const bare = player()
    s.actorFlags(bare, { tick: 1, inAscendable: true })
    assert.strictEqual(bare.bedrock, undefined)
  })

  it('writes the restated climbable-block flag only where it differs from the one a frame\'s next climb reads', () => {
    const s = session()
    const p = player(undefined, { bedrock: {} as any })
    for (let t = 1; t <= 4; t++) {
      s.rewind.push({ t })
      s.rewind.snapshot(t, p)
    }
    // the climb's own check has it set: a set one agrees, a cleared one differs, and goes into the latest frame too
    s.actorFlags(p, { tick: 2, inAscendable: true })
    assert.strictEqual(p.bedrock!.ascendRestated, undefined)
    s.actorFlags(p, { tick: 2, inAscendable: false })
    assert.strictEqual(p.bedrock!.ascendRestated, false)
    assert.strictEqual(s.rewind.snapshots.get(3)!.bedrock!.ascendRestated, false)
    // set again where that frame had it cleared: it differs there
    s.actorFlags(p, { tick: 3, inAscendable: true })
    assert.strictEqual(p.bedrock!.ascendRestated, true)
  })

  it('writes only the restated flags that differ from the frame, and all of them with no frame', () => {
    const s = session()
    const p = player(undefined, { bedrock: { sneaking: true, poseHeight: 1.49 } })
    s.rewind.push({ t: 1 })
    s.rewind.snapshot(1, p)
    p.bedrock!.sneaking = false
    s.actorFlags(p, { tick: 1, sneaking: true, height: 1.49 })
    assert.strictEqual(p.bedrock!.sneaking, false, 'the frame had it: a stale restatement')
    const fresh = session()
    fresh.actorFlags(p, { tick: 9, sneaking: true })
    assert.strictEqual(p.bedrock!.sneaking, true, 'no frame for its tick')
    const bare = player()
    s.rewind.snapshot(2, bare)
    s.actorFlags(bare, { tick: 2, swimming: true })
    assert.strictEqual(bare.bedrock!.swimming, true, 'a frame without engine state')
    const unstamped = player()
    fresh.actorFlags(unstamped, { tick: 0, gliding: true })
    assert.strictEqual(unstamped.bedrock!.gliding, true, 'an unstamped one: no frame for tick 0')
  })

  it('weighs a restatement stamped before the history against the oldest frame the history keeps', () => {
    const s = session()
    s.rewind.history = 5
    const p = player(undefined, { bedrock: { sneaking: true } })
    for (let t = 1; t <= 10; t++) {
      if (t === 6) p.bedrock!.sneaking = false
      s.rewind.push({ t })
      s.rewind.snapshot(t, p)
    }
    // the oldest frame kept is tick 5, which still sneaks: the restatement of tick 3 agrees with it
    s.actorFlags(p, { tick: 3, sneaking: true })
    assert.strictEqual(p.bedrock!.sneaking, false)
    // a tick later the oldest is tick 6, which no longer sneaks: it differs, and is filed there
    s.rewind.push({ t: 11 })
    s.actorFlags(p, { tick: 3, sneaking: true })
    assert.strictEqual(p.bedrock!.sneaking, true)
    assert.deepStrictEqual(s.flagCorrections.get(6), { sneaking: true })
  })

  it('writes a stamped movement attribute into the history from its tick, an unstamped one on the player only', () => {
    const s = session()
    const p = player()
    for (let t = 1; t <= 3; t++) s.tick(p, { t })
    const key = s.physics.movementSpeedAttribute
    s.movementAttribute(p, { tick: 0, walk: f(0.2), current: f(0.2) })
    assert.strictEqual(p.attributes![key]!.base, f(0.2))
    assert.notStrictEqual(s.rewind.snapshots.get(3)!.attributes?.[key]?.base, f(0.2), 'unstamped: the history keeps what it had')
    s.movementAttribute(p, { tick: 2, walk: f(0.3), current: f(0.3) })
    assert.deepStrictEqual([s.rewind.snapshots.get(1)!.attributes?.[key]?.base, s.rewind.snapshots.get(3)!.attributes![key]!.base].map(v => v === f(0.3)), [false, true])
  })

  it('replaces the effect held with the same level that lasts longer, or without end', () => {
    const s = session()
    const p = player()
    s.effect(p, { tick: 0, field: 'levitation', level: 2, duration: 5 })
    s.effect(p, { tick: 0, field: 'levitation', level: 2, duration: 50 })
    assert.strictEqual(s.effects.get('levitation')!.at(-1)!.end, s.rewind.current - 1 + 50, 'longer')
    s.effect(p, { tick: 0, field: 'levitation', level: 2, duration: -1 })
    assert.strictEqual(s.effects.get('levitation')!.at(-1)!.end, undefined, 'without end')
  })

  it('takes the push toward free space as sent, whatever the frame had', () => {
    const s = session()
    const p = player(undefined, { bedrock: { pushTowardsClosestSpace: true } })
    s.rewind.push({ t: 1 })
    s.rewind.snapshot(1, p)
    p.bedrock!.pushTowardsClosestSpace = false
    s.actorFlags(p, { tick: 1, pushTowardsClosestSpace: true })
    assert.strictEqual(p.bedrock!.pushTowardsClosestSpace, true)
  })

  it('with no frame to compare with, takes the glide only when the server changed it since it last restated it', () => {
    const s = session()
    const p = player(undefined, { bedrock: { gliding: false } })
    s.actorFlags(p, { tick: 50, gliding: false })
    p.bedrock!.gliding = true
    s.actorFlags(p, { tick: 51, gliding: false })
    assert.strictEqual(p.bedrock!.gliding, true, 'the server said the same before: the glide the player started stands')
    s.actorFlags(p, { tick: 52, gliding: true })
    s.actorFlags(p, { tick: 53, gliding: false })
    assert.strictEqual(p.bedrock!.gliding, false, 'a change the server made')
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

  it('files restated flags that differ from the history, simulates the next rewind again from them and reports what that raised', () => {
    const s = session()
    const p = player([0, 0, 0])
    for (let t = 1; t <= 6; t++) s.tick(p, { t })
    s.actorFlags(p, { tick: 3, gliding: true, pushTowardsClosestSpace: true })
    assert.deepStrictEqual([[...s.flagged], s.flagCorrections.get(3)], [[3], { gliding: true }], 'the push is taken as sent, not filed')
    p.bedrock!.carriedActions = new Set(['handledTeleport'])
    s.rewindTo(5, p, () => {})
    assert.strictEqual(s.flagged.size, 0)
    assert.deepStrictEqual([...p.bedrock!.carriedActions!].sort(), ['handledTeleport', 'stopGliding'], 'the glide filed on tick 4 stops on the ground again')
    s.tick(p, { t: 7 })
    assert.ok(p.bedrock!.actions!.has('stopGliding'))
    assert.strictEqual(p.bedrock!.carriedActions, undefined)
    // one that agrees is not filed, nor one with no frame
    s.actorFlags(p, { tick: 6, gliding: false })
    s.actorFlags(p, { tick: 99, sneaking: true })
    assert.strictEqual(s.flagged.size, 0)
  })

  it('installs the liquid movement attributes on the player and the frames from their tick', () => {
    const s = session()
    const p = player([0, 0, 0])
    for (let t = 1; t <= 4; t++) s.tick(p, { t })
    const water = (current: number) => ({ name: 'minecraft:underwater_movement', current, default: 0.02, modifiers: [] })
    const lava = { name: 'minecraft:lava_movement', current: 0.05, default: 0.02, modifiers: [] }
    assert.strictEqual(s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [water(0.04), lava], tick: 3n }), true)
    s.tick(p, { t: 5 })
    assert.deepStrictEqual(p.attributes!['minecraft:underwater_movement'], { base: f(0.04), current: f(0.04) })
    assert.strictEqual(p.attributes!['minecraft:lava_movement']!.current, f(0.05))
    assert.strictEqual(s.rewind.snapshots.get(3)!.attributes!['minecraft:underwater_movement']!.current, f(0.04))
    assert.strictEqual(s.rewind.snapshots.get(2)!.attributes?.['minecraft:underwater_movement'], undefined, 'not before its tick')
    // an unstamped one is the player's only
    assert.strictEqual(s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [water(0.03)] }), true)
    s.tick(p, { t: 6 })
    assert.strictEqual(p.attributes!['minecraft:underwater_movement']!.current, f(0.03))
    assert.strictEqual(s.rewind.snapshots.get(3)!.attributes!['minecraft:underwater_movement']!.current, f(0.04))
    assert.strictEqual(liquidAttributes({}), null)
  })

  it('files stamped attributes where the movement speed differs, then every one until the next rewind', () => {
    const s = session()
    const p = player([0, 0, 0])
    const movement = (current: number) => ({ name: 'minecraft:movement', current, default: 0.1, modifiers: [] })
    s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [movement(0.1)], tick: 0n })
    for (let t = 1; t <= 6; t++) s.tick(p, { t })
    const exhaustion = { name: 'minecraft:player.exhaustion', current: 1, default: 0, modifiers: [] }
    assert.strictEqual(s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [exhaustion], tick: 3n }), true)
    assert.strictEqual(s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [exhaustion], tick: 0n }), false, 'unstamped: nothing to file')
    s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [movement(0.1)], tick: 4n })
    s.tick(p, { t: 7 })
    assert.deepStrictEqual([...s.flagged], [], 'nothing differed')
    s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [movement(0.13)], tick: 5n })
    s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [exhaustion], tick: 6n })
    s.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [exhaustion], tick: 99n })
    s.tick(p, { t: 8 })
    assert.deepStrictEqual([...s.flagged], [5, 6], 'the speed differed, and after it anything with a frame')
    s.rewindTo(7, p, () => {})
    assert.deepStrictEqual([s.flagged.size, s.attributesFiled], [0, false])
    const bare = session()
    const q = player([0, 0, 0])
    for (let t = 1; t <= 3; t++) bare.tick(q, { t })
    delete bare.rewind.snapshots.get(2)!.attributes
    bare.handlePacket('update_attributes', { runtime_entity_id: 7n, attributes: [movement(0.1)], tick: 2n })
    bare.tick(q, { t: 4 })
    assert.deepStrictEqual([...bare.flagged], [2], 'a frame without the attribute differs')
  })

  it('forgets filed flags that left the history', () => {
    const s = session()
    s.handlePacket('start_game', { runtime_entity_id: 7n, rewind_history_size: 3 })
    const p = player([0, 0, 0])
    for (let t = 1; t <= 4; t++) s.tick(p, { t })
    s.actorFlags(p, { tick: 2, gliding: true })
    for (let t = 5; t <= 9; t++) s.tick(p, { t })
    s.rewindTo(8, p, () => {})
    assert.deepStrictEqual([s.flagged.size, s.flagCorrections.size], [0, 0], 'too old to simulate again from')
  })

  describe('a mob effect', () => {
    const packet = (over = {}) => ({ runtime_entity_id: 7n, event_id: 'add', effect_id: 24, amplifier: 1, tick: 0n, ...over })

    it('sets the level live, or removes it, for the player only and the effects the engine reads', () => {
      const s = session()
      const p = player()
      assert.strictEqual(s.handlePacket('mob_effect', packet({ runtime_entity_id: 8n })), false)
      assert.strictEqual(s.handlePacket('mob_effect', packet({ effect_id: 99 })), false)
      assert.strictEqual(s.handlePacket('mob_effect', packet()), true)
      s.tick(p, { t: 1 })
      assert.strictEqual(p.levitation, 2)
      s.handlePacket('mob_effect', packet({ event_id: 'remove' }))
      s.tick(p, { t: 2 })
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

    it('ends a timed one on its own count: through the tick before the frame it takes effect on, plus its duration', () => {
      const s = session()
      s.rewind.history = 8
      const p = player([0.5, 5, 0.5], { onGround: false })
      for (let t = 1; t <= 4; t++) s.tick(p, { t })
      s.handlePacket('mob_effect', packet({ tick: 3n, duration: 3 }))
      s.tick(p, { t: 5 })
      s.tick(p, { t: 6 })
      assert.strictEqual(p.levitation, 2, 'from frame 4 through tick 6')
      s.handlePacket('mob_effect', packet({ effect_id: 27, duration: 1 }))
      s.tick(p, { t: 7 })
      assert.deepStrictEqual([p.levitation, p.slowFalling], [0, 2], 'unstamped: from the tick it lands on')
      s.tick(p, { t: 8 })
      assert.strictEqual(p.slowFalling, 0)
      s.handlePacket('mob_effect', packet({ duration: 100 }))
      s.handlePacket('mob_effect', packet({ event_id: 'remove' }))
      s.tick(p, { t: 9 })
      assert.strictEqual(p.levitation, 0, 'a removal ends it')
      s.handlePacket('mob_effect', packet({ duration: -1 }))
      for (let t = 10; t <= 30; t++) s.tick(p, { t })
      assert.strictEqual(p.levitation, 2, 'no duration: until removed')
      s.handlePacket('mob_effect', packet({ duration: -1 }))
      s.tick(p, { t: 31 })
      assert.strictEqual(s.effects.get('levitation')!.length, 4, 'the same level without end again merges into the one held')
      s.handlePacket('mob_effect', packet({ amplifier: 3, duration: -1 }))
      s.tick(p, { t: 32 })
      assert.deepStrictEqual(s.effects.get('levitation')!.map(event => event.frame), [10, 32], 'what came before the history is dropped but the last of it')
      s.handlePacket('mob_effect', packet({ amplifier: 0, duration: -1 }))
      s.tick(p, { t: 33 })
      assert.strictEqual(p.levitation, 4, 'a lower level leaves the higher one')
    })

    it('waits for the frame of one stamped ahead, and simulates again only for a change of the effect it has now', () => {
      const s = session()
      const p = player([0.5, 5, 0.5], { onGround: false })
      for (let t = 1; t <= 4; t++) s.tick(p, { t })
      s.handlePacket('mob_effect', packet({ tick: 5n }))
      s.tick(p, { t: 5 })
      assert.strictEqual(p.levitation ?? 0, 0, 'takes effect on frame 6')
      s.tick(p, { t: 6 })
      assert.strictEqual(p.levitation, 2)
      let rewound = 0
      const rewindTo = s.rewind.rewindTo.bind(s.rewind)
      s.rewind.rewindTo = (...args) => { rewound++; rewindTo(...args) }
      s.handlePacket('mob_effect', packet({ tick: 4n }))
      s.tick(p, { t: 7 })
      assert.strictEqual(rewound, 0, 'the level it has now: only the history takes it')
      s.handlePacket('mob_effect', packet({ tick: 4n, amplifier: 3 }))
      s.tick(p, { t: 8 })
      assert.strictEqual(rewound, 1, 'another level from frame 5 changes the ticks since')
      // the frame 6 event still sets level 2 from tick 6 on
      s.handlePacket('mob_effect', packet({ tick: 7n }))
      s.tick(p, { t: 9 })
      assert.strictEqual(rewound, 1, 'the same level again changes nothing')
    })

    it('simulates nothing again for one that leaves the effect as it stands now, but keeps it for a later rewind', () => {
      const s = session()
      s.rewind.history = 12
      const p = player([0.5, 5, 0.5], { onGround: false })
      let rewound = 0
      const rewindTo = s.rewind.rewindTo.bind(s.rewind)
      s.rewind.rewindTo = (...args) => { rewound++; rewindTo(...args) }
      for (let t = 1; t <= 2; t++) s.tick(p, { t })
      s.handlePacket('mob_effect', packet({ duration: 2 }))
      for (let t = 3; t <= 6; t++) s.tick(p, { t })
      assert.strictEqual(p.levitation, 0, 'it ran out on its own count')
      s.handlePacket('mob_effect', packet({ event_id: 'remove', tick: 3n, duration: 1 }))
      s.tick(p, { t: 7 })
      assert.strictEqual(rewound, 0, 'removing one that already ran out')
      s.handlePacket('mob_effect', packet({ duration: -1 }))
      s.tick(p, { t: 8 })
      s.handlePacket('mob_effect', packet({ tick: 1n, duration: -1 }))
      s.tick(p, { t: 9 })
      assert.strictEqual(rewound, 0, 'adding one already there at that level')
      assert.strictEqual(effectLevel(s.effects.get('levitation')!, 2), 2, 'but the history has it')
    })

    it('rewinds to its frame only where a tick since changes, and not at all when a later event still sets them', () => {
      const s = session()
      s.rewind.history = 12
      const p = player([0.5, 5, 0.5], { onGround: false })
      for (let t = 1; t <= 7; t++) s.tick(p, { t })
      let rewound = 0
      const rewindTo = s.rewind.rewindTo.bind(s.rewind)
      s.rewind.rewindTo = (...args) => { rewound++; rewindTo(...args) }
      s.effect(p, { tick: 2, field: 'levitation', level: 2, duration: 2 })
      assert.strictEqual(rewound, 1, 'levitating on ticks 3 and 4')
      // lasting from frame 4: tick 4 had it already, tick 5 did not
      s.effect(p, { tick: 3, field: 'levitation', level: 2, duration: -1 })
      assert.strictEqual(rewound, 2)
      s.effect(p, { tick: 5, field: 'levitation', level: 3, duration: -1 })
      assert.strictEqual(rewound, 3)
      // level 2 from frame 4 again: frame 6's level 3 still holds from tick 6, and ticks 4 and 5 are already level 2
      s.effect(p, { tick: 3, field: 'levitation', level: 2, duration: -1 })
      assert.strictEqual(rewound, 3)
    })

    it('leaves the history alone when unstamped, so a later rewind does not apply it to earlier ticks', () => {
      const s = session()
      const p = player([0.5, 5, 0.5], { onGround: false })
      for (let t = 1; t <= 4; t++) s.tick(p, { t })
      s.handlePacket('mob_effect', packet({ amplifier: 4 }))
      s.tick(p, { t: 5 })
      assert.strictEqual(p.levitation, 5)
      assert.deepStrictEqual([1, 2, 3, 4].map(t => s.rewind.snapshots.get(t)!.levitation ?? 0), [0, 0, 0, 0])
    })

    it('reads no level before the first event', () => {
      assert.strictEqual(effectLevel([{ frame: 5, level: 1 }], 4), undefined)
      assert.strictEqual(effectLevel([{ frame: 5, level: 1, end: 6 }, { frame: 9, level: 3 }], 7), 0)
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

  it('simulates the ticks since a rewind in the vehicle the player rides now, getting on and off not simulated again', () => {
    const s = session()
    const boat = (id: bigint) => ({ id, kind: 'boat', pos: new Vec3(0.5, f(0.375), 0.5), vel: new Vec3(0, 0, 0), yaw: 0, pitch: 0, predicted: true, seat: { x: 0, y: 1, z: 0 }, onGround: true })
    const p = player([0.5, 0, 0.5], { vehicle: boat(6n) })
    s.tick(p, { t: 1 })
    p.vehicle = boat(5n)
    s.tick(p, { t: 2 })
    s.rewindTo(1, p, () => {})
    assert.strictEqual(p.vehicle!.id, 5n, 'the frame was kept in another vehicle')
    s.tick(p, { t: 3 })
    delete p.vehicle
    s.tick(p, { t: 4 })
    const off = p.pos.clone()
    let installed = false
    s.rewindTo(2, p, () => { installed = true })
    assert.deepStrictEqual([p.vehicle, installed, p.pos.equals(off)], [undefined, false, true], 'got off since: nothing simulated again')
  })

  it('seats the rider on a vehicle the server moves where it is now, not where its frame had it', () => {
    const s = session()
    const cart = { id: 9n, kind: 'minecart', pos: new Vec3(0.5, 0, 0.5), vel: new Vec3(0, 0, 0), yaw: 0, pitch: 0, predicted: false, seat: { x: 0, y: 1, z: 0 } }
    const p = player([0.5, 0, 0.5], { vehicle: cart })
    for (let t = 1; t <= 3; t++) s.tick(p, { t })
    cart.pos.set(4.5, 0, 0.5)
    s.rewindTo(1, p, () => {})
    assert.strictEqual(p.vehicle, cart)
    assert.strictEqual(p.pos.x, 4.5)
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
