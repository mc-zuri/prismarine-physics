// Replays vanilla Java recordings (test/fixtures/java/<version>-recorded, written by physics-data-generator) through
// the engine and compares every tick. Generated test files (test/java/**) call recorded(); they hold no logic.
//
// A recording is: the world (world.json, block states as the server held them), the player state before the first
// tick, and per tick the input (keys, yaw, pitch in vanilla degrees) and the full state after it. Rarely-changing
// fields (effects, attributes, ...) appear only on ticks where they changed.
/* eslint-env mocha */
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const { Vec3 } = require('vec3')
const { Physics } = require('../..')
const packets = require('./java-packets')

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'java')
const SUFFIX = '-recorded'

// PlayerState fields the Java engine writes, compared on every tick.
const FIELDS = ['pos', 'vel', 'onGround', 'isCollidedHorizontally', 'isCollidedVertically', 'isInWater', 'isInLava',
  'isInWeb', 'elytraFlying']
const KEYS = { forward: 'forward', back: 'back', left: 'left', right: 'right', jump: 'jump', sprint: 'sprint', sneak: 'sneak' }
const EFFECTS = { jump_boost: 'jumpBoost', speed: 'speed', slowness: 'slowness', dolphins_grace: 'dolphinsGrace', slow_falling: 'slowFalling', levitation: 'levitation' }

// ---- step helpers (documentation of the inputs; checked against the recording) ----

const ticks = n => ({ op: 'ticks', ticks: n })
const press = (keys, n) => ({ op: 'press', keys: [keys].flat(), ticks: n })
const hold = (...keys) => ({ op: 'hold', keys: keys.flat() })
const release = (...keys) => ({ op: 'release', keys: keys.flat() })
const look = (yaw, pitch) => ({ op: 'look', yaw, pitch })
const turn = (dyaw, dpitch, n) => ({ op: 'turn', dyaw, dpitch, ticks: n })
const stable = (n, max) => ({ op: 'stable', n, ...(max ? { max } : {}) })
const stopped = (n, max) => ({ op: 'stopped', n, ...(max ? { max } : {}) })
const until = (cond, max) => ({ op: 'until', cond, ...(max ? { max } : {}) })
const settleFor = (n, max) => ({ op: 'stable', n, max, soft: true })
const untilOr = (cond, max) => ({ op: 'until', cond, max, soft: true })
// A server-side change the recorder made mid-case (effects, knockback, blocks...); its effect is in the recording.
const server = (...actions) => ({ op: 'server', actions })

// ---- fixtures ----

// Game data: from the node-minecraft-data package at PHYSREC_MCDATA when set (versions the installed one lacks),
// else the installed minecraft-data. One registry per version serves the engine, the blocks and the packet handlers.
const registries = new Map()
function registry (version) {
  if (!registries.has(version)) {
    let data = process.env.PHYSREC_MCDATA ? require(path.resolve(process.env.PHYSREC_MCDATA))(version) : undefined
    if (!data) data = require('minecraft-data')(version)
    if (!data) throw new Error(`no minecraft-data for ${version}`)
    const registryDir = path.dirname(require.resolve('prismarine-registry'))
    const base = require(path.join(registryDir, 'loader'))(data)
    registries.set(version, Object.assign(base, require(path.join(registryDir, 'pc'))(base, data)))
  }
  return registries.get(version)
}

// minecraft-protocol codes packets with the installed minecraft-data only; recordings of versions it lacks replay
// through the extracted events and skip the packet tests.
const packetSupport = new Map()
function packetsSupported (version) {
  if (!packetSupport.has(version)) packetSupport.set(version, !!require('minecraft-data')(version))
  return packetSupport.get(version)
}

const cache = new Map()

function recordedVersions () {
  if (!fs.existsSync(FIXTURES)) return []
  return fs.readdirSync(FIXTURES).filter(d => d.endsWith(SUFFIX)).map(d => d.slice(0, -SUFFIX.length))
}

function load (version) {
  if (!cache.has(version)) {
    const dir = path.join(FIXTURES, version + SUFFIX)
    cache.set(version, {
      dir,
      index: JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')),
      world: JSON.parse(fs.readFileSync(path.join(dir, 'world.json'), 'utf8')),
      worlds: new Map()
    })
  }
  return cache.get(version)
}

