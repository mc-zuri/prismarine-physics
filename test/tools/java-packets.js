// Packets in the vanilla recordings: the client's outgoing packets are rebuilt from state and compared byte for byte;
// the server's packets are decoded and handled against the player state, and the result is compared with what the
// vanilla client did (the recording holds the full state before each packet and the fields it changed).
//
// Bytes are the protocol id + payload, as minecraft-protocol reads and writes them.
'use strict'
const { createSerializer, createDeserializer } = require('minecraft-protocol')
const { Vec3 } = require('vec3')

// 26.3's entity moves carry a VecDelta that minecraft-protocol does not know yet: properties (onGround | steps << 1),
// then either one delta (three shorts) or each step's ticks (varint) and delta. Read as { onGround, x, y, z } or
// { onGround, steps: [{ ticks, x, y, z }] }.
function readVarInt (buffer, offset) {
  let value = 0
  let size = 0
  let byte
  do {
    if (offset + size >= buffer.length) throw new Error('varint past the end')
    byte = buffer[offset + size]
    value |= (byte & 0x7f) << (7 * size++)
  } while (byte & 0x80)
  return { value, size }
}
function writeVarInt (value, buffer, offset) {
  value >>>= 0
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value) byte |= 0x80
    buffer[offset++] = byte
  } while (value)
  return offset
}
const varIntSize = value => { let size = 1; value >>>= 0; while (value >= 0x80) { value >>>= 7; size++ } return size }
const vecDelta = {
  read (buffer, offset) {
    const properties = readVarInt(buffer, offset)
    let at = offset + properties.size
    const onGround = (properties.value & 1) !== 0
    const count = properties.value >>> 1
    const delta = () => { const d = { x: buffer.readInt16BE(at), y: buffer.readInt16BE(at + 2), z: buffer.readInt16BE(at + 4) }; at += 6; return d }
    if (count <= 0) return { value: { onGround, ...delta() }, size: at - offset }
    const steps = []
    for (let i = 0; i < count; i++) {
      const ticks = readVarInt(buffer, at)
      at += ticks.size
      steps.push({ ticks: ticks.value, ...delta() })
    }
    return { value: { onGround, steps }, size: at - offset }
  },
  write (value, buffer, offset) {
    const steps = value.steps || []
    offset = writeVarInt((value.onGround ? 1 : 0) | (steps.length << 1), buffer, offset)
    const delta = d => { buffer.writeInt16BE(d.x, offset); buffer.writeInt16BE(d.y, offset + 2); buffer.writeInt16BE(d.z, offset + 4); offset += 6 }
    if (!value.steps) delta(value)
    for (const step of steps) { offset = writeVarInt(step.ticks, buffer, offset); delta(step) }
    return offset
  },
  sizeOf (value) {
    const steps = value.steps || []
    return varIntSize((value.onGround ? 1 : 0) | (steps.length << 1)) + (value.steps ? steps.reduce((n, step) => n + varIntSize(step.ticks) + 6, 0) : 6)
  }
}
const compilerTypes = require('minecraft-protocol/src/datatypes/compiler-minecraft')
if (!compilerTypes.Read.vecDelta) {
  compilerTypes.Read.vecDelta = ['native', vecDelta.read]
  compilerTypes.Write.vecDelta = ['native', vecDelta.write]
  compilerTypes.SizeOf.vecDelta = ['native', vecDelta.sizeOf]
}

const codecs = new Map()
function codec (version) {
  if (!codecs.has(version)) {
    codecs.set(version, {
      toServer: { de: createDeserializer({ state: 'play', isServer: true, version }), ser: createSerializer({ state: 'play', isServer: false, version }) },
      toClient: { de: createDeserializer({ state: 'play', isServer: false, version }), ser: createSerializer({ state: 'play', isServer: true, version }) }
    })
  }
  return codecs.get(version)
}

const decode = (version, direction, hex) => codec(version)[direction].de.parsePacketBuffer(Buffer.from(hex, 'hex')).data
const encode = (version, direction, name, params) => codec(version)[direction].ser.createPacketBuffer({ name, params }).toString('hex')

// ---- outgoing: vanilla LocalPlayer.tick ----

const INPUT_KEYS = ['forward', 'backward', 'left', 'right', 'jump', 'shift', 'sprint']
const flags = (onGround, hasHorizontalCollision) => ({ onGround, hasHorizontalCollision })

