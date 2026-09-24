#!/usr/bin/env node
// Imports Bedrock client recordings as JSON fixtures under test/fixtures/bedrock/<version>/ for
// test/bedrock-fixtures.test.js. Two sources:
//
//   node scripts/convert-bedrock-fixtures.js <path/to/prismarine-bedrock/test/static/physics> [version=1.26.10]
//     prismarine-bedrock's static fixtures: one .test.js per scenario embedding a TICKS array of
//     player_auth_input (PAI) diffs, plus the shared world.json.
//
//   node scripts/convert-bedrock-fixtures.js --bin <recording.proxy.bin> [--world <world.json>] [--version <v>] [--arrival <census.jsonl>]
//     a recorder packet dump (version string, then 'S'/'C'/'L' frames). Scenarios are delimited by the
//     test-case-start / test-case-end log records; every serverbound player_auth_input inside a window becomes a tick.
//     The world defaults to the 1.26.10 world.json (the scenario worlds are identical).
//
// Both write scenarios/<name>.json (PAI diffs: the first entry diffs from the runner's DEFAULT_PAI, each later entry
// from the previous tick), world.json and index.json.

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const args = process.argv.slice(2)
const outRoot = path.join(__dirname, '..', 'test', 'fixtures', 'bedrock')

// Scenario-level state the recording harness applied out of band (effects by name -> level, enchants).
const SCENARIO_EXTRAS = {
  effect_levitation1: { effects: { levitation: 1 } },
  effect_slow_falling_h20: { effects: { slowFalling: 1 } },
  water_depth_strider_3: { depthStrider: 3 }
}

function scenarioName (raw) { return raw.replace(/^1\.21\.0_/, '').replace(/^pb_/, '') }

// Scenario state a generated recording declares in its test-case-start record (engine-generated fixtures: effects,
// attribute, elytra, flight) -> the fixture fields test/tools/bedrock-fixtures.js seeds the state from.
const EFFECT_NAMES = { jump_boost: 'jumpBoost', slow_falling: 'slowFalling' }
function fixtureExtras (extras) {
  if (!extras) return {}
  const out = {}
  if (extras.generator) out.generator = extras.generator
  if (extras.effects) out.effects = Object.fromEntries(Object.entries(extras.effects).map(([k, v]) => [EFFECT_NAMES[k] || k, v]))
  if (typeof extras.movementSpeed === 'number') out.movementSpeed = extras.movementSpeed
  if (typeof extras.flySpeed === 'number') out.flySpeed = extras.flySpeed
  if (extras.elytra) out.elytraEquipped = true
  if (extras.flying) out.flying = true
  return out
}

// The session's round trip in ticks: how long after the tick a server packet is stamped for it reaches the client.
// Measured from the movement corrections, whose arrival the recording does see (the client reports the corrected
// state on the tick it applied them), and taken as the median over the recording: every tick-stamped packet takes
// the same path, and the per-packet jitter is a tick either way.
function roundTripOf (scenarios) {
  const lags = []
  for (const { ticks } of scenarios) for (const tick of ticks) if (tick.correction) lags.push(tick.t - tick.correction.tick)
  if (!lags.length) return undefined
  lags.sort((a, b) => a - b)
  return lags[lags.length >> 1]
}

function writeFixtures (version, scenarios, worldSource) {
  const roundTrip = roundTripOf(scenarios)
  const outDir = path.join(outRoot, version)
  const scenarioDir = path.join(outDir, 'scenarios')
  fs.mkdirSync(scenarioDir, { recursive: true })
  const index = []
  for (const { name, source, ticks, extras, modes } of scenarios) {
    const fixture = { name, version, source, frames: ticks.length, ...(roundTrip === undefined ? {} : { roundTrip }), ...(modes || {}), ...(SCENARIO_EXTRAS[name] || {}), ...fixtureExtras(extras), ticks }
    const head = Object.entries(fixture).filter(([k]) => k !== 'ticks')
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
    const body = ticks.map(t => '    ' + JSON.stringify(t)).join(',\n')
    fs.writeFileSync(path.join(scenarioDir, `${name}.json`), `{\n${head},\n  "ticks": [\n${body}\n  ]\n}\n`)
    index.push({ name, frames: ticks.length })
  }
  fs.copyFileSync(worldSource, path.join(outDir, 'world.json'))
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ version, scenarios: index }, null, 2) + '\n')
  console.log(`wrote ${index.length} scenarios to ${outDir}`)
}

