import assert from 'node:assert'
import { buildPlayerAuthInput, camelCase, INPUT_FLAG_BITS, INPUT_FLAG_NAMES, INPUT_FLAGS, inputFlags } from '../../../../lib/bedrock/network/input-packet.ts'
import { cook } from '../../../../lib/bedrock/movement/input.ts'
import { player } from '../helpers.ts'

const f = Math.fround

describe('bedrock network/input-packet', () => {
  it('numbers the 65 input flags and names them in camelCase', () => {
    assert.strictEqual(INPUT_FLAGS.length, 65)
    assert.strictEqual(INPUT_FLAGS[37], 'handled_teleport')
    assert.strictEqual(camelCase('sneak_current_raw'), 'sneakCurrentRaw')
    assert.strictEqual(INPUT_FLAG_NAMES[64], 'sneakCurrentRaw')
    assert.strictEqual(INPUT_FLAG_BITS.get('startSprinting'), 25)
  })

  it('reports the key bits, the derived bits, the actions and the collisions', () => {
    const input = cook({ forward: true, jump: true, sneak: true, sprint: true, raw: { ascend: true } }, undefined, {})
    const flags = inputFlags(player(undefined, { isCollidedHorizontally: true, isCollidedVertically: true, bedrock: { keys: input.keys, input, actions: new Set(['startJumping']) } }))
    for (const name of ['up', 'jumpDown', 'sneakDown', 'sprintDown', 'ascend', 'jumpPressedRaw', 'jumpCurrentRaw', 'sneakPressedRaw', 'sneakCurrentRaw', 'jumping', 'sneaking', 'sprinting', 'wantUp', 'wantDown', 'startJumping', 'horizontalCollision', 'verticalCollision', 'blockBreakingDelayEnabled']) {
      assert.ok(flags.has(name), name)
    }
    assert.ok(!flags.has('down'))
    assert.ok(!flags.has('persistSneak'))
    const persisted = cook({ persistSneak: true }, undefined, {})
    assert.ok(inputFlags(player(undefined, { bedrock: { keys: persisted.keys, input: persisted } })).has('persistSneak'))
  })

  it('reports only the constant flag before any tick', () => {
    assert.deepStrictEqual([...inputFlags(player())], ['blockBreakingDelayEnabled'])
  })

  it('builds the packet: eye position, rotation, velocity, move vectors and flags', () => {
    const input = cook({ forward: true, analogMoveVector: { x: 0.25 } }, undefined, {})
    const p = player([1, 2, 3], { bedrockYaw: 90, bedrockPitch: 10, bedrock: { keys: input.keys, input, actions: new Set(['handledTeleport', 'notAFlag']) } })
    p.vel.set(0.1, -0.2, 0.3)
    const packet = buildPlayerAuthInput(p) as Record<string, any>
    assert.deepStrictEqual(packet.position, { x: 1, y: f(2 + f(1.6200100183486938)), z: 3 })
    assert.deepStrictEqual([packet.yaw, packet.pitch, packet.head_yaw], [90, 10, 90])
    assert.deepStrictEqual(packet.delta, { x: f(0.1), y: f(-0.2), z: f(0.3) })
    assert.deepStrictEqual(packet.move_vector, input.move)
    assert.deepStrictEqual(packet.raw_move_vector, input.rawMove)
    assert.deepStrictEqual(packet.analogue_move_vector, { x: 0.25, z: 0 })
    assert.ok(packet.input_data.includes('handled_teleport') && packet.input_data.includes('up'))
    assert.ok(!packet.input_data.includes(undefined), 'an action with no flag is left out')
    assert.deepStrictEqual([packet.input_mode, packet.play_mode, packet.interaction_model], ['mouse', 'screen', 'touch'])
    const gamepad = cook({ inputMode: 'game_pad' }, undefined, {})
    assert.strictEqual(buildPlayerAuthInput(player(undefined, { bedrock: { keys: gamepad.keys, input: gamepad } })).input_mode, 'game_pad')
    assert.strictEqual((buildPlayerAuthInput(p, 1).position as { y: number }).y, f(2 + 1))
  })

  it('builds a packet before any tick with zero move vectors', () => {
    const packet = buildPlayerAuthInput(player()) as Record<string, any>
    assert.deepStrictEqual([packet.move_vector, packet.raw_move_vector, packet.analogue_move_vector], [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }])
  })
})