/**
 * The movement packets vanilla sends in one tick, not riding: player_input when the keys changed, the sprint command
 * when sprinting changed, one of position_look / position / look / flying (LocalPlayer.sendPosition), tick_end.
 *   after:  the player after the tick ({ pos: [x,y,z], onGround, isCollidedHorizontally, sprinting })
 *   input:  the tick's keys and view ({ forward, back, left, right, jump, sneak, sprint, yaw, pitch })
 *   net:    the network state before the tick (the previous row's netState)
 * Returns { packets: [{ name, params }], net } with the network state after it.
 */
function movementPackets (after, input, net, version, extra = {}) {
  const legacy = version && isOlder(version, '1.21.2')
  const packets = []
  const next = { ...net }
  const before = extra.before || {}
  // LocalPlayer.aiStep: the flight toggle (abilities), the glide start and the riding jump go out before the tick's
  // own packets
  if (after.flying !== undefined && !!after.flying !== !!before.flying && extra.mayFly) {
    if (version && isOlder(version, '1.16')) {
      // before 1.16 the client sends all its abilities (creative: invulnerable, may fly, instabuild) and both speeds
      const speeds = before.attributes || {}
      const flyingSpeed = speeds['abilities.flyingSpeed'] !== undefined ? speeds['abilities.flyingSpeed'] : Math.fround(0.05)
      packets.push({ name: 'abilities', params: { flags: 1 | 4 | 8 | (after.flying ? 2 : 0), flyingSpeed, walkingSpeed: Math.fround(0.1) } })
    } else packets.push({ name: 'abilities', params: { flags: after.flying ? 2 : 0 } })
  }
  // Since 1.15 the client starts gliding itself; before, it only asks: jump newly pressed in the air while falling, not
  // gliding or flying, an elytra worn.
  const asksToGlide = extra.clientStartsGliding
    ? after.elytraFlying && !before.elytraFlying
    : extra.chest === 'elytra' && input.jump && !(extra.prevKeys && extra.prevKeys.jump) && !before.onGround && before.vel && before.vel[1] < 0 && !before.elytraFlying && !after.flying
  if (asksToGlide) packets.push({ name: 'entity_action', params: { entityId: net.entityId, actionId: actionName(version, 'start_fall_flying', 'start_elytra_flying'), jumpBoost: 0 } })
  const beforeVehicle = before.vehicle
  if (beforeVehicle && after.vehicle && JUMPABLE.has(beforeVehicle.type) && extra.prevKeys && extra.prevKeys.jump && !input.jump) {
    packets.push({ name: 'entity_action', params: { entityId: net.entityId, actionId: actionName(version, 'start_riding_jump', 'start_horse_jump'), jumpBoost: Math.floor(Math.fround(beforeVehicle.jumpRidingScale * 100)) } })
  }
  if (after.vehicle) return ridingPackets(packets, next, after, input, net, legacy, extra, version)
  if (legacy) return legacyMovementPackets(packets, next, after, input, net, extra, version)
  const keys = [!!input.forward, !!input.back, !!input.left, !!input.right, !!input.jump, !!input.sneak, !!input.sprint]
  if (!net.lastSentInput || keys.some((k, i) => k !== net.lastSentInput[i])) {
    const inputs = {}
    INPUT_KEYS.forEach((k, i) => { inputs[k] = keys[i] })
    packets.push({ name: 'player_input', params: { inputs } })
    next.lastSentInput = keys
  }
  if (after.sprinting !== net.wasSprinting) {
    packets.push({ name: 'entity_action', params: { entityId: net.entityId, actionId: after.sprinting ? 'start_sprinting' : 'stop_sprinting', jumpBoost: 0 } })
    next.wasSprinting = after.sprinting
  }
  const [x, y, z] = after.pos
  const dx = x - net.lastPos[0]
  const dy = y - net.lastPos[1]
  const dz = z - net.lastPos[2]
  const reminder = net.positionReminder + 1
  const moved = dx * dx + dy * dy + dz * dz > 2.0e-4 * 2.0e-4 || reminder >= 20
  const yaw = Math.fround(input.yaw)
  const pitch = Math.fround(input.pitch)
  // lastYaw / lastPitch are Java floats written as decimal text: round them back to floats before comparing.
  const turned = yaw - Math.fround(net.lastYaw) !== 0 || pitch - Math.fround(net.lastPitch) !== 0
  const f = flags(after.onGround, after.isCollidedHorizontally)
  if (moved && turned) packets.push({ name: 'position_look', params: { x, y, z, yaw, pitch, flags: f } })
  else if (moved) packets.push({ name: 'position', params: { x, y, z, flags: f } })
  else if (turned) packets.push({ name: 'look', params: { yaw, pitch, flags: f } })
  else if (net.lastOnGround !== after.onGround || net.lastHorizontalCollision !== after.isCollidedHorizontally) packets.push({ name: 'flying', params: { flags: f } })
  next.positionReminder = moved ? 0 : reminder
  if (moved) next.lastPos = [x, y, z]
  if (turned) { next.lastYaw = yaw; next.lastPitch = pitch }
  next.lastOnGround = after.onGround
  next.lastHorizontalCollision = after.isCollidedHorizontally
  packets.push({ name: 'tick_end', params: {} })
  return { packets, net: next }
}
// Before 1.21.2 (LocalPlayer.sendPosition): the sprint and shift commands, then the move packet carrying onGround only;
// no player_input or tick_end.
function legacyMovementPackets (packets, next, after, input, net, extra, version) {
  if (extra.usedItem && extra.before && !(version && isOlder(version, '1.17'))) {
    // MultiPlayerGameMode.useItem first reports where the player is (before the tick) and how it looks; not yet in
    // 1.16 (1.16.4 sends use_item alone, 1.18.1 does this)
    const [bx, by, bz] = extra.before.pos
    packets.push({ name: 'position_look', params: { x: bx, y: by, z: bz, yaw: Math.fround(input.yaw), pitch: Math.fround(input.pitch), onGround: extra.before.onGround } })
  }
  if (after.sprinting !== net.wasSprinting) {
    packets.push({ name: 'entity_action', params: { entityId: net.entityId, actionId: after.sprinting ? 'start_sprinting' : 'stop_sprinting', jumpBoost: 0 } })
    next.wasSprinting = after.sprinting
  }
  // the sneak state the server last heard of (wasSneaking in recordings before 1.13)
  const sneakField = net.wasSneaking !== undefined ? 'wasSneaking' : 'wasShiftKeyDown'
  if (after.shiftKeyDown !== undefined && !!after.shiftKeyDown !== !!net[sneakField]) {
    packets.push({ name: 'entity_action', params: { entityId: net.entityId, actionId: after.shiftKeyDown ? 'start_sneaking' : 'stop_sneaking', jumpBoost: 0 } })
    next[sneakField] = after.shiftKeyDown
  }
  const [x, y, z] = after.pos
  const dx = x - net.lastPos[0]
  const dy = y - net.lastPos[1]
  const dz = z - net.lastPos[2]
  const reminder = net.positionReminder + 1
  // a move counts past 0.03 blocks before 1.19, past 2e-4 since
  const threshold = version && isOlder(version, '1.19') ? 9.0e-4 : 2.0e-4 * 2.0e-4
  const moved = dx * dx + dy * dy + dz * dz > threshold || reminder >= 20
  const yaw = Math.fround(input.yaw)
  const pitch = Math.fround(input.pitch)
  const turned = yaw - Math.fround(net.lastYaw) !== 0 || pitch - Math.fround(net.lastPitch) !== 0
  const onGround = after.onGround
  if (moved && turned) packets.push({ name: 'position_look', params: { x, y, z, yaw, pitch, onGround } })
  else if (moved) packets.push({ name: 'position', params: { x, y, z, onGround } })
  else if (turned) packets.push({ name: 'look', params: { yaw, pitch, onGround } })
  // before 1.9 the bare move packet goes out every tick; since, only when onGround changed
  else if (net.lastOnGround !== onGround || (version && isOlder(version, '1.9'))) packets.push({ name: 'flying', params: { onGround } })
  next.positionReminder = moved ? 0 : reminder
  if (moved) next.lastPos = [x, y, z]
  if (turned) { next.lastYaw = yaw; next.lastPitch = pitch }
  next.lastOnGround = onGround
  return { packets, net: next }
}