// ---- prismarine-bedrock static fixtures ---------------------------------------------------------------------------

function convertStatic (srcRoot, version) {
  const srcDir = path.join(srcRoot, version)
  const scenarios = []
  for (const file of fs.readdirSync(srcDir).sort()) {
    if (!file.endsWith('.test.js')) continue
    const src = fs.readFileSync(path.join(srcDir, file), 'utf8').replace(/\r\n/g, '\n')
    const match = /const TICKS = (\[[\s\S]*?\n\])\n/.exec(src)
    if (!match) {
      console.warn(`skip ${file}: no TICKS literal`)
      continue
    }
    const header = /^\/\/ Scenario: (.+)$/m.exec(src)
    const name = scenarioName(header ? header[1].trim() : file.replace(/\.test\.js$/, ''))
    if (name === 'synthetic_walk_attribute_seed') continue // hand-written, not a client recording
    scenarios.push({ name, source: file, ticks: vm.runInNewContext('(' + match[1] + ')') })
  }
  writeFixtures(version, scenarios, path.join(srcRoot, 'world.json'))
}

// ---- recorder packet dumps ----------------------------------------------------------------------------------------

const PAI_PACKET_ID = 0x90
const CORRECT_MOVE_PREDICTION_ID = 0xa1
const UPDATE_ABILITIES_ID = 187
const MOVE_PLAYER_ID = 0x13
const UPDATE_ATTRIBUTES_ID = 0x1d
const SET_ACTOR_DATA_ID = 0x27
// InputData bit numbers -> fixture input flag names (the library's table, camelCased).
require('../lib/ts-hooks')
const { INPUT_FLAG_NAMES: INPUT_BITS } = require('../lib/bedrock/network/input-packet.ts')

function versionAtLeast (version, [major, minor, patch]) {
  const [a = 0, b = 0, c = 0] = version.split('.').map(n => parseInt(n, 10) || 0)
  return a !== major ? a > major : (b !== minor ? b > minor : c >= patch)
}

class Cursor {
  constructor (buf) { this.buf = buf; this.pos = 0 }
  u8 () { return this.buf[this.pos++] }
  f32 () { const v = this.buf.readFloatLE(this.pos); this.pos += 4; return v }
  i32 () { const v = this.buf.readInt32LE(this.pos); this.pos += 4; return v }
  varint () { let v = 0; for (let s = 0; s < 35; s += 7) { const b = this.u8(); v |= (b & 0x7f) << s; if (!(b & 0x80)) return v >>> 0 } throw new Error('bad varint') }
  varint64 () { let v = 0n; for (let s = 0n; s < 70n; s += 7n) { const b = this.u8(); v |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) return v } throw new Error('bad varint64') }
  string () { const n = this.varint(); const s = this.buf.subarray(this.pos, this.pos + n).toString('utf8'); this.pos += n; return s }
  bytes (n) { const b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b }
}

