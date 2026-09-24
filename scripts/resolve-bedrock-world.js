#!/usr/bin/env node
// Resolves the block states an engine-exported Bedrock fixture world could not name.
//
//   node scripts/resolve-bedrock-world.js --data <minecraft-data bedrock version dir> --in <world.json> [--out <world.json>]
//
// The world exporter names every cell from its own block table (1.26.20.4) and
// writes `unknown_<state hash>` with no collision boxes for a state that build does not publish. 1.26.50 moved the
// neighbour-dependent shapes (fences, panes, bars, stairs, walls) into block states, so every one of those cells is
// a new hash. This script recomputes the client's block-state hash (FNV-1a 32 over the little-endian NBT of
// { name, states }) for every state of a minecraft-data extraction (blockStates.json) and takes the cell's collision
// boxes from that extraction's blockCollisionShapes.json, which lists them per state.

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const opts = {}
for (let i = 0; i < args.length; i += 2) opts[args[i].replace(/^--/, '')] = args[i + 1]
if (!opts.data || !opts.in) {
  console.error('usage: node scripts/resolve-bedrock-world.js --data <minecraft-data bedrock version dir> --in <world.json> [--out <world.json>]')
  process.exit(1)
}

// NBT tag ids the block palette uses for state values.
const TAG = { byte: 1, int: 3, string: 8 }

// The bytes the client hashes: little-endian NBT, root compound with an empty name, holding `name` (with the
// minecraft: prefix) and `states` (in palette order) and not `version`.
function serializeState (name, states) {
  const parts = []
  const u8 = (v) => parts.push(Buffer.from([v & 0xff]))
  const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v); parts.push(b) }
  const str = (v) => { const t = Buffer.from(v, 'utf8'); const b = Buffer.alloc(2); b.writeUInt16LE(t.length); parts.push(b, t) }
  u8(10); str('')
  u8(8); str('name'); str(name)
  u8(10); str('states')
  for (const [key, { type, value }] of Object.entries(states)) {
    const tag = TAG[type]
    if (!tag) throw new Error(`${name}: state ${key} has NBT type ${type}`)
    u8(tag); str(key)
    if (tag === 1) u8(value)
    else if (tag === 3) i32(value)
    else str(value)
  }
  u8(0); u8(0)
  return Buffer.concat(parts)
}

function fnv1a32 (bytes) {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash = (hash ^ byte) >>> 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

// blockCollisionShapes.json: blocks[name] = shape index or one index per state (palette order); shapes[index] = boxes.
function loadExtraction (dir) {
  const states = JSON.parse(fs.readFileSync(path.join(dir, 'blockStates.json'), 'utf8'))
  const collisions = JSON.parse(fs.readFileSync(path.join(dir, 'blockCollisionShapes.json'), 'utf8'))
  const byHash = new Map()
  const stateIndex = new Map() // name -> states seen so far, to index the per-state shape list
  for (const state of states) {
    const name = state.name.replace(/^minecraft:/, '')
    const full = state.name.startsWith('minecraft:') ? state.name : `minecraft:${state.name}`
    const hash = fnv1a32(serializeState(full, state.states || {}))
    const nth = stateIndex.get(name) || 0
    stateIndex.set(name, nth + 1)
    const shapeRef = collisions.blocks[name]
    const shapeId = Array.isArray(shapeRef) ? shapeRef[nth] : shapeRef
    const boxes = shapeId === undefined ? undefined : collisions.shapes[shapeId]
    byHash.set(hash, { name, states: state.states, boxes })
  }
  return byHash
}

function resolve (world, byHash) {
  const resolved = []
  const unresolved = []
  for (const entry of world.palette) {
    const match = /^unknown_([0-9a-f]{8})$/.exec(entry.name)
    if (!match) continue
    const hash = parseInt(match[1], 16)
    const known = byHash.get(hash)
    if (!known) { unresolved.push(entry.name); continue }
    entry.name = known.name
    const boxes = known.boxes || []
    entry.shapes = boxes.length ? boxes.map(b => b.map(v => Math.round(v * 1e5) / 1e5)) : [[0, 0, 0, 0, 0, 0]]
    entry.boundingBox = boxes.length ? 'block' : 'empty'
    resolved.push(`${known.name} ${JSON.stringify(known.states)}`)
  }
  return { resolved, unresolved }
}

const world = JSON.parse(fs.readFileSync(opts.in, 'utf8'))
const { resolved, unresolved } = resolve(world, loadExtraction(opts.data))
fs.writeFileSync(opts.out || opts.in, JSON.stringify(world) + '\n')
console.log(`resolved ${resolved.length} state(s)${unresolved.length ? `, ${unresolved.length} still unknown: ${unresolved.join(' ')}` : ''}`)
for (const line of resolved) console.log('  ' + line)

module.exports = { fnv1a32, serializeState }
