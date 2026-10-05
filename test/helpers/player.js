// A player for the engine, as mineflayer hands it over, and a few ticks of input.
const { Vec3 } = require('vec3')
const { Physics, PlayerState } = require('../../index.js')

const NO_KEYS = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }

/**
 * player(data, { pos, vel, onGround, yaw (degrees), pitch, keys, effects, ...state fields })
 * Yaw and pitch are vanilla degrees; the state keeps them as the engine reads them.
 */
function player (data, { pos = [0.5, 64, 0.5], vel = [0, 0, 0], onGround = true, yaw = 0, pitch = 0, keys = {}, effects = {}, entity = {}, ...fields } = {}) {
  const state = new PlayerState({
    registry: data,
    entity: {
      position: new Vec3(...pos),
      velocity: new Vec3(...vel),
      onGround,
      yaw: Math.PI - yaw * Math.PI / 180,
      pitch: -pitch * Math.PI / 180,
      effects,
      ...entity
    },
    inventory: { slots: [] },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0
  }, { ...NO_KEYS, ...keys })
  state.yawDegrees = yaw
  state.pitchDegrees = pitch
  return Object.assign(state, fields)
}

/** n ticks of the engine on `state` in `world`; `each(tick)` may change the input before each tick */
function run (data, world, state, n = 1, each) {
  const physics = Physics(data, world)
  for (let tick = 0; tick < n; tick++) {
    if (each) each(tick, state)
    physics.simulatePlayer(state, world)
  }
  return state
}

/** a plain record of the engine's state, for comparing versions */
function snapshot (state, fields = ['pos', 'vel', 'onGround']) {
  return Object.fromEntries(fields.map(field => {
    const value = state[field]
    return [field, value && typeof value === 'object' && 'x' in value ? [value.x, value.y, value.z] : value]
  }))
}

module.exports = { player, run, snapshot, NO_KEYS }