// Decodes the leading, unconditional part of player_auth_input (up to `delta`). Through 1.26.20 input_data is a
// varint64 bitset; from 1.26.51 it is a varint count of zigzag32 values, each the bit number of the same input.
function decodePAI (bytes, enumeratedInputs) {
  const c = new Cursor(bytes)
  if (c.varint() !== PAI_PACKET_ID) return null
  const pitch = c.f32()
  const yaw = c.f32()
  const position = { x: c.f32(), y: c.f32(), z: c.f32() }
  const moveVector = { x: c.f32(), z: c.f32() }
  const headYaw = c.f32()
  let flags = 0n
  if (enumeratedInputs) {
    const n = c.varint()
    for (let i = 0; i < n; i++) {
      const z = c.varint()
      const bit = (z >>> 1) ^ -(z & 1)
      if (bit >= 0 && bit < INPUT_BITS.length) flags |= 1n << BigInt(bit)
    }
  } else {
    flags = c.varint64()
  }
  const inputMode = c.varint()
  const playMode = c.varint()
  const interactionModel = c.varint() // zigzag; 0 on every recording in hand
  const interactRotation = { x: c.f32(), z: c.f32() }
  const tick = Number(c.varint64())
  const delta = { x: c.f32(), y: c.f32(), z: c.f32() }
  const inputs = {}
  for (let bit = 0; bit < INPUT_BITS.length; bit++) {
    if ((flags >> BigInt(bit)) & 1n) inputs[INPUT_BITS[bit]] = true
  }
  const pai = { t: tick, position, yaw, pitch, headYaw, moveVector, delta, inputs, inputMode, playMode, interactionModel, interactRotation }
  // The trailing vectors follow the item-use / item-stack / block-action / vehicle payloads. Through 1.26.20 the
  // payloads are gated by input bits 34, 35, 36 and 45; from 1.26.51 each carries its own presence byte (five of
  // them: transaction, item stack request, block actions, vehicle rotation, predicted vehicle). A tick with a payload
  // (none in the physics recordings) leaves the vectors out rather than decoding it.
  let payload = false
  if (enumeratedInputs) {
    for (let i = 0; i < 5 && !payload; i++) if (c.u8()) payload = true
  } else {
    payload = [34n, 35n, 36n, 45n].some(bit => (flags >> bit) & 1n)
  }
  if (!payload && c.pos + 28 <= bytes.length) {
    pai.analogueMoveVector = { x: c.f32(), z: c.f32() }
    pai.cameraOrientation = { x: c.f32(), y: c.f32(), z: c.f32() }
    pai.rawMoveVector = { x: c.f32(), z: c.f32() }
  }
  return pai
}

// The flying and may-fly abilities of an UpdateAbilities packet's base layer (SerializedAbilitiesData: i64 unique
// id, u8, u8, layers[ u16 type, u32 set, u32 values, f32 fly/vertical/walk speed ]); null when the base layer is
// absent. Flying is bit 9, may fly bit 10.
function decodeAbilities (bytes) {
  const c = new Cursor(bytes)
  if (c.varint() !== UPDATE_ABILITIES_ID) return null
  c.pos += 8 + 1 + 1
  const layers = c.varint()
  for (let i = 0; i < layers; i++) {
    const type = c.buf.readUInt16LE(c.pos); c.pos += 2
    const set = c.buf.readUInt32LE(c.pos); c.pos += 4
    const values = c.buf.readUInt32LE(c.pos); c.pos += 4
    c.pos += 12
    if (type === 1) {
      const out = {}
      if (set & (1 << 9)) out.flying = !!(values & (1 << 9))
      if (set & (1 << 10)) out.mayFly = !!(values & (1 << 10))
      return out
    }
  }
  return null
}

// A MovePlayer packet (varint64 runtime id, position, pitch/yaw/head yaw, u8 mode, bool on_ground, ...): the client
// installs its position (eye height included), rotation and ground state, and a mode-2 teleport raises the
// HandledTeleport action reported on the next PlayerAuthInput (HandleMovePlayer).
function decodeMovePlayer (bytes) {
  const c = new Cursor(bytes)
  if (c.varint() !== MOVE_PLAYER_ID) return null
  const runtimeId = c.varint64()
  const x = c.f32(); const y = c.f32(); const z = c.f32()
  const pitch = c.f32(); const yaw = c.f32(); const headYaw = c.f32()
  const mode = c.u8()
  const onGround = !!c.u8()
  return { runtimeId, teleport: { x, y, z, pitch, yaw, headYaw, mode, onGround } }
}