// The vehicles the rider drives (their movement is the client's): boats and rafts, horses and the like, camels, and
// pigs and striders steered with their stick.
const JUMPABLE = new Set(['horse', 'donkey', 'mule', 'skeleton_horse', 'zombie_horse', 'camel', 'camel_husk'])
function drives (vehicle, extra) {
  const type = vehicle.type
  if (/boat$|raft$/.test(type) || JUMPABLE.has(type) || type === 'llama' || type === 'trader_llama') return true
  const held = extra.mainhand
  return (type === 'pig' && held === 'carrot_on_a_stick') || (type === 'strider' && held === 'warped_fungus_on_a_stick')
}

// LocalPlayer.tick while riding: a boat's paddles (sent in its own tick, from the keys of the tick before), the input
// (1.21.2+ when it changed; before, steer_vehicle every tick), the rotation, then the driven vehicle's move and the
// sprint command; tick_end from 1.21.2.
function ridingPackets (packets, next, after, input, net, legacy, extra, version) {
  const vehicle = after.vehicle
  const driven = drives(vehicle, extra)
  if (driven && /boat$|raft$/.test(vehicle.type)) {
    const k = extra.prevKeys || {}
    const up = !!k.forward
    packets.push({ name: 'steer_boat', params: { leftPaddle: (!!k.right && !k.left) || up, rightPaddle: (!!k.left && !k.right) || up } })
  }
  // Since 26.3 the packets go out after the whole tick (LocalPlayer.sendChanges), with the rotation the vehicle gave
  // the rider; before, from the rider's own tick, ahead of the vehicle's.
  const late = version && !isOlder(version, '26.3') && after.yaw !== undefined
  const yaw = Math.fround(late ? after.yaw : input.yaw)
  const pitch = Math.fround(late ? after.pitch : input.pitch)
  if (legacy) {
    packets.push({ name: 'look', params: { yaw, pitch, onGround: !!after.onGround } })
    const strafe = Math.fround(((input.left ? 1 : 0) - (input.right ? 1 : 0)) * Math.fround(0.98))
    const forward = Math.fround(((input.forward ? 1 : 0) - (input.back ? 1 : 0)) * Math.fround(0.98))
    packets.push({ name: 'steer_vehicle', params: { sideways: strafe, forward, jump: (input.jump ? 1 : 0) | (input.sneak ? 2 : 0) } })
  } else {
    const keys = [!!input.forward, !!input.back, !!input.left, !!input.right, !!input.jump, !!input.sneak, !!input.sprint]
    if (!net.lastSentInput || keys.some((key, i) => key !== net.lastSentInput[i])) {
      const inputs = {}
      INPUT_KEYS.forEach((key, i) => { inputs[key] = keys[i] })
      packets.push({ name: 'player_input', params: { inputs } })
      next.lastSentInput = keys
    }
    packets.push({ name: 'look', params: { yaw, pitch, flags: flags(!!after.onGround, !!after.isCollidedHorizontally) } })
  }
  if (driven) {
    const [x, y, z] = vehicle.pos
    const params = { x, y, z, yaw: Math.fround(vehicle.yaw), pitch: Math.fround(vehicle.pitch) }
    if (!legacy) params.onGround = !!vehicle.onGround
    packets.push({ name: 'vehicle_move', params })
    // (the sprint command while riding since 1.19.3)
    if (after.sprinting !== net.wasSprinting && !(version && isOlder(version, '1.19.3'))) {
      packets.push({ name: 'entity_action', params: { entityId: net.entityId, actionId: after.sprinting ? 'start_sprinting' : 'stop_sprinting', jumpBoost: 0 } })
      next.wasSprinting = after.sprinting
    }
  }
  if (!legacy) packets.push({ name: 'tick_end', params: {} })
  return { packets, net: next }
}

