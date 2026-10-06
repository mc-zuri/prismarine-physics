/* eslint-env mocha */
// A prediction is the tick that follows: a PlayerState made from the bot as a client exposes it after a tick (its
// position, velocity, flags and a copy of the engine's state), simulated one tick with the inputs the client then
// sends, is the player BedrockSession steps with those inputs, bit for bit. mineflayer-pathfinder plans with such
// predictions; without a server to correct the player, any difference is a move it did not plan.
const assert = require('assert')
const { Physics, PlayerState, BedrockSession } = require('prismarine-physics')
const { cloneValue } = require('../../lib/bedrock/network/rewind.ts')
const { Vec3 } = require('vec3')

const registry = require('prismarine-registry')('bedrock_1.26.45')
const Block = require('prismarine-block')(registry)

const FLOOR_Y = 65
const EAST = -Math.PI / 2
const KEYS = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']

// Along +x from the start: a block to jump onto, a pool 4 deep with a bank to climb out on, and a pit to sneak to
function course () {
  const placed = new Map()
  const name = ({ x, y, z }) => {
    const key = `${x},${y},${z}`
    if (placed.has(key)) return placed.get(key)
    if (x === 5 && y === FLOOR_Y && z === 0) return 'stone'
    if (x >= 12 && x <= 18 && z >= -3 && z <= 3 && y >= FLOOR_Y - 4 && y < FLOOR_Y) return 'water'
    if (x >= 30 && x <= 34 && z >= -3 && z <= 3 && y >= FLOOR_Y - 6 && y < FLOOR_Y) return 'air'
    return y < FLOOR_Y ? 'stone' : 'air'
  }
  return {
    getBlock (pos) {
      const at = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }
      const b = new Block(registry.blocksByName[name(at)].id, 0, 0)
      b.position = new Vec3(at.x, at.y, at.z)
      return b
    },
    set (x, y, z, block) {
      placed.set(`${x},${y},${z}`, block)
    }
  }
}

const exact = v => new Vec3(v.x, v.y, v.z)

// a mineflayer inventory's slots: the chest's an elytra when worn
function slots (elytra) {
  const list = new Array(46).fill(null)
  if (elytra) list[6] = { name: 'elytra', count: 1 }
  return list
}

// The bot as the gameplay client's pathfinder adapter shows the live player: exact copies, never the engine's own
// objects
function botOf (live, frame, { gameMode, mayFly, elytra }) {
  return {
    registry,
    entity: {
      position: exact(live.pos),
      velocity: exact(live.vel),
      onGround: live.onGround,
      isInWater: !!live.isInWater,
      isInLava: !!live.isInLava,
      isInWeb: !!live.isInWeb,
      isCollidedHorizontally: !!live.isCollidedHorizontally,
      isCollidedVertically: !!live.isCollidedVertically,
      elytraFlying: !!live.elytraFlying,
      yaw: frame.yaw,
      pitch: frame.pitch,
      effects: {},
      attributes: cloneValue(live.attributes ?? {})
    },
    bedrockPhysicsState: live.bedrock === undefined ? undefined : cloneValue(live.bedrock),
    jumpTicks: live.jumpTicks ?? 0,
    jumpQueued: live.jumpQueued ?? false,
    fireworkRocketDuration: live.fireworkRocketDuration ?? 0,
    fireworkUsed: !!frame.fireworkUsed,
    abilities: { flags: { mayFly, flying: !!live.flying } },
    food: 20,
    inventory: { slots: slots(elytra) },
    game: { gameMode }
  }
}

function livePlayer ({ gameMode, mayFly, elytra }) {
  const bot = {
    registry,
    entity: { position: new Vec3(0.5, FLOOR_Y, 0.5), velocity: new Vec3(0, 0, 0), onGround: true, yaw: EAST, pitch: 0, effects: {}, attributes: {} },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    abilities: { flags: { mayFly } },
    inventory: { slots: slots(elytra) },
    game: { gameMode }
  }
  return new PlayerState(bot, Object.fromEntries(KEYS.map(k => [k, false])))
}

// What a tick's state is made of, to compare: the engine's own state included
function snapshot (state) {
  return {
    pos: [state.pos.x, state.pos.y, state.pos.z],
    vel: [state.vel.x, state.vel.y, state.vel.z],
    onGround: state.onGround,
    isInWater: !!state.isInWater,
    isInLava: !!state.isInLava,
    isCollidedHorizontally: !!state.isCollidedHorizontally,
    isCollidedVertically: !!state.isCollidedVertically,
    jumpTicks: state.jumpTicks,
    jumpQueued: state.jumpQueued,
    flying: !!state.bedrock?.flying,
    elytraFlying: !!state.elytraFlying,
    fireworkRocketDuration: state.fireworkRocketDuration ?? 0,
    bedrock: cloneValue(state.bedrock)
  }
}