// SetActorData (varint64 runtime id, metadata [key, type, (1.26.51: a flags byte), value], entity properties,
// varint64 tick): the actor flags the server restates (keys 0 and 92, zigzag64 bit sets) and the bounding box height
// it sets with a pose (key 54), which the client applies through its rewind history like a movement correction.
// Returns null when the packet carries none of them.
const ACTOR_FLAG_BITS = { sneaking: 1, sprinting: 3, gliding: 32, swimming: 57 }
const ACTOR_FLAG_BITS_EXTENDED = { crawling: 114 - 64 }
function decodeActorFlags (bytes, extraItemByte) {
  const c = new Cursor(bytes)
  if (c.varint() !== SET_ACTOR_DATA_ID) return null
  const runtimeId = c.varint64()
  const count = c.varint()
  const flags = {}
  let found = false
  let compound = false
  for (let i = 0; i < count && !compound; i++) {
    const key = c.varint()
    const type = c.varint()
    if (extraItemByte) c.u8()
    switch (type) {
      case 0: c.u8(); break
      case 1: c.pos += 2; break
      case 2: c.varint(); break
      case 3: {
        const value = c.f32()
        if (key === 54) { flags.height = value; found = true } // the bounding box height the server sets with a pose
        break
      }
      case 4: c.string(); break
      case 5: compound = true; break // NBT: not walked; the tick is read off the packet's tail instead
      case 6: c.varint(); c.varint(); c.varint(); break
      case 7: {
        const value = c.varint64()
        const word = (value >> 1n) ^ -(value & 1n)
        if (key === 0) {
          for (const [name, bit] of Object.entries(ACTOR_FLAG_BITS)) flags[name] = !!((word >> BigInt(bit)) & 1n)
          found = true
        } else if (key === 92) {
          for (const [name, bit] of Object.entries(ACTOR_FLAG_BITS_EXTENDED)) flags[name] = !!((word >> BigInt(bit)) & 1n)
          found = true
        }
        break
      }
      case 8: c.pos += 12; break
      default: return null
    }
  }
  if (!found) return null
  let tick
  if (!compound) {
    for (let list = 0; list < 2; list++) { // entity properties: ints [index, zigzag32], floats [index, f32]
      const n = c.varint()
      for (let i = 0; i < n; i++) { c.varint(); if (list === 0) c.varint(); else c.f32() }
    }
    tick = Number(c.varint64())
  } else {
    // the tick is the trailing varint64; it follows two empty property lists (two zero bytes)
    let start = bytes.length - 1
    while (start > 0 && (bytes[start - 1] & 0x80)) start--
    if (start >= 2 && bytes[start - 1] === 0 && bytes[start - 2] === 0) tick = Number(new Cursor(bytes.subarray(start)).varint64())
  }
  if (tick === undefined) return null
  return { runtimeId, tick, flags }
}

// CorrectPlayerMovePrediction: u8 prediction type, position (the client's offset position: eye height included),
// delta, rotation, optional vehicle angular velocity, bool on_ground, varint64 tick. The client rewinds its history
// to the tick after this one, installs the position/delta/ground state there and re-simulates up to the present.
function decodeCorrection (bytes) {
  const c = new Cursor(bytes)
  if (c.varint() !== CORRECT_MOVE_PREDICTION_ID) return null
  const type = c.u8()
  const pos = { x: c.f32(), y: c.f32(), z: c.f32() }
  const delta = { x: c.f32(), y: c.f32(), z: c.f32() }
  c.f32(); c.f32() // rotation
  if (c.u8()) c.f32() // vehicle angular velocity
  const onGround = !!c.u8()
  const tick = Number(c.varint64())
  if (type !== 0) return null // a vehicle correction
  return { tick, x: pos.x, y: pos.y, z: pos.z, dx: delta.x, dy: delta.y, dz: delta.z, onGround }
}