const dataVersions = new Map()
// The protocol's name for an entity_action (minecraft-data renamed some: start_elytra_flying, start_horse_jump).
function actionName (version, ...names) {
  if (!version) return names[0]
  if (!dataVersions.has(version)) dataVersions.set(version, require('minecraft-data')(version))
  const type = JSON.stringify(dataVersions.get(version).protocol.play.toServer.types.packet_entity_action || '')
  return names.find(name => type.includes(`"${name}"`)) || names[0]
}

function isOlder (version, than) {
  if (!dataVersions.has(version)) dataVersions.set(version, require('minecraft-data')(version))
  return dataVersions.get(version).isOlderThan(than)
}

const MOVEMENT = new Set(['player_input', 'entity_action', 'position_look', 'position', 'look', 'flying', 'tick_end', 'abilities', 'steer_boat', 'steer_vehicle', 'vehicle_move'])

// ---- incoming: vanilla ClientPacketListener ----

const TO_RAD = Math.PI / 180

/**
 * Applies a server packet to the player state (the harness PlayerState: pos, vel, elytraFlying, attributes, effect
 * levels, yawDegrees / pitchDegrees) and, for block updates, to the world. ctx = { version, mcData, entityId, world,
 * effectNames }. Only the player's own packets change it; packets about other entities must leave it alone.
 * Returns the packets the client sends back while handling it ([{ name, params }]).
 */
