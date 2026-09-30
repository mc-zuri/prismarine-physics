// Packets in the vanilla recordings: the client's outgoing packets are rebuilt from state and compared byte for byte;
// the server's packets are decoded and handled against the player state, and the result is compared with what the
// vanilla client did (the recording holds the full state before each packet and the fields it changed).
//
// Bytes are the protocol id + payload, as minecraft-protocol reads and writes them.
'use strict'
const { createSerializer, createDeserializer } = require('minecraft-protocol')
const { Vec3 } = require('vec3')

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
function movementPackets (after, input, net) {
  const packets = []
  const next = { ...net }
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
const MOVEMENT = new Set(['player_input', 'entity_action', 'position_look', 'position', 'look', 'flying', 'tick_end'])

// ---- incoming: vanilla ClientPacketListener ----

const TO_RAD = Math.PI / 180

/**
 * Applies a server packet to the player state (the harness PlayerState: pos, vel, elytraFlying, attributes, effect
 * levels, yawDegrees / pitchDegrees) and, for block updates, to the world. ctx = { version, mcData, entityId, world,
 * effectNames }. Only the player's own packets change it; packets about other entities must leave it alone.
 * Returns the packets the client sends back while handling it ([{ name, params }]).
 */
function handle (state, packet, ctx) {
  const p = packet.params
  const self = id => id === ctx.entityId
  const responses = []
  switch (packet.name) {
    case 'entity_velocity':
      if (self(p.entityId)) state.vel = new Vec3(p.velocity.x, p.velocity.y, p.velocity.z)
      break
    case 'explosion':
      if (p.playerKnockback) state.vel = state.vel.offset(p.playerKnockback.x, p.playerKnockback.y, p.playerKnockback.z)
      break
    case 'position': {
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
      // ClientPacketListener.handleMovePlayer acknowledges, then reports where it now is (onGround and collision false).
      responses.push({ name: 'teleport_confirm', params: { teleportId: p.teleportId } })
      responses.push({ name: 'position_look', params: { x: state.pos.x, y: state.pos.y, z: state.pos.z, yaw: state.yawDegrees, pitch: state.pitchDegrees, flags: flags(false, false) } })
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
          if (!String(prop.key).endsWith('movement_speed')) continue
          const key = ctx.mcData.attributesByName.movementSpeed.resource
          state.attributes = { ...state.attributes, [key]: { value: prop.value, modifiers: prop.modifiers.filter(m => !String(m.uuid).endsWith('sprinting')).map(m => ({ uuid: m.uuid, amount: m.amount, operation: m.operation })) } }
        }
      }
      break
    case 'entity_effect':
    case 'remove_entity_effect':
      if (self(p.entityId)) {
        const name = ctx.effectNames[p.effectId]
        if (name) state[name] = packet.name === 'entity_effect' ? p.amplifier + 1 : 0
      }
      break
    case 'entity_metadata':
      if (self(p.entityId)) {
        const shared = p.metadata.find(m => m.key === 0)
        if (shared) state.elytraFlying = (shared.value & 0x80) !== 0
      }
      break
    case 'block_change':
      ctx.world.setStateId([p.location.x, p.location.y, p.location.z], p.type)
      break
    case 'multi_block_change':
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

module.exports = { decode, encode, movementPackets, MOVEMENT, handle }