// UpdateAttributes: varint64 runtime id, attributes [min, max, current, default min, default max, default (f32),
// name, modifiers [id, name, amount f32, operation i32, operand i32, serializable bool]], varint64 tick. The walking
// A packet replaces the whole attribute instance: `walk` is its value without the sprint boost (the default plus
// the additive, operation 0, modifiers -- the server's freeze penalty in powder snow) and `current` the value the
// server computed, which carries its own sprint boost (operation 2, MultiplyTotal 0.3) when the server believed the
// player was sprinting. The client's own sprint action adds and removes that same modifier locally.
function decodeMovementAttribute (bytes) {
  const c = new Cursor(bytes)
  if (c.varint() !== UPDATE_ATTRIBUTES_ID) return null
  const runtimeId = c.varint64()
  const count = c.varint()
  let walk = null
  let current = null
  for (let i = 0; i < count; i++) {
    c.f32(); c.f32()
    const value = c.f32()
    c.f32(); c.f32()
    const def = c.f32()
    const name = c.string()
    const modifiers = c.varint()
    let additive = 0
    for (let m = 0; m < modifiers; m++) {
      c.string(); c.string()
      const amount = c.f32()
      const operation = c.i32()
      c.i32(); c.u8()
      if (operation === 0) additive = Math.fround(additive + amount)
    }
    if (name === 'minecraft:movement') { walk = Math.fround(def + additive); current = value }
  }
  if (walk === null) return null
  return { runtimeId, tick: Number(c.varint64()), walk, current }
}

// Reads the recorder dump into frames: { type: 'S' | 'C' | 'L', bytes | message }.
function * readDump (buf) {
  const c = new Cursor(buf)
  if (buf.subarray(0, 5).equals(Buffer.from([0x42, 0x44, 0x54, 0x35, 0]))) c.pos = 5 + 4 + 8 // BDT5 header
  const version = c.string()
  yield { type: 'V', version }
  while (c.pos < buf.length) {
    const type = String.fromCharCode(c.u8())
    c.pos += 8 // time
    if (type === 'L') {
      if (c.pos >= buf.length) return
      yield { type, message: c.string() }
    } else if (type === 'S' || type === 'C') {
      if (c.pos + 4 > buf.length) return
      const n = c.i32()
      if (c.pos + n > buf.length) return // trailing partial record
      yield { type, bytes: c.bytes(n) }
    } else {
      return
    }
  }
}

// A merged PAI record -> diff against the previous merged record (nested objects one level deep).
function diffPAI (prev, cur) {
  const diff = { t: cur.t }
  for (const key of ['position', 'yaw', 'pitch', 'headYaw', 'moveVector', 'delta', 'inputs', 'interactRotation', 'analogueMoveVector', 'cameraOrientation', 'rawMoveVector']) {
    const a = prev ? prev[key] : undefined
    const b = cur[key]
    if (typeof b !== 'object') {
      if (a !== b) diff[key] = b
      continue
    }
    const sub = {}
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b)])) {
      const av = a ? a[k] : undefined
      const bv = b[k]
      if (av !== bv) sub[k] = bv === undefined ? false : bv
    }
    if (Object.keys(sub).length) diff[key] = sub
  }
  return diff
}

// The tick the client handled each server packet on, from an arrival census of the same session (`--arrival`, one
// JSON row per server correction the client filed into its rewind history: the packet's stamp and the client's
// current tick). A one-time import: the fixture keeps the number as `handled` on
// the packet, and nothing reads the census afterwards. Rows are consumed in order per kind and stamp, so two packets
// with one stamp take the two rows in the order the client handled them. A packet the client did not route through
// the ring (most movement attributes) has no row and keeps no `handled`.
// The census rows of the movement corrections, by the tick they are stamped for: when each was handled and whether
// the client rewound to it.
function correctionRows (file) {
  const rows = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    if (row.kind === 'CorrectPlayerMovePrediction') rows.set(row.stamp, { handled: row.handled, result: row.result })
  }
  return rows
}