// The attribute an update_attributes property names. Before 1.20.5 it travels by name (key before 1.16); since, by registry id, which
// minecraft-protocol decodes with a mapper that may be stale: map the decoded name back to its id and take the
// attribute from the registry (minecraft-data's attributes are in registry order).
function attributeResource (prop, mcData) {
  if (prop.name !== undefined) return prop.name
  const type = mcData.protocol.play.toClient.types.packet_entity_update_attributes
  const mappings = JSON.stringify(type).match(/"mappings":({[^}]*})/)
  // (a plain string key before 1.16, e.g. generic.movementSpeed)
  if (!mappings) return prop.key
  const id = mappings ? Object.entries(JSON.parse(mappings[1])).find(([, name]) => name === prop.key) : undefined
  const attribute = id && mcData.attributesArray[Number(id[0])]
  return attribute ? attribute.resource : undefined
}

// The tracked entity a packet is about: by id, else the first summoned one not yet identified (not the player, not
// its vehicle).
function otherEntity (state, id, ctx) {
  if (!state.entities || id === ctx.entityId || (state.vehicle && state.vehicle.id === id)) return null
  return state.entities.find(e => e.id === id) || (() => {
    const unknown = state.entities.find(e => e.id === null)
    if (unknown) unknown.id = id
    return unknown
  })()
}