// Steps the scripted inputs through a session, predicting each tick first; returns what the run went through
function run (script, options, setup) {
  const world = course()
  const physics = Physics(registry, world)
  const session = new BedrockSession({ physics, world })
  session.handlePacket('start_game', { runtime_entity_id: 1n })
  const live = livePlayer(options)
  if (setup) setup(live)
  const seen = { water: 0, air: 0, swimming: 0, sneaking: 0, flying: 0, gliding: 0, boosted: 0, maxY: live.pos.y, minY: live.pos.y }
  let t = 0
  for (const segment of script) {
    for (let i = 0; i < segment.ticks; i++) {
      t++
      if (segment.before) segment.before(i, live, world)
      const control = Object.fromEntries(KEYS.map(k => [k, !!segment.keys?.[k]]))
      // (a firework rocket used on the segment's first tick)
      const frame = { t, control, yaw: segment.yaw ?? EAST, pitch: segment.pitch ?? 0, fireworkUsed: !!segment.firework && i === 0 }
      const predicted = physics.simulatePlayer(new PlayerState(botOf(live, frame, options), { ...control }), world)
      const expected = snapshot(predicted)
      session.tick(live, frame)
      assert.deepStrictEqual(snapshot(live), expected, `tick ${t} (${segment.name} ${i}): the prediction is not the tick`)
      if (live.isInWater) seen.water++
      if (!live.onGround && !live.isInWater) seen.air++
      if (live.bedrock?.swimming) seen.swimming++
      if (live.bedrock?.sneaking) seen.sneaking++
      if (live.bedrock?.flying) seen.flying++
      if (live.elytraFlying) seen.gliding++
      if (live.fireworkRocketDuration > 0) seen.boosted++
      seen.maxY = Math.max(seen.maxY, live.pos.y)
      seen.minY = Math.min(seen.minY, live.pos.y)
    }
  }
  return { seen, live }
}

const walk = { forward: true }
const sprint = { forward: true, sprint: true }

describe('bedrock predictions', function () {
  it('a tick predicted on land, in the water and at an edge is the tick', function () {
    const { seen, live } = run([
      { name: 'stand', ticks: 5 },
      { name: 'walk', ticks: 10, keys: walk },
      { name: 'jump onto the block', ticks: 14, keys: { ...walk, jump: true } },
      { name: 'sprint off it', ticks: 12, keys: sprint },
      { name: 'sprint-jump into the pool', ticks: 12, keys: { ...sprint, jump: true } },
      { name: 'sink', ticks: 25, keys: { sneak: true } },
      { name: 'swim up', ticks: 30, keys: { jump: true } },
      { name: 'swim-sprint diving', ticks: 25, keys: sprint, pitch: 40 },
      { name: 'swim-sprint up', ticks: 20, keys: sprint, pitch: -40 },
      { name: 'swim to the bank and climb out', ticks: 60, keys: { ...walk, jump: true } },
      { name: 'walk on', ticks: 20, keys: walk },
      { name: 'sneak to the pit', ticks: 160, keys: { ...walk, sneak: true } }
    ], { gameMode: 'survival', mayFly: false })
    assert.ok(seen.water > 50, `in the water ${seen.water} ticks`)
    assert.ok(seen.swimming > 0, 'swam')
    assert.ok(seen.air > 10, `in the air ${seen.air} ticks`)
    assert.ok(seen.minY < FLOOR_Y - 2, `sank to ${seen.minY}`)
    assert.ok(seen.sneaking > 0, 'sneaked')
    assert.ok(live.pos.x > 29 && live.pos.x < 30.5 && live.onGround, `stopped at the pit's edge: ${live.pos}`)
  })

  it('a tick predicted while a pillar is built under the player is the tick', function () {
    // the top of the pillar: the feet stand on it
    let top = FLOOR_Y
    const { live } = run([
      { name: 'stand', ticks: 3 },
      {
        name: 'pillar',
        ticks: 36,
        keys: { jump: true },
        // a block under the feet as soon as they cleared its cell, as a player places it
        before (i, state, world) {
          if (state.pos.y >= top + 1) {
            world.set(0, top, 0, 'stone')
            top++
          }
        }
      },
      { name: 'stand on it', ticks: 10 }
    ], { gameMode: 'survival', mayFly: false })
    assert.ok(live.pos.y >= FLOOR_Y + 2 && live.onGround, `on the pillar: ${live.pos}`)
  })

  it('a tick predicted from a velocity of -0 is the tick', function () {
    // the engine leaves -0 in a velocity (a fall straight down after a move along x); a copy that adds 0 makes it 0
    const { live } = run([{ name: 'fall', ticks: 3 }], { gameMode: 'survival', mayFly: false }, live => {
      live.pos.y += 3
      live.onGround = false
      live.vel.set(0, 0, -0)
    })
    assert.ok(Object.is(live.vel.z, -0), `vel.z ${live.vel.z}`)
  })

  it('a tick predicted while a creative player double-taps into flight and flies is the tick', function () {
    const { seen } = run([
      { name: 'stand', ticks: 3 },
      { name: 'tap', ticks: 1, keys: { jump: true } },
      { name: 'let go', ticks: 2 },
      { name: 'tap again', ticks: 1, keys: { jump: true } },
      { name: 'fly up', ticks: 15, keys: { jump: true } },
      { name: 'fly on', ticks: 20, keys: sprint },
      { name: 'fly down', ticks: 15, keys: { sneak: true } }
    ], { gameMode: 'creative', mayFly: true })
    assert.ok(seen.flying > 30, `flew ${seen.flying} ticks`)
  })

  it('a tick predicted while a player wearing an elytra glides, boosted by a firework rocket, and lands is the tick', function () {
    const { seen, live } = run([
      { name: 'fall', ticks: 6 },
      { name: 'jump in the air', ticks: 1, keys: { jump: true } },
      { name: 'glide', ticks: 15, pitch: 10 },
      { name: 'firework rocket', ticks: 15, pitch: -20, firework: true },
      { name: 'glide down', ticks: 120, pitch: 30 }
    ], { gameMode: 'survival', mayFly: false, elytra: true }, live => {
      live.pos.y += 60
      live.onGround = false
    })
    assert.ok(seen.gliding > 30, `glided ${seen.gliding} ticks`)
    assert.ok(seen.boosted > 5, `boosted ${seen.boosted} ticks`)
    // (on the ground, or in the pool on the way)
    assert.ok((live.onGround || live.isInWater) && !live.elytraFlying, `landed: ${live.pos}`)
  })
})
