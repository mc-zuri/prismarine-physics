/* eslint-env mocha */
// Bedrock movement through the public API (Physics + PlayerState on a prismarine-registry Bedrock registry, mineflayer
// entity shape with radian yaw and boolean controls). Exact per-tick behaviour is covered by the client recordings in
// bedrock-fixtures.test.js; these pin the integration surface and the vanilla cruise numbers (walk 4.317 b/s, sprint
// 5.612 b/s — identical to Java, as the recordings show).
const assert = require('assert')
const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')

const version = 'bedrock_1.26.45'
const registry = require('prismarine-registry')(version)
const Block = require('prismarine-block')(registry)

function blockAt (name, pos) {
  const b = new Block(registry.blocksByName[name].id, 0, 0)
  b.position = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))
  return b
}

const FLOOR_Y = 65

// pick(pos) returns a block name for cells above the floor, or nothing for air.
function worldFrom (pick) {
  return {
    getBlock (pos) {
      if (pos.y < FLOOR_Y) return blockAt('stone', pos)
      const name = pick && pick(pos)
      return blockAt(name || 'air', pos)
    }
  }
}

function fakePlayer () {
  return {
    version,
    registry,
    entity: {
      position: new Vec3(0.5, FLOOR_Y, 0.5),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
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
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    inventory: { slots: new Array(46).fill(null) },
    game: { gameMode: 'survival' }
  }
}

function simulate (world, control, ticks, setup) {
  const bot = fakePlayer()
  if (setup) setup(bot)
  const physics = Physics(registry, world)
  let maxY = bot.entity.position.y
  for (let i = 0; i < ticks; i++) {
    physics.simulatePlayer(new PlayerState(bot, control), world).apply(bot)
    maxY = Math.max(maxY, bot.entity.position.y)
  }
  return { bot, maxY }
}

const noControl = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
const flat = worldFrom(null)

describe('bedrock physics', function () {
  it('constructs the engine and PlayerState on bedrock data', function () {
    assert.doesNotThrow(() => Physics(registry, flat))
    assert.doesNotThrow(() => new PlayerState(fakePlayer(), { ...noControl }))
  })

  it('reads instant build from the abilities and Swift Sneak from the leggings', function () {
    const bot = fakePlayer()
    const plain = new PlayerState(bot, { ...noControl })
    assert.deepStrictEqual([plain.instabuild, plain.swiftSneak], [false, 0])
    bot.abilities = { flags: { instant_build: true } }
    const short = (value) => ({ type: 'short', value })
    const ench = [{ id: short(registry.enchantmentsByName.swift_sneak.id), lvl: short(3) }]
    bot.inventory.slots[7] = { name: 'leather_leggings', nbt: { type: 'compound', name: '', value: { ench: { type: 'list', value: { type: 'compound', value: ench } } } } }
    const state = new PlayerState(bot, { ...noControl })
    assert.deepStrictEqual([state.instabuild, state.swiftSneak], [true, 3])
  })

  it('walks forward (-z at yaw 0, the mineflayer convention) and stays grounded', function () {
    const { bot } = simulate(flat, { ...noControl, forward: true }, 20)
    assert.ok(bot.entity.position.z < -2, `should walk towards -z (z=${bot.entity.position.z.toFixed(2)})`)
    assert.ok(Math.abs(bot.entity.position.x - 0.5) < 1e-6, 'should not drift sideways')
    assert.strictEqual(bot.entity.onGround, true, 'should stay on the ground')
    assert.ok(Math.abs(bot.entity.position.y - FLOOR_Y) < 1e-6, 'y unchanged on flat ground')
  })

  it('reaches vanilla terminal walk/sprint speed', function () {
    // Average displacement over the last 20 of 100 ticks, past the acceleration ramp.
    const terminal = (sprint) => {
      const bot = fakePlayer()
      const physics = Physics(registry, flat)
      const control = { ...noControl, forward: true, sprint }
      let last = bot.entity.position.clone(); let sum = 0
      for (let t = 0; t < 100; t++) {
        physics.simulatePlayer(new PlayerState(bot, control), flat).apply(bot)
        if (t >= 80) sum += bot.entity.position.distanceTo(last) * 20
        last = bot.entity.position.clone()
      }
      return sum / 20
    }
    const walk = terminal(false)
    const sprint = terminal(true)
    assert.ok(Math.abs(walk - 4.317) < 0.02, `walk terminal 4.317 b/s (got ${walk.toFixed(3)})`)
    assert.ok(Math.abs(sprint - 5.612) < 0.03, `sprint terminal 5.612 b/s (got ${sprint.toFixed(3)})`)
  })

  it('first walking tick moves 0.098 blocks (0.1 attribute x 0.98 input damp)', function () {
    const { bot } = simulate(flat, { ...noControl, forward: true }, 1)
    assert.ok(Math.abs(bot.entity.position.z - (0.5 - 0.098)) < 1e-6, `z=${bot.entity.position.z}`)
    // velocity reported after friction: 0.098 * 0.546
    assert.ok(Math.abs(bot.entity.velocity.z + 0.098 * 0.546) < 1e-6, `vel.z=${bot.entity.velocity.z}`)
  })

  it('uses the server movement attribute when present', function () {
    const { bot } = simulate(flat, { ...noControl, forward: true }, 1, b => {
      b.entity.attributes = { 'minecraft:movement': { current: 0.2, min: 0, max: 1 } }
    })
    assert.ok(Math.abs(bot.entity.position.z - (0.5 - 0.196)) < 1e-6, `z=${bot.entity.position.z}`)
  })

  it('applies the sprint boost to the attribute base, not to a server total that already holds it', function () {
    // mineflayer's Bedrock adapter stores { value: current, default }; while sprinting the server's current value
    // already carries the 30% "Sprinting speed boost" modifier.
    const { bot } = simulate(flat, { ...noControl, forward: true, sprint: true }, 1, b => {
      b.entity.attributes = { 'minecraft:movement': { value: 0.13, default: 0.1, min: 0, max: 1 } }
    })
    const { bot: plain } = simulate(flat, { ...noControl, forward: true, sprint: true }, 1)
    assert.ok(Math.abs(bot.entity.position.z - plain.entity.position.z) < 1e-9, `z=${bot.entity.position.z} vs ${plain.entity.position.z}`)
    // and a raised base (0.2) sprints at 0.2 x 1.3
    const { bot: fast } = simulate(flat, { ...noControl, forward: true, sprint: true }, 1, b => {
      b.entity.attributes = { 'minecraft:movement': { value: 0.26, default: 0.2, min: 0, max: 1 } }
    })
    assert.ok(Math.abs((0.5 - fast.entity.position.z) - 2 * (0.5 - plain.entity.position.z)) < 1e-6, `z=${fast.entity.position.z}`)
  })

  it('keeps sprinting on an exact diagonal but not on a sideways input', function () {
    const dist = b => Math.hypot(b.entity.position.x - 0.5, b.entity.position.z - 0.5)
    const { bot: walk } = simulate(flat, { ...noControl, forward: true, right: true }, 1)
    const { bot: sprint } = simulate(flat, { ...noControl, forward: true, right: true, sprint: true }, 1)
    assert.ok(Math.abs(dist(sprint) - dist(walk) * 1.3) < 1e-6, `diagonal sprint ${dist(sprint)} vs walk ${dist(walk)}`)
    const { bot: strafe } = simulate(flat, { ...noControl, right: true }, 1)
    const { bot: strafeSprint } = simulate(flat, { ...noControl, right: true, sprint: true }, 1)
    assert.ok(Math.abs(dist(strafeSprint) - dist(strafe)) < 1e-9, 'a pure strafe never sprints')
  })

  it('levitation runs after the liquid drag and the auto-climb, in place of gravity', function () {
    const lev = b => {
      b.entity.effects = { 24: { amplifier: 0 } } // Bedrock wire id (levitation)
      b.entity.position.y = FLOOR_Y + 5; b.entity.onGround = false; b.entity.velocity.y = 0.1
    }
    const water = worldFrom(pos => pos.y < FLOOR_Y + 8 ? 'water' : null)
    // Levitation: y = y * 0.8 + 0.01 * level; in water the 0.8 drag runs first and the 0.005 sink is replaced
    const one = simulate(water, { ...noControl }, 1, lev).bot
    assert.ok(Math.abs(one.entity.velocity.y - (0.1 * 0.8 * 0.8 + 0.01)) < 1e-6, `water levitation (vel.y=${one.entity.velocity.y})`)
    const air = simulate(flat, { ...noControl }, 1, lev).bot
    assert.ok(Math.abs(air.entity.velocity.y - (0.1 * 0.8 + 0.01) * 0.98) < 1e-6, `air levitation then 0.98 drag (vel.y=${air.entity.velocity.y})`)
  })

  it('starts swimming from the sprint state when submerged, whichever way it looks', function () {
    const water = worldFrom(pos => pos.y < FLOOR_Y + 6 ? 'water' : null)
    const submerged = b => { b.entity.position.y = FLOOR_Y + 2; b.entity.onGround = false; b.entity.pitch = 0.7 } // looking up
    const { bot } = simulate(water, { ...noControl, forward: true, sprint: true }, 3, submerged)
    assert.strictEqual(bot.bedrockPhysicsState.swimming, true, 'a sprinting, fully submerged player swims even when looking up')
    // the swim pose is a 0.6 x 0.6 box (feet kept), and the liquid probe of a box too short to shrink by 0.401 is
    // its midpoint plane
    assert.ok(Math.abs(bot.bedrockPhysicsState.aabb.maxY - bot.bedrockPhysicsState.aabb.minY - 0.6) < 1e-5, 'horizontal pose box')
    // the view steers the swim upwards
    assert.ok(bot.entity.velocity.y > 0, `steered up (vel.y=${bot.entity.velocity.y})`)
  })

  it('stands on any scaffolding cell under its footprint, and drops through when sneaking', function () {
    // a one-wide scaffolding tower at (0, 0); the player walks off its edge along -z (yaw 0 faces -z in mineflayer),
    // overhanging the column before clearing it
    const tower = worldFrom(pos => (pos.y < FLOOR_Y + 3 && Math.floor(pos.x) === 0 && Math.floor(pos.z) === 0) ? 'scaffolding' : null)
    const top = b => { b.entity.position.set(0.5, FLOOR_Y + 3, 0.9); b.entity.onGround = true }
    const { bot } = simulate(tower, { ...noControl, forward: true }, 4, top)
    assert.ok(Math.abs(bot.entity.position.y - (FLOOR_Y + 3)) < 1e-6, `held while the box still overlaps the column (y=${bot.entity.position.y})`)
    assert.ok(bot.entity.position.z < 0.3, 'even with the centre past the edge')
    const { bot: off } = simulate(tower, { ...noControl, forward: true }, 12, top)
    assert.ok(off.entity.position.y < FLOOR_Y + 3 - 0.1, 'and falls once the footprint has cleared it')
    const { bot: down } = simulate(tower, { ...noControl, sneak: true }, 5, top)
    assert.ok(down.entity.position.y < FLOOR_Y + 3 - 0.1, 'sneaking descends through the scaffolding')
  })

  it('is stopped by a two-block wall (no phasing)', function () {
    const wall = worldFrom(pos => (pos.y < FLOOR_Y + 2 && Math.floor(pos.z) <= -1) ? 'stone' : null)
    const { bot } = simulate(wall, { ...noControl, forward: true }, 40)
    assert.ok(Math.abs(bot.entity.position.z - 0.3) < 1e-6, `should stop touching the wall (z=${bot.entity.position.z.toFixed(4)})`)
    assert.strictEqual(bot.entity.isCollidedHorizontally, true)
    assert.ok(Math.abs(bot.entity.position.y - FLOOR_Y) < 1e-6, 'should not climb a full-height wall without jumping')
  })

  it('falls under gravity and lands on the floor', function () {
    const { bot } = simulate(flat, { ...noControl }, 60, b => { b.entity.position.y = FLOOR_Y + 10; b.entity.onGround = false })
    assert.ok(Math.abs(bot.entity.position.y - FLOOR_Y) < 1e-6, `should land (y=${bot.entity.position.y})`)
    assert.strictEqual(bot.entity.onGround, true)
    // Bedrock reports the post-gravity velocity while standing: -0.08 * 0.98 (the recordings' idle delta.y)
    assert.ok(Math.abs(bot.entity.velocity.y + 0.0784) < 1e-6, `vel.y=${bot.entity.velocity.y}`)
  })

  it('jumps 0.42 on the first tick and reaches the vanilla apex', function () {
    const { bot, maxY } = simulate(flat, { ...noControl }, 1, b => { b.jumpQueued = true })
    assert.ok(Math.abs(bot.entity.position.y - (FLOOR_Y + 0.42)) < 1e-5, `first tick y=${bot.entity.position.y}`)
    const apex = simulate(flat, { ...noControl, jump: true }, 14).maxY
    assert.ok(Math.abs(apex - (FLOOR_Y + 1.2522)) < 1e-3, `apex ${(apex - FLOOR_Y).toFixed(4)} blocks`)
    assert.ok(maxY >= FLOOR_Y)
  })

  it('sprint jumping adds the 0.2 forward impulse', function () {
    const { bot } = simulate(flat, { ...noControl, forward: true, sprint: true, jump: true }, 1)
    // first tick: 0.13 * 0.98 from the sprint acceleration plus the 0.2 jump impulse, towards -z
    assert.ok(Math.abs(bot.entity.position.z - (0.5 - 0.98 * 0.13 - 0.2)) < 1e-6, `z=${bot.entity.position.z}`)
  })

  it('sneaks at 0.3 input scale and stops at an edge', function () {
    const { bot } = simulate(flat, { ...noControl, forward: true, sneak: true }, 1)
    assert.ok(Math.abs(bot.entity.position.z - (0.5 - 0.098 * 0.3)) < 1e-5, `z=${bot.entity.position.z}`)
    // floor ends at z < -1: the sneaking player must stop with its (shrunk) box still supported
    const ledge = { getBlock (pos) { return blockAt(pos.y < FLOOR_Y && pos.z >= -1 ? 'stone' : 'air', pos) } }
    const edge = simulate(ledge, { ...noControl, forward: true, sneak: true }, 80).bot
    assert.strictEqual(edge.entity.onGround, true, 'should not fall off')
    assert.ok(edge.entity.position.z > -1.3 && edge.entity.position.z < -0.9, `should hang over the edge (z=${edge.entity.position.z.toFixed(3)})`)
  })

  it('bounces on slime and is slowed on honey', function () {
    const slime = worldFrom(pos => pos.y < FLOOR_Y + 1 ? 'slime' : null)
    const { bot } = simulate(slime, { ...noControl }, 30, b => { b.entity.position.y = FLOOR_Y + 6; b.entity.onGround = false })
    assert.ok(bot.entity.position.y > FLOOR_Y + 2, `should rebound off slime (y=${bot.entity.position.y.toFixed(2)})`)
    const honey = worldFrom(pos => pos.y < FLOOR_Y + 1 ? 'honey_block' : null)
    const walk = simulate(honey, { ...noControl, forward: true }, 40, b => { b.entity.position.y = FLOOR_Y + 1 }).bot
    const stone = simulate(flat, { ...noControl, forward: true }, 40).bot
    assert.ok(0.5 - walk.entity.position.z < (0.5 - stone.entity.position.z) * 0.5, 'honey should at least halve the distance walked')
    const jump = simulate(honey, { ...noControl, jump: true }, 12, b => { b.entity.position.y = FLOOR_Y + 1 }).maxY
    assert.ok(jump - (FLOOR_Y + 1) < 0.6, `honey jump is 0.42 * 0.6 (apex ${(jump - FLOOR_Y - 1).toFixed(3)})`)
  })

  it('sinks slowly in water, rises with jump held and walks at 0.02 speed', function () {
    const pool = worldFrom(pos => pos.y < FLOOR_Y + 6 ? 'water' : null)
    const start = b => { b.entity.position.y = FLOOR_Y + 3; b.entity.onGround = false }
    const sink = simulate(pool, { ...noControl }, 40, start).bot
    assert.strictEqual(sink.entity.isInWater, true)
    assert.ok(sink.entity.position.y < FLOOR_Y + 3 && sink.entity.position.y > FLOOR_Y + 1, `sinks gently (y=${sink.entity.position.y.toFixed(2)})`)
    assert.ok(Math.abs(sink.entity.velocity.y + 0.025) < 1e-3, `terminal sink speed 0.005/(1-0.8) (vel.y=${sink.entity.velocity.y.toFixed(4)})`)
    const rise = simulate(pool, { ...noControl, jump: true }, 40, start).bot
    assert.ok(rise.entity.position.y > FLOOR_Y + 4, `rises with jump held (y=${rise.entity.position.y.toFixed(2)})`)
    const walk = simulate(pool, { ...noControl, forward: true }, 1, start).bot
    assert.ok(Math.abs(walk.entity.position.z - (0.5 - 0.02 * 0.98)) < 1e-6, `underwater speed 0.02 (z=${walk.entity.position.z})`)
  })

  it('enters the swim pose when sprinting submerged and follows the view direction', function () {
    const pool = worldFrom(pos => pos.y < FLOOR_Y + 8 ? 'water' : null)
    const start = b => { b.entity.position.y = FLOOR_Y + 3; b.entity.onGround = false; b.entity.pitch = -0.7 /* looking down */ }
    const swim = simulate(pool, { ...noControl, forward: true, sprint: true }, 30, start).bot
    assert.strictEqual(swim.entity.isInWater, true)
    assert.ok(swim.entity.position.y < FLOOR_Y + 1.5, `dives along the view (y=${swim.entity.position.y.toFixed(2)})`)
    const walk = simulate(pool, { ...noControl, forward: true }, 30, start).bot
    assert.ok(walk.entity.position.y > swim.entity.position.y + 0.5, 'walking underwater only sinks slowly')
  })

  it('climbs a ladder at 0.2 when pushing into it and holds when sneaking', function () {
    // ladder column at z=0 on a wall at z=1 (mineflayer yaw PI faces +z)
    const world = worldFrom(pos => {
      if (Math.floor(pos.z) === 1 && pos.y < FLOOR_Y + 6) return 'stone'
      if (Math.floor(pos.z) === 0 && Math.floor(pos.x) === 0 && pos.y < FLOOR_Y + 5) return 'ladder'
      return null
    })
    const climb = simulate(world, { ...noControl, forward: true }, 30, b => { b.entity.yaw = Math.PI }).bot
    assert.ok(climb.entity.position.y > FLOOR_Y + 3, `should climb (y=${climb.entity.position.y.toFixed(2)})`)
    const hang = simulate(world, { ...noControl, sneak: true }, 20, b => { b.entity.position.y = FLOOR_Y + 3; b.entity.onGround = false }).bot
    assert.ok(Math.abs(hang.entity.position.y - (FLOOR_Y + 3)) < 1e-6, `sneaking holds on the ladder (y=${hang.entity.position.y.toFixed(3)})`)
    const start = b => { b.entity.position.y = FLOOR_Y + 4; b.entity.onGround = false }
    const slide = simulate(world, { ...noControl }, 6, start).bot.entity.position.y - simulate(world, { ...noControl }, 5, start).bot.entity.position.y
    assert.ok(Math.abs(slide + 0.2) < 1e-5, `slides down at 0.2 per tick (got ${slide.toFixed(4)})`)
  })

  it('is slowed by cobwebs and reports isInWeb', function () {
    const web = worldFrom(pos => pos.y < FLOOR_Y + 4 ? 'web' : null)
    const start = b => { b.entity.position.y = FLOOR_Y + 3; b.entity.onGround = false }
    const { bot } = simulate(web, { ...noControl, forward: true }, 40, start)
    assert.strictEqual(bot.entity.isInWeb, true)
    assert.ok(bot.entity.position.y > FLOOR_Y + 2, `falls very slowly (y=${bot.entity.position.y.toFixed(2)})`)
    assert.ok(0.5 - bot.entity.position.z < 0.3, `crawls forward (z=${bot.entity.position.z.toFixed(3)})`)
    assert.strictEqual(bot.entity.velocity.z, 0, 'velocity is dropped after each move in a web')
  })

  it('holds an immobile player still: the NO_AI flag, or no health left', function () {
    const held = setup => simulate(flat, { ...noControl, forward: true, jump: true, sprint: true }, 5, b => {
      b.entity.position.y = FLOOR_Y + 3
      b.entity.onGround = false
      b.entity.velocity = new Vec3(0.1, 0.2, -0.3)
      setup(b)
    }).bot.entity
    for (const [name, setup] of [['no_ai', b => { b.entity.metadata = { flags: { no_ai: true } } }], ['dead', b => { b.health = 0 }]]) {
      const entity = held(setup)
      assert.deepStrictEqual([entity.position.x, entity.position.y, entity.position.z], [0.5, FLOOR_Y + 3, 0.5], `${name}: does not move`)
      assert.deepStrictEqual([entity.velocity.x, entity.velocity.y, entity.velocity.z], [0, 0, 0], `${name}: velocity cleared`)
    }
    const free = simulate(flat, { ...noControl, forward: true }, 5, b => { b.health = 20 }).bot.entity
    assert.ok(free.position.z < 0.5, 'a living player without the flag walks')
  })

  it('takes the per-lane minimum of overlapping slowdown blocks, not their product', function () {
    // straddling x = 1: a cobweb on one side, a sweet berry bush or another cobweb on the other. The web is below the
    // bush on every lane (0.25 < 0.8, 0.05 < 0.75), so the pair moves exactly as two webs do.
    const pair = other => worldFrom(pos => pos.y < FLOOR_Y + 4 ? (pos.x < 1 ? 'web' : other) : null)
    const start = b => { b.entity.position.x = 1; b.entity.position.y = FLOOR_Y + 3; b.entity.onGround = false }
    const mixed = simulate(pair('sweet_berry_bush'), { ...noControl, forward: true }, 10, start).bot.entity.position
    const webs = simulate(pair('web'), { ...noControl, forward: true }, 10, start).bot.entity.position
    assert.deepStrictEqual([mixed.x, mixed.y, mixed.z], [webs.x, webs.y, webs.z])
  })

  it('is pushed up by a soul sand bubble column and dragged down by a magma one', function () {
    // a column's blocks carry drag_down (set over magma), as the game's do
    const bubble = registry.blocksByName.bubble_column
    const bubbleState = (dragDown) => {
      for (let id = bubble.minStateId; id <= bubble.maxStateId; id++) {
        if (!!Block.fromStateId(id, 0)._properties.drag_down === dragDown) return id
      }
    }
    const column = (base) => ({
      getBlock (pos) {
        if (pos.y < FLOOR_Y) return blockAt('stone', pos)
        if (Math.floor(pos.x) !== 0 || Math.floor(pos.z) !== 0) return blockAt(pos.y < FLOOR_Y + 8 ? 'water' : 'air', pos)
        if (pos.y < FLOOR_Y + 1) return blockAt(base, pos)
        if (!(pos.y < FLOOR_Y + 8)) return blockAt('air', pos)
        const b = Block.fromStateId(bubbleState(base === 'magma'), 0)
        b.position = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))
        return b
      }
    })
    const start = b => { b.entity.position.y = FLOOR_Y + 4; b.entity.onGround = false }
    const up = simulate(column('soul_sand'), { ...noControl }, 20, start).bot
    assert.ok(up.entity.position.y > FLOOR_Y + 6, `rises (y=${up.entity.position.y.toFixed(2)})`)
    const down = simulate(column('magma'), { ...noControl }, 20, start).bot
    assert.ok(down.entity.position.y < FLOOR_Y + 2, `sinks (y=${down.entity.position.y.toFixed(2)})`)
  })

  it('keeps its float32 box across PlayerState instances and rebuilds it when the position changes', function () {
    const bot = fakePlayer()
    const physics = Physics(registry, flat)
    physics.simulatePlayer(new PlayerState(bot, { ...noControl, forward: true }), flat).apply(bot)
    const box = bot.bedrockPhysicsState.aabb
    physics.simulatePlayer(new PlayerState(bot, { ...noControl, forward: true }), flat).apply(bot)
    assert.strictEqual(bot.bedrockPhysicsState.aabb, box, 'box object survives a fresh PlayerState')
    bot.entity.position.x += 3 // server correction
    physics.simulatePlayer(new PlayerState(bot, { ...noControl }), flat).apply(bot)
    assert.notStrictEqual(bot.bedrockPhysicsState.aabb, box, 'box is rebuilt after an external move')
    assert.ok(Math.abs(bot.entity.position.x - 3.5) < 1e-6)
  })

  it('glides with an elytra and fireworks boost along the view', function () {
    const high = b => { b.entity.position.y = FLOOR_Y + 60; b.entity.onGround = false; b.entity.elytraFlying = true; b.entity.yaw = Math.PI; b.entity.pitch = 0 }
    const elytra = b => { high(b); b.inventory.slots[6] = { name: 'elytra' } }
    const glide = simulate(flat, { ...noControl }, 40, b => { elytra(b); b.entity.velocity.z = 0.5 }).bot
    const fall = simulate(flat, { ...noControl }, 40, b => { high(b); b.entity.velocity.z = 0.5 }).bot
    assert.strictEqual(glide.entity.elytraFlying, true)
    assert.ok(glide.entity.position.y > fall.entity.position.y + 10, `glides instead of falling (${glide.entity.position.y.toFixed(1)} vs ${fall.entity.position.y.toFixed(1)})`)
    assert.ok(glide.entity.position.z > fall.entity.position.z + 5, 'keeps forward speed')
    const boosted = simulate(flat, { ...noControl }, 40, b => { elytra(b); b.entity.velocity.z = 0.5; b.fireworkRocketDuration = 30 }).bot
    assert.ok(boosted.entity.position.z > glide.entity.position.z + 10, 'firework boost accelerates along the view')
    assert.strictEqual(boosted.fireworkRocketDuration, 0)
    const landed = simulate(flat, { ...noControl }, 200, b => { elytra(b); b.entity.pitch = -1.2 }).bot
    assert.strictEqual(landed.entity.elytraFlying, false, 'landing ends the glide')
    // Levitation applies whatever the travel: it damps and lifts the glide's vertical velocity too
    const lev = simulate(flat, { ...noControl }, 1, b => { elytra(b); b.entity.effects = { 24: { amplifier: 0 } } }).bot // 24: levitation
    const plain = simulate(flat, { ...noControl }, 1, elytra).bot
    assert.ok(Math.abs(lev.entity.velocity.y - (plain.entity.velocity.y * 0.8 + 0.01)) < 1e-6, `levitating glide (vel.y=${lev.entity.velocity.y} vs ${plain.entity.velocity.y})`)
  })

  it('flies in creative: hovers, ascends with jump, descends with sneak, moves at flySpeed', function () {
    const fly = b => { b.entity.position.y = FLOOR_Y + 10; b.entity.onGround = false; b.flying = true }
    const hover = simulate(flat, { ...noControl }, 40, fly).bot
    assert.ok(Math.abs(hover.entity.position.y - (FLOOR_Y + 10)) < 1e-6, `hovers (y=${hover.entity.position.y})`)
    const up = simulate(flat, { ...noControl, jump: true }, 20, fly).bot
    assert.ok(up.entity.position.y > FLOOR_Y + 13, `ascends (y=${up.entity.position.y.toFixed(2)})`)
    const down = simulate(flat, { ...noControl, sneak: true }, 20, fly).bot
    assert.ok(down.entity.position.y < FLOOR_Y + 7, `descends (y=${down.entity.position.y.toFixed(2)})`)
    const forward = simulate(flat, { ...noControl, forward: true }, 1, fly).bot
    assert.ok(Math.abs(forward.entity.position.z - (0.5 - 0.05 * 0.98)) < 1e-6, `flySpeed 0.05 (z=${forward.entity.position.z})`)
    const sprint = simulate(flat, { ...noControl, forward: true, sprint: true }, 1, fly).bot
    assert.ok(Math.abs(sprint.entity.position.z - (0.5 - 0.1 * 0.98)) < 1e-6, 'sprint doubles the fly speed')
    // sneaking descends without ending the flight sprint
    const sprintDown = simulate(flat, { ...noControl, forward: true, sprint: true, sneak: true }, 1, fly).bot
    assert.ok(Math.abs(sprintDown.entity.position.z - (0.5 - 0.1 * 0.98)) < 1e-6, 'sprint + sneak keeps the doubled fly speed')
    assert.ok(sprintDown.entity.position.y < FLOOR_Y + 10, 'and descends')
    // the ability fly speed (mineflayer: bot.abilities.flySpeed) replaces the 0.05 default
    const fast = simulate(flat, { ...noControl, forward: true }, 1, b => { fly(b); b.abilities = { flags: { flying: true }, flySpeed: 0.1 } }).bot
    assert.ok(Math.abs(fast.entity.position.z - (0.5 - 0.1 * 0.98)) < 1e-6, `flySpeed 0.1 (z=${fast.entity.position.z})`)
    // horizontal drag is 0.91 in the air, and a flying player standing on the ground lifts off (no ground friction)
    const twoTicks = simulate(flat, { ...noControl, forward: true }, 2, fly).bot
    assert.ok(Math.abs(twoTicks.entity.velocity.z + (0.049 * 0.91 + 0.049) * 0.91) < 1e-6, `air drag 0.91 (vel.z=${twoTicks.entity.velocity.z})`)
    const grounded = simulate(flat, { ...noControl, forward: true }, 2, b => { b.flying = true }).bot
    assert.strictEqual(grounded.entity.onGround, false, 'the liftoff nudge clears onGround')
    // the first tick still used the ground block's friction (0.6 x 0.91), the second is airborne
    assert.ok(Math.abs(grounded.entity.velocity.z + (0.049 * 0.546 + 0.049) * 0.91) < 1e-6, `ground friction only on the first tick (vel.z=${grounded.entity.velocity.z})`)
  })

  it('applies the fly toggle (intent) before the server grants the flying ability', function () {
    // double-tap jump: the client's intent adds the vertical fly impulse and hover damping while gravity still
    // applies; the flying travel type only comes with the ability (UpdateAbilities).
    const start = b => { b.entity.position.y = FLOOR_Y + 10; b.entity.onGround = false; b.flyIntent = true; b.flying = false }
    const one = simulate(flat, { ...noControl, jump: true }, 1, start).bot
    assert.ok(Math.abs(one.entity.velocity.y - (0.15000001 - 0.08) * 0.98) < 1e-6, `impulse then gravity (vel.y=${one.entity.velocity.y})`)
    // the hover damps the vertical velocity in creative only; a survival flyer keeps it
    const hover = simulate(flat, { ...noControl }, 1, b => { start(b); b.game.gameMode = 'creative'; b.entity.velocity.y = 0.2 }).bot
    assert.ok(Math.abs(hover.entity.velocity.y - (0.2 * 0.375 - 0.08) * 0.98) < 1e-6, `hover damping then gravity (vel.y=${hover.entity.velocity.y})`)
    const survival = simulate(flat, { ...noControl }, 1, b => { start(b); b.entity.velocity.y = 0.2 }).bot
    assert.ok(Math.abs(survival.entity.velocity.y - (0.2 - 0.08) * 0.98) < 1e-6, `no hover damping in survival (vel.y=${survival.entity.velocity.y})`)
  })

  it('slows to 0.1225x while using an item', function () {
    const { bot } = simulate(flat, { ...noControl, forward: true }, 1, b => { b.usingHeldItem = true })
    assert.ok(Math.abs(bot.entity.position.z - (0.5 - 0.098 * 0.122499995)) < 1e-6, `z=${bot.entity.position.z}`)
  })

  it('moves slowly in lava with 0.5 drag and 0.02 gravity', function () {
    const lava = worldFrom(pos => pos.y < FLOOR_Y + 6 ? 'lava' : null)
    const start = b => { b.entity.position.y = FLOOR_Y + 3; b.entity.onGround = false }
    const sink = simulate(lava, { ...noControl }, 40, start).bot
    assert.strictEqual(sink.entity.isInLava, true)
    assert.ok(Math.abs(sink.entity.velocity.y + 0.04) < 1e-3, `terminal sink 0.02/(1-0.5) (vel.y=${sink.entity.velocity.y.toFixed(4)})`)
    const rise = simulate(lava, { ...noControl, jump: true }, 40, start).bot
    assert.ok(rise.entity.position.y > FLOOR_Y + 3, `rises with jump held (y=${rise.entity.position.y.toFixed(2)})`)
    // the sneak sink input is water-only
    const sneak = simulate(lava, { ...noControl, sneak: true }, 40, start).bot
    assert.ok(Math.abs(sneak.entity.position.y - sink.entity.position.y) < 1e-9, 'sneaking does not sink faster in lava')
  })

  it('auto-steps up a slab (<= stepHeight) but not a full block', function () {
    const slab = worldFrom(pos => (pos.y < FLOOR_Y + 1 && Math.floor(pos.z) <= -1) ? 'oak_slab' : null)
    const { bot } = simulate(slab, { ...noControl, forward: true }, 40)
    assert.ok(Math.abs(bot.entity.position.y - (FLOOR_Y + 0.5)) < 1e-6, `should stand on the slab (y=${bot.entity.position.y.toFixed(3)})`)
    assert.ok(bot.entity.position.z < -2, 'should travel over the slab')
    const block = worldFrom(pos => (pos.y < FLOOR_Y + 1 && Math.floor(pos.z) <= -1) ? 'stone' : null)
    const blocked = simulate(block, { ...noControl, forward: true }, 40).bot
    assert.ok(Math.abs(blocked.entity.position.y - FLOOR_Y) < 1e-6, 'a full block is above stepHeight')
  })

  // ---- the client's input pipeline (lib/bedrock-input.js) and the packet it sends (lib/bedrock-pai.js) ----------

  function run (world, ticks, controlOf, setup) {
    const bot = fakePlayer()
    if (setup) setup(bot)
    const physics = Physics(registry, world)
    const packets = []
    for (let t = 0; t < ticks; t++) {
      const state = new PlayerState(bot, { ...noControl, ...controlOf(t) })
      physics.simulatePlayer(state, world).apply(bot)
      packets.push(physics.playerAuthInput(state))
    }
    return { bot, packets }
  }
  const flags = (packet, ...names) => names.map(name => packet.input_data.includes(name))

  it('builds the PlayerAuthInput from the tick: position, delta, move vectors, flags and the constant modes', function () {
    const { packets } = run(flat, 2, () => ({ forward: true, sprint: true }))
    const p = packets[1]
    assert.deepStrictEqual(Object.keys(p).sort(), ['analogue_move_vector', 'camera_orientation', 'delta', 'head_yaw', 'input_data', 'input_mode', 'interact_rotation', 'interaction_model', 'move_vector', 'pitch', 'play_mode', 'position', 'raw_move_vector', 'yaw'])
    assert.strictEqual(p.input_mode, 'mouse')
    assert.strictEqual(p.play_mode, 'screen')
    assert.strictEqual(p.interaction_model, 'touch')
    assert.ok(Math.abs(p.position.y - (FLOOR_Y + 1.6200100183486938)) < 1e-6, 'the position is the eye position')
    assert.deepStrictEqual(p.move_vector, { x: 0, z: 1 }, 'the cooked move: forward, unit length')
    assert.deepStrictEqual(p.raw_move_vector, { x: 0, z: 1 })
    assert.deepStrictEqual(p.analogue_move_vector, { x: 0, z: 0 })
    assert.deepStrictEqual(flags(p, 'up', 'sprint_down', 'sprinting', 'block_breaking_delay_enabled', 'vertical_collision', 'jump_down'), [true, true, true, true, true, false])
    assert.deepStrictEqual(flags(packets[0], 'start_sprinting'), [true], 'the sprint starts on the first forward tick with the key down')
    assert.deepStrictEqual(flags(packets[1], 'start_sprinting'), [false], 'a start is a one-tick event')
    assert.strictEqual(p.delta.z, Math.fround(p.delta.z), 'the delta is the float32 velocity after friction')
    assert.ok(p.delta.z < 0 && Math.abs(p.delta.y + 0.0784) < 1e-6)
  })

  it('reports the raw edges: a jump press and release, the sneak level, and edges supplied through control.raw', function () {
    const { packets } = run(flat, 3, t => (t === 1 ? { jump: true } : {}))
    assert.deepStrictEqual(flags(packets[1], 'jump_down', 'jumping', 'want_up', 'jump_pressed_raw', 'jump_current_raw', 'start_jumping'), [true, true, true, true, true, true])
    assert.deepStrictEqual(flags(packets[2], 'jump_down', 'jump_released_raw', 'jump_pressed_raw'), [false, true, false])
    const tapped = run(flat, 1, () => ({ raw: { jumpPressed: true, jumpReleased: true } })).packets[0]
    assert.deepStrictEqual(flags(tapped, 'jump_pressed_raw', 'jump_released_raw', 'jump_down'), [true, true, false], 'a tap inside one tick carries both edges and no level')
    const sneak = run(flat, 2, () => ({ sneak: true })).packets
    assert.deepStrictEqual(flags(sneak[0], 'sneak_down', 'sneaking', 'want_down', 'sneak_pressed_raw', 'sneak_current_raw', 'start_sneaking'), [true, true, true, true, true, true])
    assert.deepStrictEqual(flags(sneak[1], 'start_sneaking', 'sneak_pressed_raw'), [false, false])
  })

  it('starts a sprint on a forward double tap and stops it against a wall or when the forward input drops', function () {
    // press, release, press within seven ticks: the second press starts the sprint without the sprint key
    const tap = run(flat, 4, t => ({ forward: t !== 1 })).packets
    assert.deepStrictEqual(tap.map(p => flags(p, 'start_sprinting')[0]), [false, false, true, false])
    assert.deepStrictEqual(flags(tap[3], 'sprinting'), [false], 'the sprinting bit is the sprint key, not the flag')
    const late = run(flat, 12, t => ({ forward: t < 1 || t > 9 })).packets
    assert.ok(!late.some(p => flags(p, 'start_sprinting')[0]), 'a second tap after the window does not start')
    // releasing forward stops the sprint on the release tick; a wall stops it once the position stops advancing
    const release = run(flat, 4, t => ({ forward: t < 2, sprint: true })).packets
    assert.deepStrictEqual(release.map(p => flags(p, 'stop_sprinting')[0]), [false, false, true, false])
    const wall = worldFrom(pos => Math.floor(pos.z) <= -1 && pos.y < FLOOR_Y + 3 ? 'stone' : null)
    const blocked = run(wall, 12, () => ({ forward: true, sprint: true })).packets
    const stopAt = blocked.findIndex(p => flags(p, 'stop_sprinting')[0])
    assert.ok(stopAt > 0 && stopAt < 6, `the sprint stops at the wall (tick ${stopAt})`)
    assert.ok(flags(blocked[stopAt + 1], 'start_sprinting', 'stop_sprinting').every(Boolean), 'held against the wall, the sprint restarts and stops every tick')
  })

  it('keeps the sneak scale on the release tick and crawls under a low ceiling', function () {
    const { packets } = run(flat, 3, t => ({ forward: true, sneak: t < 1 }))
    assert.ok(Math.abs(packets[0].move_vector.z - 0.3) < 1e-6, 'sneaking scales the move to 0.3')
    assert.ok(Math.abs(packets[1].move_vector.z - 0.3) < 1e-6, 'the flag is still on when the release tick is cooked')
    assert.deepStrictEqual(flags(packets[1], 'stop_sneaking'), [true])
    assert.strictEqual(packets[2].move_vector.z, 1)
    const low = worldFrom(pos => pos.y >= FLOOR_Y + 1 && pos.y < FLOOR_Y + 2 ? 'stone' : null) // a one-block gap over the floor
    const crawl = run(low, 3, () => ({})).packets
    assert.deepStrictEqual(flags(crawl[0], 'start_crawling'), [true], 'no room to stand or sneak: the player crawls')
    assert.deepStrictEqual(flags(crawl[1], 'start_crawling', 'stop_crawling'), [false, false])
    const moving = run(low, 2, () => ({ forward: true })).packets
    assert.ok(Math.abs(moving[1].move_vector.z - 0.3) < 1e-6, 'crawling scales the move like sneaking')
  })

  it('starts a glide on a jump press in the air with an elytra and toggles flight on a double jump when it may fly', function () {
    const high = b => { b.entity.position.y = FLOOR_Y + 30; b.entity.onGround = false; b.inventory.slots[6] = { name: 'elytra' } }
    const glide = run(flat, 4, t => ({ jump: t === 1 }), high).packets
    assert.deepStrictEqual(glide.map(p => flags(p, 'start_gliding')[0]), [false, true, false, false])
    const held = run(flat, 4, t => ({ jump: t >= 1 }), high).packets
    assert.deepStrictEqual(held.map(p => flags(p, 'start_gliding')[0]), [false, true, false, false], 'a held jump starts the glide once')
    const landed = run(flat, 200, t => ({ jump: t === 1 }), b => { high(b); b.entity.pitch = -1.2 })
    assert.strictEqual(landed.bot.entity.elytraFlying, false)
    assert.ok(landed.packets.some(p => flags(p, 'stop_gliding')[0]), 'landing stops the glide on the next tick')
    const mayFly = b => { b.abilities = { flags: { mayFly: true, flying: false } } }
    const toggle = run(flat, 4, t => ({ jump: t === 0 || t === 2 }), mayFly).packets
    assert.deepStrictEqual(toggle.map(p => flags(p, 'start_flying')[0]), [false, false, true, false])
    const noFly = run(flat, 4, t => ({ jump: t === 0 || t === 2 })).packets
    assert.ok(!noFly.some(p => flags(p, 'start_flying')[0]), 'without the may-fly ability the double tap does nothing')
    const slow = run(flat, 12, t => ({ jump: t === 0 || t === 9 }), mayFly).packets
    assert.ok(!slow.some(p => flags(p, 'start_flying')[0]), 'a second tap after seven ticks does not toggle')
    const wire = run(flat, 4, t => ({ jump: t === 0 || t === 2 }), b => { b.abilities = { flags: { may_fly: true } } }).packets
    assert.ok(wire[2] && flags(wire[2], 'start_flying')[0], 'the ability as the protocol names it')
    const creative = run(flat, 4, t => ({ jump: t === 0 || t === 2 }), b => { b.game = { gameMode: 'creative' } }).packets
    assert.ok(!flags(creative[2], 'start_flying')[0], 'the game mode alone gives no ability')
  })

  it('takes flight and no-clip from the abilities, not the game mode', function () {
    const bot = fakePlayer()
    bot.game = { gameMode: 'spectator' }
    const state = new PlayerState(bot, { ...noControl })
    assert.deepStrictEqual([state.flying, state.mayFly, state.noClip], [false, false, false])
    bot.abilities = { flags: { flying: true, no_clip: true } }
    assert.deepStrictEqual([new PlayerState(bot, { ...noControl }).flying, new PlayerState(bot, { ...noControl }).noClip], [true, true])
    bot.game = { gameMode: 'survival' }
    bot.abilities = { flags: { no_clip: true } }
    assert.strictEqual(new PlayerState(bot, { ...noControl }).noClip, true)
    bot.abilities = { flags: {} }
    bot.itemUseStarted = true
    const using = new PlayerState(bot, { ...noControl })
    assert.strictEqual(using.itemUseStarted, true)
    using.itemUseStarted = false
    using.apply(bot)
    assert.strictEqual(bot.itemUseStarted, false, 'consumed')
    assert.deepStrictEqual([new PlayerState(bot, { ...noControl }).noClip, new PlayerState(bot, { ...noControl }).mayFly], [false, false])
  })

  it('handles a teleport like the client: the target reported with handled_teleport, no travel on that tick', function () {
    const bot = fakePlayer()
    const physics = Physics(registry, flat)
    const state = new PlayerState(bot, { ...noControl, forward: true })
    physics.handleTeleport(state, { x: 10.5, y: FLOOR_Y + 5 + 1.6200100183486938, z: -3.5, yaw: 90, pitch: 0, mode: 2, onGround: false })
    physics.simulatePlayer(state, flat).apply(bot)
    const packet = physics.playerAuthInput(state)
    assert.deepStrictEqual(flags(packet, 'handled_teleport', 'up'), [true, true])
    assert.ok(Math.abs(packet.position.x - 10.5) < 1e-6 && Math.abs(packet.position.z + 3.5) < 1e-6, 'the teleport tick reports the target')
    assert.deepStrictEqual(packet.delta, { x: 0, y: 0, z: 0 }, 'no travel, no gravity on the teleport tick')
    const next = new PlayerState(bot, { ...noControl, forward: true })
    physics.simulatePlayer(next, flat).apply(bot)
    assert.strictEqual(flags(physics.playerAuthInput(next), 'handled_teleport')[0], false)
    assert.ok(bot.entity.velocity.y < 0, 'the next tick moves again')
  })

  // Being under water asks whether the eye is below its cell's liquid SURFACE, not whether the cell is water.
  // Standing on the floor the eye is at 66.62, in cell 66: a source fills that cell to its top, but water of depth 6
  // stops 7/9 of a block short of it -- surface 66.33 -- and leaves the eye in the air. The recordings cannot show
  // this; their worlds carry no liquid_depth, so every cell reads as a source.
  it('puts the eye under water only below its cell\'s liquid surface, which flowing water holds lower', function () {
    const water = (depth) => ({
      getBlock (pos) {
        if (pos.y < FLOOR_Y) return blockAt('stone', pos)
        const name = pos.y < FLOOR_Y + 2 ? 'water' : 'air'
        const block = blockAt(name, pos)
        if (name === 'water') block.getProperties = () => ({ liquid_depth: depth })
        return block
      }
    })
    const headInWater = (depth) => {
      const { bot } = simulate(water(depth), noControl, 1, (bot) => { bot.entity.isInWater = true })
      return !!bot.bedrockPhysicsState.headInWater
    }
    assert.strictEqual(headInWater(0), true, 'a source cell reaches the eye')
    assert.strictEqual(headInWater(3), true, 'depth 3: surface 66.67, still above the eye')
    assert.strictEqual(headInWater(6), false, 'depth 6: surface 66.33, below the eye')
    assert.strictEqual(headInWater(8), true, 'falling water (depth 8 and up) reads as a source')
  })
})