function handle (state, packet, ctx) {
  const p = packet.params
  const self = id => id === ctx.entityId
  const responses = []
  switch (packet.name) {
    case 'entity_velocity':
      if (self(p.entityId)) {
        // before 1.21.9 the velocity travels in 1/8000 blocks per tick (shorts); since, as a packed double vector
        const scale = ctx.mcData.isOlderThan('1.21.9') ? 8000 : 1
        state.vel = new Vec3(p.velocity.x / scale, p.velocity.y / scale, p.velocity.z / scale)
      }
      break
    case 'explosion':
      if (p.playerKnockback) state.vel = state.vel.offset(p.playerKnockback.x, p.playerKnockback.y, p.playerKnockback.z)
      // before 1.21.2 the knockback came as playerMotionX/Y/Z floats
      else if (p.playerMotionX !== undefined) state.vel = state.vel.offset(p.playerMotionX, p.playerMotionY, p.playerMotionZ)
      break
    case 'position': {
      if (typeof p.flags === 'number') {
        // Before 1.21.2: bit flags (x, y, z, yaw, pitch relative); a relative axis keeps its velocity, an absolute one
        // stops it, and the reply reports onGround false.
        const rel = bit => (p.flags & bit) !== 0
        const v = state.vel
        state.pos = new Vec3(rel(1) ? state.pos.x + p.x : p.x, rel(2) ? state.pos.y + p.y : p.y, rel(4) ? state.pos.z + p.z : p.z)
        state.vel = new Vec3(rel(1) ? v.x : 0, rel(2) ? v.y : 0, rel(4) ? v.z : 0)
        state.yawDegrees = Math.fround(rel(8) ? state.yawDegrees + p.yaw : p.yaw)
        state.pitchDegrees = Math.fround(rel(16) ? state.pitchDegrees + p.pitch : p.pitch)
        responses.push({ name: 'teleport_confirm', params: { teleportId: p.teleportId } })
        responses.push({ name: 'position_look', params: { x: state.pos.x, y: state.pos.y, z: state.pos.z, yaw: state.yawDegrees, pitch: state.pitchDegrees, onGround: false } })
        break
      }
      // PositionMoveRotation.calculateAbsolute: relative flags add to the current value; yawDelta rotates velocity.
      const r = p.flags
      state.pos = new Vec3(r.x ? state.pos.x + p.x : p.x, r.y ? state.pos.y + p.y : p.y, r.z ? state.pos.z + p.z : p.z)
      let v = state.vel
      if (r.yawDelta) {
        const yaw = r.yaw ? state.yawDegrees + p.yaw : p.yaw
        const pitch = r.pitch ? state.pitchDegrees + p.pitch : p.pitch
        v = rotate(v, (state.pitchDegrees - pitch) * TO_RAD, (state.yawDegrees - yaw) * TO_RAD)
      }
      state.vel = new Vec3(r.dx ? v.x + p.dx : p.dx, r.dy ? v.y + p.dy : p.dy, r.dz ? v.z + p.dz : p.dz)
      state.yawDegrees = Math.fround(r.yaw ? state.yawDegrees + p.yaw : p.yaw)
      state.pitchDegrees = Math.fround(r.pitch ? state.pitchDegrees + p.pitch : p.pitch)
      // ClientPacketListener.handleMovePlayer acknowledges, then reports where it now is (onGround and collision false);
      // since 26.3 the acknowledgement itself carries the position and rotation.
      if (/"name":"x"/.test(JSON.stringify(ctx.mcData.protocol.play.toServer.types.packet_teleport_confirm))) {
        responses.push({ name: 'teleport_confirm', params: { teleportId: p.teleportId, x: state.pos.x, y: state.pos.y, z: state.pos.z, yaw: state.yawDegrees, pitch: state.pitchDegrees } })
      } else {
        responses.push({ name: 'teleport_confirm', params: { teleportId: p.teleportId } })
        responses.push({ name: 'position_look', params: { x: state.pos.x, y: state.pos.y, z: state.pos.z, yaw: state.yawDegrees, pitch: state.pitchDegrees, flags: flags(false, false) } })
      }
      break
    }
    case 'player_rotation':
      state.yawDegrees = Math.fround(p.relativeYaw ? state.yawDegrees + p.yaw : p.yaw)
      state.pitchDegrees = Math.fround(p.relativePitch ? state.pitchDegrees + p.pitch : p.pitch)
      responses.push({ name: 'look', params: { yaw: state.yawDegrees, pitch: state.pitchDegrees, flags: flags(false, false) } })
      break
    case 'entity_update_attributes':
      if (self(p.entityId)) {
        for (const prop of p.properties) {
          const key = ctx.mcData.attributesByName.movementSpeed.resource
          const bare = r => String(r).replace(/^minecraft:/, '')
          if (bare(attributeResource(prop, ctx.mcData)) !== bare(key)) continue
          state.attributes = { ...state.attributes, [key]: { value: prop.value, modifiers: prop.modifiers.filter(m => !String(m.uuid).endsWith('sprinting')).map(m => ({ uuid: m.uuid, amount: m.amount, operation: m.operation })) } }
        }
      }
      break
    case 'entity_status': {
      // 9: the item in use is done; the client finishes it too, and a food eats into its own food level
      const food = ctx.mainhand && ctx.mcData.foodsByName && ctx.mcData.foodsByName[ctx.mainhand]
      if (self(p.entityId) && p.entityStatus === 9 && food && state.food !== undefined) state.food = Math.min(20, state.food + food.foodPoints)
      break
    }
    case 'set_passengers':
      // the player no longer among the vehicle's passengers: it rides no more, and the vehicle stays where it was
      if (state.vehicle && state.vehicle.id === p.entityId && !p.passengers.includes(ctx.entityId)) {
        if (state.entities) state.entities.push({ id: state.vehicle.id, type: state.vehicle.type, pos: state.vehicle.pos.clone() })
        state.vehicle = undefined
      }
      break
    case 'rel_entity_move':
    case 'entity_move_look': {
      // another entity moved by a delta in 1/4096 blocks (26.3: a VecDelta)
      const other = otherEntity(state, p.entityId, ctx)
      const d = p.delta ? (p.delta.steps ? p.delta.steps.reduce((a, s) => ({ x: a.x + s.x, y: a.y + s.y, z: a.z + s.z }), { x: 0, y: 0, z: 0 }) : p.delta) : { x: p.dX, y: p.dY, z: p.dZ }
      if (other && d) other.pos = other.pos.offset(d.x / 4096, d.y / 4096, d.z / 4096)
      break
    }
    case 'sync_entity_position':
    case 'entity_teleport': {
      const other = otherEntity(state, p.entityId, ctx)
      if (other && p.x !== undefined) other.pos = new Vec3(p.x, p.y, p.z)
      break
    }
    case 'entity_destroy':
      if (state.entities) state.entities = state.entities.filter(e => !p.entityIds.includes(e.id))
      break
    case 'update_health':
      // the food level (sprinting needs more than 6)
      state.food = p.food
      break
    case 'entity_effect':
    case 'remove_entity_effect':
      if (self(p.entityId)) {
        const name = ctx.effectNames[p.effectId]
        if (name) state[name] = packet.name === 'entity_effect' ? p.amplifier + 1 : 0
      }
      break
    case 'entity_metadata':
      if (state.vehicle && p.entityId === state.vehicle.id) {
        // a horse's flags (the one byte past the living entity's own: 13 in 1.12, 17 in 1.17-1.21, 18 in 26.3): 32
        // standing (rearing)
        const flags = p.metadata.find(m => m.key >= 13 && (m.type === 'byte' || m.type === 0))
        if (flags) state.vehicle.standing = (flags.value & 32) !== 0
      }
      if (self(p.entityId)) {
        const shared = p.metadata.find(m => m.key === 0)
        if (shared) state.elytraFlying = (shared.value & 0x80) !== 0
      }
      break
    case 'block_change':
      ctx.world.setStateId([p.location.x, p.location.y, p.location.z], p.type)
      break
    case 'multi_block_change':
      if (p.chunkX !== undefined) {
        // before 1.16: per chunk column, each record's x << 4 | z, y and state
        for (const record of p.records) ctx.world.setStateId([p.chunkX * 16 + (record.horizontalPos >> 4), record.y, p.chunkZ * 16 + (record.horizontalPos & 15)], record.blockId)
        break
      }
      for (const record of p.records) {
        const stateId = Math.floor(record / 4096)
        const local = record & 4095
        ctx.world.setStateId([p.chunkCoordinates.x * 16 + (local >> 8), p.chunkCoordinates.y * 16 + (local & 15), p.chunkCoordinates.z * 16 + ((local >> 4) & 15)], stateId)
      }
      break
    default:
      break
  }
  return responses
}

