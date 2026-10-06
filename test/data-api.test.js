/* eslint-env mocha */
// The engine without a bot: PlayerState from plain data, and the trig of each engine instance.
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { Physics, PlayerState } = require('../index.js')
const { world } = require('./helpers/world')

const data = require('minecraft-data')('1.21.4')
const NO_KEYS = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }

function bot (position) {
  return {
    registry: data,
    entity: {
      position,
      velocity: new Vec3(0, 0, 0),
      onGround: false,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: 0,
      pitch: 0,
      effects: {},
      attributes: {}
    },
    inventory: { slots: [] },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0
  }
}

// the fields a bot-shaped player gives the engine, as plain data
function dataOf (state) {
  const { control, ...fields } = state
  return fields
}

describe('PlayerState from plain data', () => {
  it('equals the state read from a bot with the same fields', () => {
    const fromBot = new PlayerState(bot(new Vec3(0.5, 70, 0.5)), { ...NO_KEYS })
    const fromData = new PlayerState(dataOf(fromBot), { ...NO_KEYS })
    assert.deepEqual({ ...fromData }, { ...fromBot })
    assert.ok(fromData instanceof PlayerState)
  })

  it('fills the fields left out with their defaults', () => {
    const state = new PlayerState({ pos: new Vec3(0, 70, 0), vel: new Vec3(0, 0, 0), yaw: 0, pitch: 0 })
    assert.equal(state.fallDistance, 0)
    assert.equal(state.sprinting, false)
    assert.equal(state.supportingBlockPos, null)
    assert.equal(state.jumpBoost, 0)
    assert.equal(state.elytraEquipped, false)
    assert.equal(state.control, undefined)
  })

  it('copies the position and velocity it is given', () => {
    const pos = new Vec3(0.5, 70, 0.5)
    const state = new PlayerState({ pos, vel: new Vec3(0, 0, 0) }, NO_KEYS)
    state.pos.y = 0
    assert.equal(pos.y, 70)
    assert.equal(state.control, NO_KEYS)
  })

  it('simulates the same as the state read from a bot', () => {
    const w = world(data)
    const fromBot = new PlayerState(bot(new Vec3(0.5, 70, 0.5)), { ...NO_KEYS, forward: true })
    const fromData = new PlayerState(dataOf(fromBot), { ...NO_KEYS, forward: true })
    const physics = Physics(data, w)
    for (let i = 0; i < 40; i++) {
      physics.simulatePlayer(fromBot, w)
      physics.simulatePlayer(fromData, w)
    }
    assert.deepEqual([fromData.pos, fromData.vel, fromData.onGround], [fromBot.pos, fromBot.vel, fromBot.onGround])
    assert.equal(fromData.onGround, true)
  })

  it('fromBot reads a bot and toBot writes the result back', () => {
    const player = bot(new Vec3(0.5, 64, 0.5))
    const state = PlayerState.fromBot(player, { ...NO_KEYS })
    state.pos = new Vec3(1, 2, 3)
    PlayerState.toBot(state, player)
    assert.deepEqual(player.entity.position, new Vec3(1, 2, 3))
  })

  it('carries a Bedrock swing at nothing through the data path and back to the bot', () => {
    const player = { ...bot(new Vec3(0.5, 64, 0.5)), missedSwing: true }
    const fromBot = PlayerState.fromBot(player, { ...NO_KEYS })
    assert.equal(fromBot.missedSwing, true)
    assert.deepEqual({ ...new PlayerState(dataOf(fromBot), { ...NO_KEYS }) }, { ...fromBot })
    assert.equal(new PlayerState({ pos: new Vec3(0, 70, 0), vel: new Vec3(0, 0, 0) }).missedSwing, false)
    fromBot.missedSwing = false
    fromBot.apply(player)
    assert.equal(player.missedSwing, false)
  })
})

describe('Physics trig option', () => {
  // A glide with a pitch reads the plain cos of the pitch (LocalPlayer's elytra code), so a different cos changes it
  function glide (options) {
    const w = world(data, {}, { floorY: -64 })
    const physics = Physics(data, w, options)
    const state = new PlayerState(bot(new Vec3(0.5, 100, 0.5)), { ...NO_KEYS })
    Object.assign(state, { elytraFlying: true, elytraEquipped: true, vel: new Vec3(0, -0.5, 0.5), pitch: -0.3, pitchDegrees: 17 })
    for (let i = 0; i < 10; i++) physics.simulatePlayer(state, w)
    return state.vel.clone()
  }

  it('uses the sin and cos given to the engine', () => {
    const calls = { sin: 0, cos: 0 }
    const trig = { sin: x => { calls.sin++; return Math.sin(x) }, cos: x => { calls.cos++; return Math.cos(x) } }
    const vel = glide({ trig })
    assert.ok(calls.sin > 0 && calls.cos > 0, 'the engine called the given functions')
    assert.deepEqual(vel, glide())
  })

  it('keeps each engine to its own trig', () => {
    const halfCos = { sin: Math.sin, cos: x => Math.cos(x) / 2 }
    const changed = glide({ trig: halfCos })
    assert.notDeepEqual(changed, glide())
    assert.deepEqual(glide(), glide({ trig: { sin: Math.sin, cos: Math.cos } }))
  })

  it('refuses a trig without functions', () => {
    assert.throws(() => Physics(data, world(data), { trig: { sin: Math.sin } }), /sin and cos functions/)
  })
})