function scenario (version, name) {
  const file = path.join(load(version).dir, 'scenarios', name + '.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

// "oak_fence[east=true,north=false]" -> { name, properties }
function parseState (text) {
  const open = text.indexOf('[')
  if (open < 0) return { name: text, properties: {} }
  const properties = {}
  for (const pair of text.slice(open + 1, -1).split(',')) {
    const [key, value] = pair.split('=')
    properties[key] = value
  }
  return { name: text.slice(0, open), properties }
}

// A recorded block state as a prismarine stateId. 1.13+: "name[prop=value,...]". Before the flattening states are
// id and metadata (legacy stateId = id << 4 | metadata): 1.8.9–1.12.2 recordings append the stored state
// ("fence[east=true,...]@85:0", the bracket part being the rendered view), 1.7.10 ones give "ladder[metadata=2]".
function parseStateId (text, mcData, Block, version) {
  const at = text.lastIndexOf('@')
  if (at >= 0) {
    const [id, metadata] = text.slice(at + 1).split(':').map(Number)
    return id * 16 + (metadata || 0)
  }
  const { name, properties } = parseState(text)
  const block = mcData.blocksByName[name]
  if (!block) throw new Error(`minecraft-data ${version} has no block ${name}`)
  if (properties.metadata !== undefined) return block.id * 16 + Number(properties.metadata)
  if (mcData.isOlderThan('1.13')) {
    // A pre-flattening state without its stored metadata: the properties when prismarine-block can map them.
    try { return Block.fromProperties(name, properties, 0).stateId } catch { return block.id * 16 }
  }
  return Block.fromProperties(name, properties, 0).stateId
}

// The recorded world of one area as a prismarine world: getBlock(pos) -> prismarine-block with its position.
function world (version, areaName) {
  const loaded = load(version)
  if (!loaded.worlds.has(areaName)) {
    const area = loaded.world.areas.find(a => a.name === areaName)
    if (!area) throw new Error(`world.json of ${version} has no area ${areaName}`)
    const Block = require('prismarine-block')(registry(version))
    const mcData = registry(version)
    const states = new Map()
    const stateId = text => {
      if (!states.has(text)) states.set(text, parseStateId(text, mcData, Block, version))
      return states.get(text)
    }
    const cells = new Map()
    for (const [x0, y0, z0, x1, y1, z1, state] of area.fills) {
      const id = stateId(state)
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) cells.set(`${x},${y},${z}`, id)
        }
      }
    }
    const air = mcData.blocksByName.air.defaultState
    loaded.worlds.set(areaName, { cells, stateId, air, Block })
  }
  // Each replay gets its own overlay, so block changes the server sent (frost walker ice, trampled farmland) stay
  // inside that replay.
  const { cells, stateId, air, Block } = loaded.worlds.get(areaName)
  const changed = new Map()
  return {
    getBlock (pos) {
      const x = Math.floor(pos.x)
      const y = Math.floor(pos.y)
      const z = Math.floor(pos.z)
      const key = `${x},${y},${z}`
      const block = Block.fromStateId(changed.get(key) ?? cells.get(key) ?? air, 0)
      block.position = new Vec3(x, y, z)
      return block
    },
    setBlock ([x, y, z, state]) {
      changed.set(`${x},${y},${z}`, stateId(state))
    },
    setStateId ([x, y, z], id) {
      changed.set(`${x},${y},${z}`, id)
    }
  }
}

// ---- state ----

const TO_RAD = Math.PI / 180
const mod = (a, n) => ((a % n) + n) % n
// mineflayer's conversions (lib/conversions.js): what a bot would hand the engine for this vanilla view.
const yawOf = degrees => mod(Math.PI - TO_RAD * degrees, 2 * Math.PI)
const pitchOf = degrees => mod(TO_RAD * -degrees + Math.PI, 2 * Math.PI) - Math.PI

function levels (effects = []) {
  const out = {}
  for (const name of Object.values(EFFECTS)) out[name] = 0
  for (const entry of effects) {
    const [id, amplifier] = entry.split(':')
    if (EFFECTS[id]) out[EFFECTS[id]] = Number(amplifier) + 1
  }
  return out
}

function enchantment (setup, slot, id) {
  const item = setup.equipment && setup.equipment[slot]
  return (item && item.enchantments && item.enchantments[id]) || 0
}