// Vec3.xRot then Vec3.yRot, as vanilla rotates a velocity (float trig).
function rotate (v, pitch, yaw) {
  const c1 = Math.fround(Math.cos(pitch))
  const s1 = Math.fround(Math.sin(pitch))
  const y1 = v.y * c1 + v.z * s1
  const z1 = v.z * c1 - v.y * s1
  const c2 = Math.fround(Math.cos(yaw))
  const s2 = Math.fround(Math.sin(yaw))
  return new Vec3(v.x * c2 + z1 * s2, y1, z1 * c2 - v.x * s2)
}

// The packets handle() reads.
const HANDLED = new Set(['rel_entity_move', 'entity_move_look', 'sync_entity_position', 'entity_teleport', 'entity_destroy', 'set_passengers', 'entity_velocity', 'explosion', 'position', 'player_rotation', 'entity_update_attributes', 'entity_status', 'update_health', 'entity_effect', 'remove_entity_effect', 'entity_metadata', 'block_change', 'multi_block_change'])

// A server packet decoded for handle(). A packet the handlers do not read may fail to decode where minecraft-data's
// protocol lags (26.3 item components): it is passed on by name only. One they read must decode.
function decodeServer (version, hex) {
  try {
    return decode(version, 'toClient', hex)
  } catch (err) {
    if (!dataVersions.has(version)) dataVersions.set(version, require('minecraft-data')(version))
    const type = JSON.stringify(dataVersions.get(version).protocol.play.toClient.types.packet)
    const mappings = JSON.parse(type.match(/"mappings":({[^}]*})/)[1])
    const id = readVarInt(Buffer.from(hex, 'hex'), 0).value
    const name = Object.entries(mappings).find(([key]) => Number(key) === id)
    if (!name || HANDLED.has(name[1])) throw err
    return { name: name[1], params: {}, undecoded: true }
  }
}

module.exports = { decode, decodeServer, encode, movementPackets, MOVEMENT, handle }