function stampArrival (scenarios, file) {
  const queues = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    const key = `${row.kind}@${row.stamp}`
    if (!queues.has(key)) queues.set(key, [])
    queues.get(key).push(row.handled)
  }
  const take = (kind, stamp) => {
    const queue = queues.get(`${kind}@${stamp}`)
    return queue && queue.length ? queue.shift() : undefined
  }
  const FLAG_NAMES = ['sneaking', 'sprinting', 'swimming', 'gliding', 'crawling']
  let stamped = 0
  let missing = 0
  for (const { ticks } of scenarios) {
    for (const tick of ticks) {
      for (const flags of tick.actorFlags || []) {
        const kind = FLAG_NAMES.some(name => name in flags) ? 'ActorDataFlagCorrection' : 'FloatCorrection'
        const handled = take(kind, flags.tick)
        if (handled === undefined) missing++
        else { flags.handled = handled; stamped++ }
      }
      for (const attribute of tick.attributes || []) {
        const handled = take('AttributeReplay', attribute.tick)
        if (handled === undefined) missing++
        else { attribute.handled = handled; stamped++ }
      }
    }
  }
  console.log(`arrival: ${stamped} packets stamped with the tick the client handled them on, ${missing} without a row`)
}

function convertBin (file, opts) {
  const buf = fs.readFileSync(file)
  let version = opts.version
  const scenarios = []
  let current = null
  let lastTick = -1
  let correctionPending = false
  let correction = null // the last CorrectPlayerMovePrediction, attached to the PAI the client sent after it
  let attributes = [] // movement attribute updates received since the last PAI
  let localRuntimeId = null // the local player's runtime id, learnt from the teleports it is sent
  let abilities = null // the abilities (flying, may fly) the server sent since the last tick
  let enumeratedInputs = false
  let teleport = null // the last MovePlayer packet, consumed by the handledTeleport tick
  let actorFlags = [] // actor flag updates (SetActorData) received since the last PAI
  // With the arrival census, a movement correction is attached where the client reports its rewound state: the PAI
  // after the tick it was handled on, when it rewound at all (result 1, CorrectedWithRewind). Without it, a jump of
  // more than 0.25 from the predicted position stands in for that, which the player's own jump can also produce.
  const rewound = opts.arrival ? correctionRows(opts.arrival) : null
  for (const frame of readDump(buf)) {
    if (frame.type === 'V') {
      if (!version) version = frame.version.split('.').slice(0, 3).join('.')
      enumeratedInputs = versionAtLeast(version, [1, 26, 51])
      continue
    }
    if (frame.type === 'L') {
      let log
      try { log = JSON.parse(frame.message) } catch { continue }
      const data = log.data || {}
      if (data.type === 'test-case-start') {
        const extras = data.extras ? { ...data.extras, generator: data.generator } : null
        current = { name: scenarioName(data.name), source: path.basename(file), ticks: [], prev: null, extras, modes: null }
        lastTick = -1
      } else if (data.type === 'test-case-end' && current) {
        if (current.ticks.length) scenarios.push({ name: current.name, source: current.source, ticks: current.ticks, extras: current.extras, modes: current.modes })
        current = null
      }
      continue
    }
    if (!current) continue
    if (frame.type === 'C') {
      // The server rejected the client's prediction; the client snaps to the corrected state a few ticks later.
      if (frame.bytes[0] === CORRECT_MOVE_PREDICTION_ID) {
        correctionPending = true
        correction = decodeCorrection(frame.bytes)
      }
      if (frame.bytes[0] === MOVE_PLAYER_ID) {
        const move = decodeMovePlayer(frame.bytes)
        if (move) { teleport = move.teleport; localRuntimeId = move.runtimeId }
      }
      if (frame.bytes[0] === SET_ACTOR_DATA_ID) {
        const data = decodeActorFlags(frame.bytes, enumeratedInputs)
        if (data && localRuntimeId !== null && data.runtimeId === localRuntimeId) actorFlags.push({ tick: data.tick, ...data.flags })
      }
      if (frame.bytes[0] === UPDATE_ATTRIBUTES_ID) {
        const attribute = decodeMovementAttribute(frame.bytes)
        if (attribute && (localRuntimeId === null || attribute.runtimeId === localRuntimeId)) attributes.push({ tick: attribute.tick, walk: attribute.walk, current: attribute.current })
      }
      if (frame.bytes[0] === UPDATE_ABILITIES_ID) {
        const decoded = decodeAbilities(frame.bytes)
        if (decoded) abilities = { ...(abilities || {}), ...decoded }
      }
      continue
    }
    if (frame.type !== 'S' || frame.bytes[0] !== PAI_PACKET_ID) continue
    const pai = decodePAI(frame.bytes, enumeratedInputs)
    if (!pai || pai.t === lastTick) continue
    lastTick = pai.t
    let applied = false
    const row = rewound && correction ? rewound.get(correction.tick) : undefined
    if (correctionPending && row !== undefined) {
      if (row.result !== 1 || pai.t > row.handled + 1) correctionPending = false // never rewound to, or already past
      else if (pai.t === row.handled + 1) {
        pai.inputs.serverCorrection = true
        correctionPending = false
        applied = true
      }
    } else if (correctionPending && current.prev) {
      const p = current.prev
      const jump = Math.hypot(pai.position.x - (p.position.x + p.delta.x), pai.position.y - (p.position.y + p.delta.y), pai.position.z - (p.position.z + p.delta.z))
      if (jump > 0.25) {
        pai.inputs.serverCorrection = true // the first PAI reporting the rewound state
        correctionPending = false
        applied = true
      }
    }
    const tick = diffPAI(current.prev, pai)
    const modes = { inputMode: pai.inputMode, playMode: pai.playMode, interactionModel: pai.interactionModel }
    if (!current.modes) current.modes = modes
    else if (Object.keys(modes).some(k => modes[k] !== current.modes[k])) throw new Error(`${current.name}: input mode changed at tick ${pai.t}`)
    if (actorFlags.length) {
      // per-tick events (not diffed): the server's restated actor flags, stamped with the tick they hold from
      tick.actorFlags = actorFlags
      actorFlags = []
    }
    if (attributes.length) {
      // per-tick events (not diffed): the server's movement attribute, stamped with the tick it holds from; the
      // client applies each through its rewind history, re-simulating from the tick after the stamp
      tick.attributes = attributes
      attributes = []
    }
    if (applied && correction) {
      // a per-tick event (not diffed): the client rewound to correction.tick + 1 and re-simulated up to this tick
      // (the PAIs in between still reported the pre-correction prediction)
      tick.correction = correction
      correction = null
    }
    if (abilities) {
      // per-tick events (not diffed): the server-granted abilities, which select the flying travel type and allow
      // the fly toggle
      if (typeof abilities.flying === 'boolean') tick.abilityFlying = abilities.flying
      if (typeof abilities.mayFly === 'boolean') tick.abilityMayFly = abilities.mayFly
      abilities = null
    }
    if (pai.inputs.handledTeleport && teleport !== null) {
      // a per-tick event (not diffed): the MovePlayer the client handled (its position is the eye position)
      tick.teleport = teleport
      tick.teleportOnGround = teleport.onGround
      teleport = null
    }
    current.ticks.push(tick)
    current.prev = pai
  }
  if (opts.arrival) stampArrival(scenarios, opts.arrival)
  const world = opts.world || path.join(outRoot, '1.26.10', 'world.json')
  writeFixtures(version, scenarios, world)
}

if (args[0] === '--bin') {
  const opts = {}
  for (let i = 2; i < args.length; i += 2) opts[args[i].replace(/^--/, '')] = args[i + 1]
  convertBin(args[1], opts)
} else if (args[0]) {
  convertStatic(args[0], args[1] || '1.26.10')
} else {
  console.error('usage: node scripts/convert-bedrock-fixtures.js <static physics dir> [version]\n       node scripts/convert-bedrock-fixtures.js --bin <recording.proxy.bin> [--world world.json] [--version v]')
  process.exit(1)
}