// The server-side movement_speed attribute as mineflayer would hold it (base plus the server's modifiers: effects,
// powder snow frost, ...). Vanilla's own sprint modifier is left out: the engine adds its sprint modifier itself.
const SPRINTING = 'minecraft:sprinting'
function speedAttribute (row) {
  const withModifiers = row.attributeModifiers && row.attributeModifiers.movement_speed
  if (!withModifiers) return { value: row.attributes.movement_speed, modifiers: [] }
  return {
    value: withModifiers.base,
    modifiers: withModifiers.modifiers
      .filter(m => m.id !== SPRINTING)
      .map(m => ({ uuid: m.id, amount: m.amount, operation: m.operation }))
  }
}

// Every recorded attribute minecraft-data knows, keyed like mineflayer's bot.entity.attributes (the resource name),
// as { value, modifiers }; movement_speed without vanilla's sprint modifier.
const camel = name => name.replace(/[._]([a-z])/g, (m, c) => c.toUpperCase())
function attributesOf (row, mcData) {
  const out = { [mcData.attributesByName.movementSpeed.resource]: speedAttribute(row) }
  for (const [name, value] of Object.entries(row.attributes || {})) {
    const known = mcData.attributesByName[camel(name)] || mcData.attributesByName[camel(name.replace(/^player./, ''))]
    if (!known || known.name === 'movementSpeed') continue
    const withModifiers = row.attributeModifiers && row.attributeModifiers[name]
    out[known.resource] = withModifiers
      ? { value: withModifiers.base, modifiers: withModifiers.modifiers.map(m => ({ uuid: m.id, amount: m.amount, operation: m.operation })) }
      : { value, modifiers: [] }
  }
  return out
}

function makeState (rec, mcData) {
  const s = rec.start
  const setup = rec.setup || {}
  return {
    pos: new Vec3(...s.pos),
    vel: new Vec3(...s.vel),
    onGround: s.onGround,
    isInWater: s.isInWater,
    isInLava: s.isInLava,
    isInWeb: s.isInWeb,
    isCollidedHorizontally: s.isCollidedHorizontally,
    isCollidedVertically: s.isCollidedVertically,
    elytraFlying: s.elytraFlying,
    jumpTicks: s.jumpTicks,
    jumpQueued: s.jumpQueued,
    fireworkRocketDuration: 0,
    attributes: attributesOf(s, mcData),
    yaw: yawOf(s.yaw),
    pitch: pitchOf(s.pitch),
    // The vanilla rotation as well: a bot that turns itself knows it, and the radians lose whole turns
    yawDegrees: s.yaw,
    pitchDegrees: s.pitch,
    control: { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false },
    ...levels(s.effects),
    depthStrider: enchantment(setup, 'feet', 'depth_strider'),
    soulSpeed: enchantment(setup, 'feet', 'soul_speed'),
    swiftSneak: enchantment(setup, 'legs', 'swift_sneak'),
    elytraEquipped: !!(setup.equipment && setup.equipment.chest && setup.equipment.chest.id === 'elytra')
  }
}

// The tick's input: keys and view, plus what the server synced by then (attributes, effects).
function applyInput (state, row, mcData) {
  state.attributes = attributesOf(row, mcData)
  Object.assign(state, levels(row.effects))
  for (const key of Object.keys(state.control)) state.control[key] = false
  for (const [key, down] of Object.entries(row.in)) if (KEYS[key] && down) state.control[KEYS[key]] = true
  state.yaw = yawOf(row.in.yaw)
  state.yawDegrees = row.in.yaw
  state.pitchDegrees = row.in.pitch
  state.pitch = pitchOf(row.in.pitch)
}

// What the server sent before a tick; it belongs to that tick only and is never filled forward.
const EVENTS = ['velocityPackets', 'blockChanges', 'vehicleServer', 'explosionKnockback', 'corrected', 'serverPackets', 'clientPackets']

// Rows carry sparse fields only when they change; this fills them forward so every row is complete. Events stay on
// their own row under `events`.
function expand (rec) {
  let last = rec.start
  return rec.ticks.map(row => {
    const state = {}
    const events = {}
    for (const [key, value] of Object.entries(row)) (EVENTS.includes(key) ? events : state)[key] = value
    last = { ...last, ...state }
    return { ...last, events }
  })
}

