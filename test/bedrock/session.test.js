/* eslint-env mocha */
// BedrockSession (lib/bedrock-session.js): the client's handling of the server's movement packets, as bedrock-protocol
// decodes them, around its own ticks. The exact per-tick behaviour of each action is held to the recordings by
// bedrock-fixtures.test.js, which drives the same session; these pin the packet layer: which packets are the local
// player's, what each one decodes to, and on which tick it takes effect.
const assert = require('assert')
const { Physics, PlayerState, BedrockSession } = require('prismarine-physics')
const { movementAttribute, restatedFlags } = require('../../lib/bedrock/network/session.ts')
const { Vec3 } = require('vec3')

const registry = require('prismarine-registry')('bedrock_1.26.45')
const Block = require('prismarine-block')(registry)
const FLOOR_Y = 65
const world = {
  getBlock (pos) {
    const b = new Block(registry.blocksByName[pos.y < FLOOR_Y ? 'stone' : 'air'].id, 0, 0)
    b.position = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))
    return b
  }
}
const EYE = 1.6200100183486938
const f = Math.fround

function player () {
  const bot = {
    registry,
    entity: { position: new Vec3(0.5, FLOOR_Y, 0.5), velocity: new Vec3(0, 0, 0), onGround: true, yaw: 0, pitch: 0, effects: {}, attributes: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    inventory: { slots: new Array(46).fill(null) },
    game: { gameMode: 'survival' }
  }
  return new PlayerState(bot, { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false })
}

const still = t => ({ t, control: { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false } })
const forward = t => ({ t, control: { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false } })

function setup () {
  const physics = Physics(registry, world)
  const session = new BedrockSession({ physics, world })
  session.handlePacket('start_game', { runtime_entity_id: 7n })
  return { physics, session, state: player() }
}

describe('BedrockSession packets', () => {
  it('takes a local teleport on the next tick and ignores another player\'s', () => {
    const { session, state } = setup()
    for (let t = 1; t <= 3; t++) session.tick(state, still(t))
    assert.strictEqual(session.handlePacket('move_player', { runtime_id: 8n, position: { x: 20.5, y: 70 + EYE, z: 0.5 }, pitch: 0, yaw: 0, head_yaw: 0, mode: 'teleport', on_ground: true, tick: 3n }), false)
    assert.strictEqual(session.handlePacket('move_player', { runtime_id: 7n, position: { x: 3.5, y: FLOOR_Y + EYE, z: 0.5 }, pitch: 0, yaw: 90, head_yaw: 90, mode: 'teleport', on_ground: true, tick: 3n }), true)
    assert.strictEqual(state.pos.x, 0.5, 'nothing happens until the next tick')
    session.tick(state, still(4))
    assert.strictEqual(state.pos.x, 3.5)
    assert.strictEqual(state.pos.y, f(f(FLOOR_Y + EYE) - f(EYE)))
    assert.ok(state.bedrock.actions.has('handledTeleport'), 'the tick reports HandledTeleport')
  })

  it('installs a movement correction on its tick and re-simulates the ticks since', () => {
    const { session, state } = setup()
    for (let t = 1; t <= 6; t++) session.tick(state, forward(t))
    const before = state.pos.x
    // the server says the player was 1 block to the side at the end of tick 3
    const at3 = session.rewind.snapshots.get(3)
    session.handlePacket('correct_player_move_prediction', { prediction_type: 'player', position: { x: at3.pos.x + 1, y: at3.pos.y + EYE, z: at3.pos.z }, delta: { x: at3.vel.x, y: at3.vel.y, z: at3.vel.z }, on_ground: true, tick: 3n })
    session.tick(state, forward(7))
    // ticks 4..6 re-simulated from the corrected tick 3, then tick 7: the whole path moved one block
    assert.ok(Math.abs(state.pos.x - (before + 1)) < 1e-4, `${state.pos.x} vs ${before + 1}`)
  })

  it('decodes the movement attribute: the default plus the additive modifiers, and the current value', () => {
    const attribute = movementAttribute({
      runtime_entity_id: 7n,
      tick: 12n,
      attributes: [
        { name: 'minecraft:health', current: 20, default: 20, modifiers: [] },
        { name: 'minecraft:movement', current: 0.13, default: 0.1, modifiers: [{ amount: -0.05, operation: 0 }, { amount: 0.3, operation: 2 }] }
      ]
    })
    assert.deepStrictEqual(attribute, { tick: 12, walk: f(f(0.1) + f(-0.05)), current: f(0.13) })
  })

  it('applies only the last movement attribute of the ones received together', () => {
    const { session, state, physics } = setup()
    session.tick(state, still(1))
    const packet = (current) => ({ runtime_entity_id: 7n, tick: 1n, attributes: [{ name: 'minecraft:movement', current, default: 0.1, modifiers: [] }] })
    session.handlePacket('update_attributes', packet(0.2))
    session.handlePacket('update_attributes', packet(0.3))
    session.tick(state, still(2))
    assert.strictEqual(state.attributes[physics.movementSpeedAttribute].current, f(0.3))
  })

  it('decodes the restated flags and the pose height of an entity-data packet', () => {
    const flags = restatedFlags({
      runtime_entity_id: 7n,
      tick: 40n,
      metadata: [
        { key: 'flags', type: 'long', value: { _value: '8', sneaking: false, sprinting: true, gliding: false, swimming: false } },
        { key: 'flags_extended', type: 'long', value: { _value: '0', crawling: false } },
        { key: 'boundingbox_height', type: 'float', value: 0.6000000238418579 },
        { key: 'health', type: 'int', value: 1 }
      ]
    })
    assert.deepStrictEqual(flags, { tick: 40, sneaking: false, sprinting: true, gliding: false, swimming: false, crawling: false, pushTowardsClosestSpace: false, spinning: false, height: 0.6000000238418579 })
    assert.strictEqual(restatedFlags({ tick: 1n, metadata: [{ key: 'health', type: 'int', value: 1 }] }), null)
  })

  it('writes a restated flag only where it differs from the frame after its stamp', () => {
    const { session, state } = setup()
    session.tick(state, still(1))
    state.bedrock.sprinting = false
    for (let t = 2; t <= 4; t++) session.tick(state, still(t))
    // the client was not sprinting at tick 2 and has started since: a restatement of sprinting=false for tick 2 is
    // the value the frame had, so the client's own later change stands
    state.bedrock.sprinting = true
    session.handlePacket('set_entity_data', { runtime_entity_id: 7n, tick: 2n, metadata: [{ key: 'flags', value: { sprinting: false } }] })
    session.runDue(state, 5)
    assert.strictEqual(state.bedrock.sprinting, true, 'a stale restatement of the value the frame had is dropped')
    // one that differs from the frame is written
    session.handlePacket('set_entity_data', { runtime_entity_id: 7n, tick: 2n, metadata: [{ key: 'flags', value: { sneaking: true } }] })
    session.runDue(state, 5)
    assert.strictEqual(state.bedrock.sneaking, true)
  })
})