// Applies a tick's events before its physics. Recordings with packets are replayed through the packet handlers
// (java-packets.js); older ones through the extracted events: block changes, velocity, explosion knockback.
function applyEvents (state, w, events, ctx) {
  if (events.serverPackets && ctx && packetsSupported(ctx.version)) {
    for (const entry of events.serverPackets) {
      for (const part of entry.packets || [entry]) packets.handle(state, packets.decode(ctx.version, 'toClient', part.bytes), { ...ctx, world: w })
      // Attribute packets: minecraft-protocol's attribute ids do not match every version's registry (1.21.11 decodes
      // movement_speed as generic.scale), so the attributes are taken from what vanilla's handling left.
      if (entry.after && (entry.after.attributes || entry.after.attributeModifiers)) state.attributes = attributesOf({ ...entry.before, ...entry.after }, ctx.mcData)
    }
    return
  }
  for (const change of events.blockChanges || []) w.setBlock(change)
  for (const [target, x, y, z] of events.velocityPackets || []) {
    if (target === 0) state.vel = new Vec3(x, y, z)
  }
  for (const [x, y, z] of events.explosionKnockback || []) state.vel = state.vel.offset(x, y, z)
}

// ---- comparison ----

function value (state, field) {
  const v = state[field]
  return v instanceof Vec3 ? [v.x, v.y, v.z] : v
}

function differences (actual, expected, fields, epsilon) {
  const out = []
  for (const field of fields) {
    const a = value(actual, field)
    const e = expected[field]
    if (Array.isArray(e)) {
      e.forEach((ev, i) => {
        const av = a[i]
        if (!(Math.abs(av - ev) <= epsilon)) out.push({ field: `${field}.${'xyz'[i]}`, expected: ev, actual: av })
      })
    } else if (e !== undefined && a !== e) {
      out.push({ field, expected: e, actual: a })
    }
  }
  return out
}

/**
 * Runs a recording through the engine.
 *   mode 'trajectory' (default): one continuous simulation, as a bot would run it.
 *   mode 'stepwise': every tick starts from the recorded state, so each tick's error is counted on its own.
 * Returns { ticks, divergences: [{ t, input, diffs }] }.
 */
function replay (version, rec, { mode = 'trajectory', fields = FIELDS, epsilon = 0 } = {}) {
  const mcData = registry(version)
  const w = world(version, rec.area)
  const physics = Physics(mcData, w)
  const rows = expand(rec)
  const divergences = []
  const state = makeState(rec, mcData)
  rows.forEach((row, i) => {
    if (mode === 'stepwise' && i > 0) {
      const before = rows[i - 1]
      state.pos = new Vec3(...before.pos)
      state.vel = new Vec3(...before.vel)
      for (const field of FIELDS.slice(2)) state[field] = before[field]
      state.jumpTicks = before.jumpTicks
    }
    // Inputs synced before this tick are those of the previous row (the state the tick started from).
    applyInput(state, { ...(i > 0 ? rows[i - 1] : rec.start), in: row.in }, mcData)
    applyEvents(state, w, row.events, packetContext(version, mcData, rec))
    physics.simulatePlayer(state, w)
    const diffs = differences(state, row, fields, epsilon)
    if (diffs.length) divergences.push({ t: row.t, input: row.in, diffs })
  })
  return { ticks: rows.length, divergences }
}

// ---- packets ----

const EFFECT_FIELDS = { speed: 'speed', slowness: 'slowness', jump_boost: 'jumpBoost', levitation: 'levitation', slow_falling: 'slowFalling', dolphins_grace: 'dolphinsGrace' }

function packetContext (version, mcData, rec) {
  const net = rec.start.netState || {}
  const effectNames = {}
  // Effect ids in play packets are the registry ids, which minecraft-data uses too; its names are CamelCase.
  for (const e of mcData.effectsArray || []) {
    const field = EFFECT_FIELDS[String(e.name).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()]
    if (field) effectNames[e.id] = field
  }
  return { version, mcData, entityId: net.entityId, effectNames }
}

// The player state a packet handler sees, rebuilt from a recorded snapshot.
function stateFrom (snapshot, mcData, rec) {
  const state = makeState({ ...rec, start: snapshot }, mcData)
  state.yawDegrees = snapshot.yaw
  state.pitchDegrees = snapshot.pitch
  return state
}

const PACKET_FIELDS = ['pos', 'vel', 'elytraFlying']

/**
 * Each server packet on its own: start from vanilla's state just before it, handle it, compare with vanilla's state
 * just after (fields it did not change must stay as they were: a packet about a mob must not move the player).
 * Returns [{ t, type, diffs }].
 */
function checkServerPackets (version, rec) {
  const mcData = registry(version)
  const ctx = packetContext(version, mcData, rec)
  const out = []
  expand(rec).forEach(row => {
    for (const entry of row.events.serverPackets || []) {
      const state = stateFrom(entry.before, mcData, rec)
      const w = world(version, rec.area)
      const replies = []
      for (const part of entry.packets || [entry]) replies.push(...packets.handle(state, packets.decode(version, 'toClient', part.bytes), { ...ctx, world: w }))
      const diffs = differences(state, { ...entry.before, ...entry.after }, PACKET_FIELDS, 0)
      // The client's replies, byte for byte (vanilla's only when the harness knows the reply: teleports, rotations).
      const sent = (entry.responses || []).map(r => r.bytes).join(' ')
      const built = replies.map(r => packets.encode(version, 'toServer', r.name, r.params)).join(' ')
      if (replies.length && sent !== built) diffs.push({ field: 'responses', expected: sent, actual: built })
      if (diffs.length) out.push({ t: row.t, type: entry.type, diffs })
    }
  })
  return out
}

/**
 * Each tick's movement packets rebuilt from vanilla's state after the tick and its network state before it, encoded,
 * and compared byte for byte with what vanilla sent. Ticks spent riding are skipped (vehicle packets are not built).
 * Returns [{ t, expected: [hex], actual: [hex] }].
 */
function checkClientPackets (version, rec) {
  const out = []
  let before = rec.start
  for (const row of expand(rec)) {
    const sent = row.events.clientPackets
    if (sent && before.netState && !row.vehicle && !before.vehicle) {
      const expected = sent.filter(p => {
        const d = packets.decode(version, 'toServer', p.bytes)
        return packets.MOVEMENT.has(d.name) && (d.name !== 'entity_action' || /sprinting/.test(d.params.actionId))
      }).map(p => p.bytes)
      // The keys as vanilla's Input held them after the tick (auto-jump presses jump inside the input).
      const held = row.netState && row.netState.lastSentInput
      const input = held ? { ...row.in, forward: held[0], back: held[1], left: held[2], right: held[3], jump: held[4], sneak: held[5], sprint: held[6] } : row.in
      const built = packets.movementPackets(row, input, before.netState).packets
      const actual = built.map(p => packets.encode(version, 'toServer', p.name, p.params))
      if (expected.join() !== actual.join()) out.push({ t: row.t, expected, actual })
    }
    before = row
  }
  return out
}

function describeInput (input) {
  const keys = Object.entries(input).filter(([k, v]) => v === true).map(([k]) => k)
  return `${keys.length ? keys.join('+') : 'no keys'}, yaw ${input.yaw}, pitch ${input.pitch}`
}

function report (name, version, result) {
  const first = result.divergences[0]
  const lines = [`${name} on ${version}: ${result.divergences.length} of ${result.ticks} ticks differ; first at tick ${first.t} (${describeInput(first.input)})`]
  for (const d of first.diffs) {
    const delta = typeof d.expected === 'number' ? `  (Δ ${(d.actual - d.expected).toExponential(3)})` : ''
    lines.push(`  ${d.field.padEnd(26)} vanilla ${String(d.expected).padEnd(24)} engine ${d.actual}${delta}`)
  }
  return lines.join('\n')
}

// ---- the generated tests' entry point ----

/**
 * recorded(name, { description, steps, groups: [{ versions, milestones, knownFailure }] })
 *   steps       the case's inputs, as written in the catalog; checked against every recording
 *   groups      versions whose recordings are identical, with milestones extracted from that recording:
 *               { 'lands': { tick: 23, onGround: true, pos: [...] }, ... } — each checked against the engine
 *   knownFailure  reason the engine does not match yet; the test then passes while it fails, and fails once it
 *                 matches, so the entry gets removed
 */
function recorded (name, spec) {
  describe(`${name}: ${spec.description}`, function () {
    for (const group of spec.groups) {
      const label = group.versions.length > 1 ? `${group.versions[0]} – ${group.versions[group.versions.length - 1]}` : group.versions[0]
      describe(label, function () {
        const available = group.versions.filter(v => recordedVersions().includes(v))
        let runs
        before(function () {
          if (!available.length) this.skip()
          runs = available.map(version => {
            const rec = scenario(version, name)
            if (!rec) throw new Error(`${version} has no recording of ${name}`)
            assert.deepStrictEqual(rec.steps, spec.steps, `${name}: the test's steps no longer match the ${version} recording; regenerate`)
            return { version, rec, result: replay(version, rec, spec.options), rows: expand(rec) }
          })
        })

        for (const [title, milestone] of Object.entries(group.milestones || {})) {
          it(title, function () {
            for (const { version, rec, rows } of runs) {
              const row = rows[milestone.tick - 1]
              const fields = Object.keys(milestone).filter(k => k !== 'tick')
              // The recording itself must still show the milestone (guards against stale generated files) ...
              assert.deepStrictEqual(differences(row, milestone, fields, 0), [], `${version} recording no longer shows "${title}"`)
              // ... and the engine must reach it.
              const at = replayUntil(version, rec, milestone.tick, spec.options)
              const diffs = differences(at, milestone, fields, (spec.options && spec.options.epsilon) || 0)
              expectation(group, diffs.length === 0, () => `${name} "${title}" on ${version} at tick ${milestone.tick}:\n` +
                diffs.map(d => `  ${d.field} vanilla ${d.expected} engine ${d.actual}`).join('\n'))
            }
          })
        }

        it(`matches every tick (${spec.fields ? spec.fields.join(', ') : FIELDS.join(', ')})`, function () {
          for (const { version, result } of runs) {
            expectation(group, result.divergences.length === 0, () => report(name, version, result))
          }
        })

        it('handles server packets like vanilla', function () {
          for (const { version, rec } of runs) {
            if (!rec.start.netState || !packetsSupported(version)) this.skip()
            const bad = checkServerPackets(version, rec)
            expectation(group.packetKnownFailure ? { knownFailure: group.packetKnownFailure } : {}, bad.length === 0, () => `${name} on ${version}: ${bad.length} packets handled differently; first at tick ${bad[0].t} (${bad[0].type}):\n` +
              bad[0].diffs.map(d => `  ${d.field} vanilla ${d.expected} harness ${d.actual}`).join('\n'))
          }
        })

        it('sends byte-exact movement packets', function () {
          for (const { version, rec } of runs) {
            if (!rec.start.netState || !packetsSupported(version)) this.skip()
            const bad = checkClientPackets(version, rec)
            expectation(group.packetKnownFailure ? { knownFailure: group.packetKnownFailure } : {}, bad.length === 0, () => `${name} on ${version}: ${bad.length} ticks differ; first at tick ${bad[0].t}:\n  vanilla ${bad[0].expected.join(' ')}\n  built   ${bad[0].actual.join(' ')}`)
          }
        })
      })
    }
  })
}

function replayUntil (version, rec, tick, options) {
  const mcData = registry(version)
  const w = world(version, rec.area)
  const physics = Physics(mcData, w)
  const state = makeState(rec, mcData)
  const rows = expand(rec)
  for (let i = 0; i < tick; i++) {
    applyInput(state, { ...(i > 0 ? rows[i - 1] : rec.start), in: rows[i].in }, mcData)
    applyEvents(state, w, rows[i].events, packetContext(version, mcData, rec))
    physics.simulatePlayer(state, w)
  }
  return state
}

function expectation (group, passed, message) {
  if (group.knownFailure && passed) {
    assert.fail(`known failure no longer fails (${group.knownFailure}); remove it from the generator's known-failures.json`)
  } else if (!group.knownFailure && !passed) {
    assert.fail(message())
  }
}

module.exports = {
  recorded,
  replay,
  checkServerPackets,
  checkClientPackets,
  report,
  recordedVersions,
  scenario,
  world,
  FIELDS,
  ticks,
  press,
  hold,
  release,
  look,
  turn,
  stable,
  stopped,
  until,
  settleFor,
  untilOr,
  server
}
