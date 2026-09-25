// A local player's session: its ticks, the history they leave, and the server's movement packets applied on the
// tick they take effect. The same session serves a live client and a recording's replay.
//
//   const session = new BedrockSession({ physics, world })
//   session.handlePacket(name, params)   // a packet as bedrock-protocol decodes it; takes effect next tick
//   session.tick(state, frame)           // one tick: the packets due, then the simulation
//
// `state` is the player (a PlayerState or the same shape) and `frame` the tick's inputs: { t, control, yaw?, pitch?,
// bedrockYaw?, bedrockPitch?, riptideLaunch?, spinHits?, fireworkUsed?, usingItem?, itemUseStarted? }. The session keeps each tick's frame and the state after it, so a correction stamped for
// an earlier tick is installed there and the ticks since are simulated again with their inputs.
//
// The actions (teleport, correct, movementAttribute, actorFlags) are callable directly, for a caller that decides
// itself which tick a packet takes effect on.
import { f } from '../math/float.ts'
import { GLIDE_BOOST_RATE } from '../movement/movement-effects.ts'
import { LAVA_MOVEMENT_ATTRIBUTE, UNDERWATER_MOVEMENT_ATTRIBUTE } from '../movement/travel.ts'
import type { Control, Player, World } from '../types.ts'
import { ACTOR_FLAG_NAMES, MoveMode, type ActorFlags, type MoveCorrection, type Teleport } from './corrections.ts'
import { sanitizeHistorySize } from './history.ts'
import { BedrockRewind, type Frame } from './rewind.ts'

// A teleport at least this far starts the history over; a nearer one is filed on it.
const FAR_TELEPORT = 16
// A correction that agrees with the history within this squared distance (position and velocity) changes nothing.
const DIVERGENCE = f(0.0000099999997)

// What the session needs of the physics object.
export interface SessionPhysics {
  eyeHeight: number
  movementSpeedAttribute: string
  simulatePlayer (state: Player, world: World): unknown
  handleTeleport (state: Player, teleport: Teleport): void
  applyCorrection (state: Player, correction: MoveCorrection): void
  applyMotion (state: Player, motion: { x: number, y: number, z: number }): void
  setMovementAttribute (state: Player, attribute: { base: number, current?: number, sprintStartedSince?: boolean }): void
  setActorFlags (state: Player, flags: ActorFlags): void
}

// One tick's inputs: the tick number, the control state, the rotation, and a riptide launch and the mobs the spin hit.
export interface TickFrame extends Frame {
  control?: Control | undefined
  yaw?: number | undefined
  pitch?: number | undefined
  bedrockYaw?: number | undefined
  bedrockPitch?: number | undefined
  riptideLaunch?: number | undefined
  spinHits?: number | undefined
  fireworkUsed?: boolean | undefined
  usingItem?: boolean | undefined
  itemUseStarted?: boolean | undefined
}

// A movement correction with the tick it is stamped for.
export interface StampedCorrection extends MoveCorrection { tick: number, dx: number, dy: number, dz: number }
// A movement attribute with its tick: the value without the sprint boost, and the current one.
export interface StampedAttribute { tick: number, walk: number, current: number }
// The liquid movement attributes of an update_attributes packet (their values by name), with its tick.
export interface StampedLiquidAttributes { tick: number, values: Record<string, number> }
// Restated actor flags with their tick.
// `inAscendable`: the climbable-block flag, where the raw word carries it
export type StampedFlags = ActorFlags & { tick: number, inAscendable?: boolean, inScaffolding?: boolean }
// The effect levels the engine reads, by the effect's id on the wire.
export const EFFECT_FIELDS: Readonly<Record<number, 'speed' | 'slowness' | 'jumpBoost' | 'blindness' | 'levitation' | 'slowFalling' | 'weaving'>> = {
  1: 'speed', 2: 'slowness', 8: 'jumpBoost', 15: 'blindness', 24: 'levitation', 27: 'slowFalling', 33: 'weaving'
}
// A mob effect's level (0: removed) on the player field it sets, with the tick it is stamped for (0: not stamped) and
// its ticks (none, or a negative count: it lasts until removed).
export interface StampedEffect { tick: number, field: EffectField, level: number, duration?: number | undefined }
// A level field a mob effect sets.
export type EffectField = typeof EFFECT_FIELDS[number]

// A mob effect as the client runs it: from the frame it takes effect on, its level (0: removed) and its last tick
// (none: until the next change).
export interface EffectEvent { frame: number, level: number, end?: number | undefined }

// The level an effect's events give tick `t`: the latest event taking effect by then, 0 once its duration ran out;
// undefined before the first.
export function effectLevel (events: readonly EffectEvent[], t: number): number | undefined {
  let level: number | undefined
  for (const event of events) {
    if (event.frame > t) break
    level = event.end !== undefined && t > event.end ? 0 : event.level
  }
  return level
}

// A glide boost the server grants (a firework used while gliding): its ticks (-1 without end) and the tick it is
// stamped for.
export interface StampedGlideBoost { tick: number, duration: number }

// What is left of a movement effect `ticks` after its stamp (-1 lasts), counting down `rate` a tick.
export function agedDuration (duration: number, ticks: number, rate = 1): number {
  if (duration === -1 || ticks <= 0) return duration
  return Math.max(duration - ticks * rate, 0)
}
// A motion with the tick it is stamped for (0: not stamped).
export interface StampedMotion { tick: number, x: number, y: number, z: number }

type Id = bigint | number | string | null | undefined

function distanceSquared (a: { x: number, y: number, z: number }, b: { x: number, y: number, z: number }): number {
  const dx = f(a.x - b.x)
  const dy = f(a.y - b.y)
  const dz = f(a.z - b.z)
  return f(f(f(dz * dz) + f(f(dy * dy) + f(dx * dx))))
}

function sameId (a: Id, b: Id): boolean {
  return a !== undefined && a !== null && b !== undefined && b !== null && BigInt(a) === BigInt(b)
}

// A local player's session: its ticks, their history, and the server's movement packets applied on the tick they take
// effect.
export class BedrockSession {
  physics: SessionPhysics
  world: World
  eyeHeight: number
  step: (state: Player, frame: TickFrame) => void
  rewind: BedrockRewind<Player>
  // the oldest tick of the client's own history: only a far teleport clears it
  ringOldest = -Infinity
  // the packets not yet applied, by the tick they apply on
  scheduled: Array<{ at: number, run: (state: Player) => void }> = []
  localRuntimeId: Id = null
  localUniqueId: Id = null
  // the flags the server last restated, by name
  serverFlags: Record<string, unknown> = {}
  // the player's own game type as the client holds it ('default': the world's) and the world's (unset: not yet known)
  ownGameType: string | undefined
  worldGameType: string | undefined
  // the game mode the client simulates with: its own, the world's where its own is the default (unset: the caller's)
  get gameMode (): string | undefined {
    const mode = this.ownGameType === 'default' ? this.worldGameType : this.ownGameType
    return mode !== undefined && GAME_MODES.has(mode) ? mode : undefined
  }

  // the mob effects the server sent, by the level field they set
  effects = new Map<EffectField, EffectEvent[]>()
  pendingAttribute: { attribute: StampedAttribute } | null = null
  // the restated flags that differed from the history, by the tick they were filed after; and the ticks filed since the
  // last rewind, the oldest of which still in the history the next one simulates again from
  flagCorrections = new Map<number, ActorFlags>()
  flagged = new Set<number>()
  // the last teleport that left the history as it was (stamped before it)
  staleTeleport: Teleport | undefined
  // an attribute was filed since the last rewind: every stamped one is, until the next
  attributesFiled = false
  // the actions ticks simulated again raised that they had not, which the next tick reports
  carried: Set<string> | undefined

  constructor ({ physics, world, history = 16, step }: { physics: SessionPhysics, world: World, history?: number, step?: (state: Player, frame: TickFrame) => void }) {
    this.physics = physics
    this.world = world
    this.eyeHeight = physics.eyeHeight
    this.step = step || ((state, frame) => this.simulate(state, frame))
    this.rewind = new BedrockRewind<Player>({ step: this.step as (state: Player, frame: Frame) => void, history })
  }

  // One tick with the frame's inputs. A tick simulated again takes the flags filed on it again, and keeps the actions it
  // raises that it had not.
  simulate (state: Player, frame: TickFrame): void {
    const again = frame.t < this.rewind.current
    const filed = again ? this.flagCorrections.get(frame.t - 1) : undefined
    if (filed) this.physics.setActorFlags(state, filed)
    if (typeof frame.bedrockYaw === 'number') state.bedrockYaw = frame.bedrockYaw
    if (typeof frame.bedrockPitch === 'number') state.bedrockPitch = frame.bedrockPitch
    if (typeof frame.yaw === 'number') state.yaw = frame.yaw
    if (typeof frame.pitch === 'number') state.pitch = frame.pitch
    if (frame.control) state.control = frame.control
    if (typeof frame.riptideLaunch === 'number') state.riptideLaunch = frame.riptideLaunch
    if (typeof frame.spinHits === 'number') state.spinHits = frame.spinHits
    if (typeof frame.fireworkUsed === 'boolean') state.fireworkUsed = frame.fireworkUsed
    if (typeof frame.usingItem === 'boolean') state.usingItem = frame.usingItem
    if (typeof frame.itemUseStarted === 'boolean') state.itemUseStarted = frame.itemUseStarted
    state.lastOnGround = state.onGround
    if (this.gameMode !== undefined) state.gameMode = this.gameMode
    for (const [field, events] of this.effects) {
      const level = effectLevel(events, frame.t)
      if (level !== undefined) state[field] = level
    }
    this.physics.simulatePlayer(state, this.world)
    if (!again || !this.carried) return
    const had = this.rewind.snapshots.get(frame.t)?.bedrock?.actions
    for (const action of state.bedrock!.actions!) if (!had?.has(action)) this.carried.add(action)
  }

  // Files the tick's frame, runs `before(state)`, then the packets due on this tick, then the simulation, and keeps
  // the state after it.
  tick (state: Player, frame: TickFrame, before?: (state: Player) => void): Player {
    this.rewind.push(frame)
    if (before) before(state)
    this.runDue(state, frame.t)
    this.simulate(state, frame)
    this.rewind.snapshot(frame.t, state)
    return state
  }

  // Runs `run(state)` at the start of tick `at` (by default the next tick simulated).
  schedule (run: (state: Player) => void, at = -Infinity): void {
    this.scheduled.push({ at, run })
    this.scheduled.sort((x, y) => x.at - y.at)
  }

  runDue (state: Player, t: number): void {
    for (let next = this.scheduled[0]; next && next.at <= t; next = this.scheduled[0]) {
      this.scheduled.shift()
      next.run(state)
    }
  }

  // ---- the actions -----------------------------------------------------------------------------------------------

  // A teleport of the local player on tick `t`. A far one clears the client's history; the replay history starts over
  // either way, since a re-simulation cannot re-apply a teleport.
  teleport (state: Player, t: number, teleport: Teleport): void {
    // measured from where the last tick left the player (the caller may have placed it at the target already)
    const from = this.rewind.snapshots.get(this.rewind.current - 1)?.pos ?? state.pos
    const far = Math.hypot(teleport.x - from.x, teleport.y - this.eyeHeight - from.y, teleport.z - from.z) >= FAR_TELEPORT
    if (far) this.ringOldest = t
    this.physics.handleTeleport(state, teleport)
    this.rewind.reset(t)
  }

  // Restores the state after `tick`, runs `install` on it and simulates the ticks since again, in the vehicle the player
  // rides now: getting on is not simulated again, so a state kept before the mount (or in another vehicle) is taken
  // with the vehicle the player is in, and one kept in a vehicle it steers with its simulated state. Off a vehicle
  // since, nothing is.
  rewindTo (tick: number, state: Player, install: (state: Player) => void): void {
    const riding = state.vehicle
    // a teleport not yet run is simulated through by the rewind (it is still reported); a player waiting for the chunks
    // it was teleported to is not moved by one at all
    const teleported = !!state.bedrock?.teleported
    const stale = this.staleTeleport
    if (teleported && stale && this.world.loaded && !this.world.loaded(stale)) return
    // off a vehicle since: the dismount placed the player where no simulation leads, so nothing is simulated again
    if (!riding) {
      for (let t = tick; t < this.rewind.current; t++) if (this.rewind.snapshots.get(t)?.vehicle) return
    }
    // corrections filed since the last rewind move it back to the oldest of them still in the history (or the tick just
    // older)
    const oldest = Math.max(this.rewind.oldest, this.rewind.current - this.rewind.history)
    const from = Math.min(tick, ...[...this.flagged].filter(t => t >= oldest - 1))
    this.flagged.clear()
    this.attributesFiled = false
    // what an earlier rewind since the last tick raised still stands
    this.carried = new Set(state.bedrock?.carriedActions)
    this.rewind.rewindTo(tick, state, s => {
      if (!riding) delete s.vehicle
      // a vehicle the server moves is not simulated again: the rider sits on it where it is now
      else if (!s.vehicle || s.vehicle.id !== riding.id || !riding.predicted) s.vehicle = riding
      install(s)
    }, from)
    const carried = this.carried
    this.carried = undefined
    if (state.bedrock && carried.size) state.bedrock.carriedActions = carried
    for (const t of this.flagCorrections.keys()) if (t < oldest) this.flagCorrections.delete(t)
    if (teleported) state.bedrock!.teleportSimulatedThrough = true
  }

  // A movement correction: installed on the frame after its tick, and every tick since simulated again.
  correct (state: Player, correction: StampedCorrection): void {
    this.rewindTo(correction.tick, state, () => this.physics.applyCorrection(state, correction))
  }

  // A mob effect on the player (its level; 0 when removed). It takes effect on the frame after its stamp (unstamped,
  // on the tick it lands on): a frame already simulated is simulated again with it, and every tick since, when it
  // changes the effect the player has now; a frame to come picks it up when it is simulated. The client counts its
  // duration down itself: it lasts through the tick before that frame plus its duration.
  effect (state: Player, effect: StampedEffect): void {
    const frame = effect.tick > 0 ? effect.tick + 1 : this.rewind.current
    const timed = effect.level > 0 && typeof effect.duration === 'number' && effect.duration >= 0
    const events = this.effects.get(effect.field) || []
    const before = [...events]
    // an add merges into the effect held then: a lower level, or the same level ending no later, leaves it as it is
    if (effect.level > 0) {
      const held = [...events].reverse().find(event => event.frame <= frame)
      const now = effectLevel(events, frame) ?? 0
      if (now > effect.level) return
      const end = timed ? frame - 1 + effect.duration! : undefined
      if (held && now === effect.level && (held.end === undefined || (end !== undefined && held.end >= end))) return
    }
    const at = events.findIndex(event => event.frame > frame)
    events.splice(at < 0 ? events.length : at, 0, { frame, level: effect.level, end: timed ? frame - 1 + effect.duration! : undefined })
    // what came before the history can no longer be simulated again: only the last such event still counts
    while (events.length > 1 && events[1]!.frame <= this.rewind.current - this.rewind.history) events.shift()
    this.effects.set(effect.field, events)
    // it asks for the ticks since its frame to be simulated again only when it changes the effect as it stands now (an
    // effect it adds is absent or at another level, one it removes is still there); a refresh, or the removal of one
    // that ran out, just joins the history, for a later rewind to pick up
    if (effectLevel(before, this.rewind.current) === effect.level) return
    // then the ticks since its frame are simulated again only where it changes the level they had
    for (let t = frame; t < this.rewind.current; t++) {
      if (effectLevel(events, t) === effectLevel(before, t)) continue
      this.rewindTo(frame - 1, state, () => {})
      return
    }
  }

  // A correction of the vehicle the player steers: its position, velocity and ground flag, installed on the frame after
  // its tick, and every tick since simulated again.
  correctVehicle (state: Player, correction: StampedCorrection): void {
    this.rewindTo(correction.tick, state, () => {
      const vehicle = state.vehicle
      if (!vehicle) return
      vehicle.pos.set(f(correction.x), f(correction.y), f(correction.z))
      vehicle.box = undefined
      vehicle.vel.set(f(correction.dx), f(correction.dy), f(correction.dz))
      vehicle.onGround = correction.onGround
    })
  }

  // Whether a vehicle correction is filed: as a player's, against the vehicle of the frame of its tick.
  vehicleCorrectionFiles (state: Player, correction: StampedCorrection): boolean {
    if (!state.vehicle || !state.vehicle.predicted) return false
    const oldest = Math.max(this.rewind.oldest, this.rewind.current - this.rewind.history + 1)
    if (correction.tick < oldest) return false
    const vehicle = this.rewind.snapshots.get(correction.tick)?.vehicle
    if (!vehicle) return true
    const position = { x: f(correction.x), y: f(correction.y), z: f(correction.z) }
    const velocity = { x: f(correction.dx), y: f(correction.dy), z: f(correction.dz) }
    return !!vehicle.onGround !== !!correction.onGround ||
      distanceSquared(position, vehicle.pos) > DIVERGENCE ||
      distanceSquared(velocity, vehicle.vel) > DIVERGENCE
  }

  // A glide boost: when it turns the boost on or off, installed on the frame after its tick and every tick since
  // simulated again; otherwise what is left, aged from its tick, on the history frames since and on the player about
  // to simulate the current tick.
  glideBoost (state: Player, boost: StampedGlideBoost): void {
    const active = boost.duration === -1 || boost.duration > 0
    const held = (state.fireworkRocketDuration || 0) !== 0
    if (boost.tick > 0 && active !== held) {
      this.rewindTo(boost.tick, state, s => { s.fireworkRocketDuration = boost.duration })
      return
    }
    if (boost.tick <= 0) {
      state.fireworkRocketDuration = boost.duration
      return
    }
    for (const [tick, frame] of this.rewind.snapshots) {
      if (tick >= boost.tick) frame.fireworkRocketDuration = agedDuration(boost.duration, tick - boost.tick, GLIDE_BOOST_RATE)
    }
    state.fireworkRocketDuration = agedDuration(boost.duration, this.rewind.current - 1 - boost.tick, GLIDE_BOOST_RATE)
  }

  // A motion the server sets (a knockback): the velocity, installed live; a stamped one is also installed on the frame
  // after its tick (no earlier than the history) and every tick since simulated again.
  motion (state: Player, motion: StampedMotion): void {
    if (motion.tick > 0) this.rewindTo(motion.tick, state, () => this.physics.applyMotion(state, motion))
    else this.physics.applyMotion(state, motion)
  }

  // A movement attribute: installed on the player and on the history frames from its tick, so a later correction
  // re-simulates with it. It does not re-simulate itself; a sprint the player started after its tick keeps the boost,
  // unless the packet changes the speed.
  movementAttribute (state: Player, attribute: StampedAttribute): void {
    // a packet that changes the speed without the boost (the server has not seen the sprint yet) takes the boost off
    const held = state.attributes?.[this.physics.movementSpeedAttribute]
    const sprintStartedSince = (!held || held.base === attribute.walk) && [...this.rewind.snapshots].some(([tick, frame]) => tick > attribute.tick && !!frame.bedrock?.actions?.has('startSprinting'))
    this.physics.setMovementAttribute(state, { base: attribute.walk, current: attribute.current, sprintStartedSince })
    const key = this.physics.movementSpeedAttribute
    const walk = state.attributes![key]
    // an unstamped one is the player's from now on only
    if (!(attribute.tick > 0)) return
    for (const [tick, frame] of this.rewind.snapshots) {
      if (tick >= attribute.tick) frame.attributes = { ...(frame.attributes || {}), [key]: { ...walk } }
    }
  }

  // The liquid movement attributes: installed on the player and on the history frames from their tick, like the
  // movement attribute.
  liquidAttributes (state: Player, liquids: StampedLiquidAttributes): void {
    const install = (target: Player): void => {
      const attributes = target.attributes = { ...(target.attributes || {}) }
      for (const [name, value] of Object.entries(liquids.values)) attributes[name] = { base: value, current: value }
    }
    install(state)
    if (!(liquids.tick > 0)) return
    for (const [tick, frame] of this.rewind.snapshots) if (tick >= liquids.tick) install(frame)
  }

  // Stamped attributes are filed on the frame of their tick when the movement speed they carry differs from it, or
  // whatever they carry once one has been filed since the last rewind: the next rewind simulates again from there.
  fileAttributes (tick: number, attribute: StampedAttribute | null): void {
    const frame = this.rewind.snapshots.get(tick)
    if (!frame || tick < this.rewind.oldest) return
    if (!this.attributesFiled) {
      const held = frame.attributes?.[this.physics.movementSpeedAttribute]
      if (!attribute || (held && held.base === attribute.walk && held.current === attribute.current)) return
    }
    this.flagged.add(tick)
    this.attributesFiled = true
  }

  // Restated actor flags: compared with the history frame of their tick (a stamped one older than the history with the
  // oldest frame the history keeps, no earlier than the client's history) and written to the player only where they
  // differ, so the player's own later changes stand. What is written also goes
  // into the frame of the tick before the current one: that frame stands for the start of the current tick, after the
  // packets that landed between the ticks, which is what a later restatement is compared with.
  actorFlags (state: Player, flags: StampedFlags): void {
    const oldest = flags.tick > 0 ? this.rewind.current - this.rewind.history : -Infinity
    const at = Math.max(flags.tick, this.ringOldest, oldest)
    const frame = this.rewind.snapshots.get(at)
    const changed: ActorFlags = {}
    for (const name of [...ACTOR_FLAG_NAMES, 'height'] as const) {
      const value = flags[name]
      if (value === undefined) continue
      const sent = this.serverFlags[name]
      this.serverFlags[name] = value
      // with no frame to compare with, the glide (which the client starts itself) is taken only when the server changed
      // it since its last restatement
      if (name === 'gliding' && !frame && sent === value) continue
      // the push toward free space is not among the flags the client weighs against its history: it is taken as sent
      if (name === 'pushTowardsClosestSpace') {
        (changed as Record<string, unknown>)[name] = value
        continue
      }
      const known = frame && frame.bedrock ? frame.bedrock[name === 'height' ? 'poseHeight' : name] : undefined
      if (frame && known === value) continue
      ;(changed as Record<string, unknown>)[name] = value
    }
    // the climbable-block flag, for the next scaffolding climb: weighed against the one the frame's next climb reads (set
    // by a restatement since, else by the climb's own check, which finds it set), and written only where it differs
    const view = this.rewind.snapshots.get(this.rewind.current - 1)
    if (flags.inAscendable !== undefined && state.bedrock && (!frame || (frame.bedrock?.ascendRestated ?? frame.bedrock?.ascendable ?? true) !== flags.inAscendable)) {
      state.bedrock.ascendRestated = flags.inAscendable
      if (view?.bedrock) view.bedrock.ascendRestated = flags.inAscendable
    }
    // the scaffolding flags, for the next sneak descent, weighed and written the same way
    if (flags.inScaffolding !== undefined && state.bedrock && (!frame || (frame.bedrock?.scaffoldRestated ?? true) !== flags.inScaffolding)) {
      state.bedrock.scaffoldRestated = flags.inScaffolding
      if (view?.bedrock) view.bedrock.scaffoldRestated = flags.inScaffolding
    }
    if (!Object.keys(changed).length) return
    // one that differed from the history is filed on its frame too: the next rewind simulates again from there. The
    // sprint is the client's own: a restated one is taken, but not filed (a rewind does not undo a sprint it started)
    const filed = Object.fromEntries(Object.entries(changed).filter(([name]) => name !== 'pushTowardsClosestSpace' && name !== 'sprinting')) as ActorFlags
    // one stamped before the history a far teleport started is taken, but not filed: no rewind reaches behind the teleport
    const beforeTeleport = flags.tick < this.ringOldest && at === this.ringOldest
    if (frame && !beforeTeleport && Object.keys(filed).length) {
      this.flagCorrections.set(at, { ...this.flagCorrections.get(at), ...filed })
      this.flagged.add(at)
    }
    this.physics.setActorFlags(state, changed)
    // the tick's frame is taken after the packets that land between ticks: a later restatement compares with this
    if (view) this.physics.setActorFlags(view, changed)
    // one weighed against the teleport's frame is written there too: the next restatement from before the teleport is
    // weighed against what this one set
    if (frame && beforeTeleport && frame !== view) this.physics.setActorFlags(frame, changed)
  }

  // Whether a correction is filed: one stamped before the history is refused, one that agrees with the frame of its
  // tick (the ground flag, and the position and velocity within 1e-5 squared) is dropped, and one with no frame is
  // filed.
  correctionFiles (correction: StampedCorrection): boolean {
    const oldest = Math.max(this.rewind.oldest, this.rewind.current - this.rewind.history)
    if (correction.tick < oldest) return false
    const frame = this.rewind.snapshots.get(correction.tick)
    if (!frame) return true
    const eye = f(this.eyeHeight)
    const position = { x: f(correction.x), y: f(f(correction.y) - eye), z: f(correction.z) }
    const velocity = { x: f(correction.dx), y: f(correction.dy), z: f(correction.dz) }
    return !!frame.onGround !== !!correction.onGround ||
      distanceSquared(position, frame.pos) > DIVERGENCE ||
      distanceSquared(velocity, frame.vel) > DIVERGENCE
  }

  // ---- packets -----------------------------------------------------------------------------------------------------

  // A packet as bedrock-protocol decodes it. The local player's movement packets are scheduled for the next tick and
  // return true; anything else returns false.
  handlePacket (name: string, params: Record<string, any>): boolean {
    switch (name) {
      case 'start_game':
        this.localRuntimeId = params.runtime_entity_id
        this.localUniqueId = params.entity_id ?? null
        if (Number.isSafeInteger(params.rewind_history_size)) this.rewind.history = sanitizeHistorySize(params.rewind_history_size)
        this.ownGameType = gameTypeName(params.player_gamemode)
        this.worldGameType = gameTypeName(params.world_gamemode)
        return true
      // the player's own game type changes only by this packet; the world's by the next
      case 'set_player_game_type':
        this.ownGameType = gameTypeName(params.gamemode)
        return true
      case 'set_default_game_type':
        this.worldGameType = gameTypeName(params.gamemode)
        return true
      // the one the server sends a /gamemode with changes nothing for the local player: the client does not find its
      // own entity by the unique id it names, and keeps the game type it had (a player switched to creative this way
      // still hovers as the world's survival player does)
      case 'update_player_game_type':
        return this.localUniqueId !== null && sameId(params.player_unique_id, this.localUniqueId)
      case 'move_player': {
        if (!sameId(params.runtime_id, this.localRuntimeId)) return false
        const mode = typeof params.mode === 'number' ? params.mode : MoveMode[params.mode as keyof typeof MoveMode]
        const teleport: Teleport = { x: params.position.x, y: params.position.y, z: params.position.z, pitch: params.pitch, yaw: params.yaw, headYaw: params.head_yaw, mode, onGround: !!params.on_ground }
        const stamp = Number(params.tick || 0)
        this.schedule(state => {
          // one stamped before the client's history moves the player but leaves the history as it is, so a correction
          // behind it still simulates the ticks since again (through the teleport)
          if (stamp > 0 && stamp < this.rewind.current - this.rewind.history) {
            this.physics.handleTeleport(state, teleport)
            this.staleTeleport = teleport
            return
          }
          this.staleTeleport = undefined
          this.teleport(state, this.rewind.current, teleport)
        })
        return true
      }
      case 'correct_player_move_prediction': {
        const vehicle = params.prediction_type === 'vehicle' || params.prediction_type === 1
        if (!vehicle && params.prediction_type !== undefined && params.prediction_type !== 'player' && params.prediction_type !== 0) return false
        const correction: StampedCorrection = { tick: Number(params.tick), x: params.position.x, y: params.position.y, z: params.position.z, dx: params.delta.x, dy: params.delta.y, dz: params.delta.z, onGround: !!params.on_ground }
        if (vehicle) this.schedule(state => { if (this.vehicleCorrectionFiles(state, correction)) this.correctVehicle(state, correction) })
        else this.schedule(state => { if (this.correctionFiles(correction)) this.correct(state, correction) })
        return true
      }
      case 'set_entity_motion': {
        if (!sameId(params.runtime_entity_id, this.localRuntimeId)) return false
        const motion: StampedMotion = { tick: Number(params.tick || 0), x: params.velocity.x, y: params.velocity.y, z: params.velocity.z }
        this.schedule(state => this.motion(state, motion))
        return true
      }
      case 'update_attributes': {
        if (!sameId(params.runtime_entity_id, this.localRuntimeId)) return false
        const attribute = movementAttribute(params)
        const liquids = liquidAttributes(params)
        const tick = Number(params.tick || 0)
        if (tick > 0) this.schedule(() => this.fileAttributes(tick, attribute))
        if (liquids) this.schedule(state => this.liquidAttributes(state, liquids))
        if (!attribute) return tick > 0 || !!liquids
        // attributes received together are read at once: the last is the one that applies
        const entry = { attribute }
        this.pendingAttribute = entry
        this.schedule(state => {
          if (this.pendingAttribute !== entry) return
          this.pendingAttribute = null
          this.movementAttribute(state, attribute)
        })
        return true
      }
      case 'mob_effect': {
        if (!sameId(params.runtime_entity_id, this.localRuntimeId)) return false
        const field = EFFECT_FIELDS[params.effect_id]
        if (!field) return false
        const effect: StampedEffect = { tick: Number(params.tick || 0), field, level: params.event_id === 'remove' || params.event_id === 3 ? 0 : params.amplifier + 1, duration: params.duration }
        this.schedule(state => this.effect(state, effect))
        return true
      }
      case 'movement_effect': {
        if (!sameId(params.runtime_id, this.localRuntimeId)) return false
        if (params.effect_type !== 'GLIDE_BOOST' && params.effect_type !== 0) return false
        const boost: StampedGlideBoost = { tick: Number(params.tick || 0), duration: params.effect_duration >= -1 ? params.effect_duration : 0 }
        this.schedule(state => this.glideBoost(state, boost))
        return true
      }
      case 'set_entity_data': {
        if (!sameId(params.runtime_entity_id, this.localRuntimeId)) return false
        const flags = restatedFlags(params)
        if (!flags) return false
        this.schedule(state => this.actorFlags(state, flags))
        return true
      }
      default:
        return false
    }
  }
}

// The movement attribute of an update_attributes packet: `walk` the value without the sprint boost (the default plus
// the additive modifiers, e.g. the powder snow freeze), `current` the server's value.
export function movementAttribute (params: Record<string, any>): StampedAttribute | null {
  const entry = (params.attributes || []).find((a: { name: string }) => a.name === 'minecraft:movement')
  if (!entry) return null
  let additive = 0
  for (const modifier of entry.modifiers || []) {
    const operation = typeof modifier.operation === 'number' ? modifier.operation : ({ addition: 0 } as Record<string, number>)[modifier.operation]
    // an addition to the value (operand 2; a protocol without operands has only those), not to the bounds
    if (operation === 0 && (modifier.operand === undefined || modifier.operand === 2)) additive = f(additive + f(modifier.amount))
  }
  return { tick: Number(params.tick), walk: f(f(entry.default) + additive), current: f(entry.current) }
}

// The liquid movement attributes of an update_attributes packet, by name: their current values (vanilla keeps 0.02).
export function liquidAttributes (params: Record<string, any>): StampedLiquidAttributes | null {
  const values: Record<string, number> = {}
  for (const entry of params.attributes || []) {
    if (entry.name === UNDERWATER_MOVEMENT_ATTRIBUTE || entry.name === LAVA_MOVEMENT_ATTRIBUTE) values[entry.name] = f(entry.current)
  }
  return Object.keys(values).length ? { tick: Number(params.tick || 0), values } : null
}

// The game modes the engine tells apart; any other is left to the caller.
const GAME_MODES = new Set(['survival', 'creative', 'adventure', 'spectator'])
// The game types by their number on the wire.
const GAME_TYPE_NAMES: Readonly<Record<number, string>> = { 0: 'survival', 1: 'creative', 2: 'adventure', 5: 'default', 6: 'spectator' }

// A game type's name, as a packet carries it (a name or its number; the fallback is the default).
export function gameTypeName (value: unknown): string | undefined {
  if (typeof value === 'number') return GAME_TYPE_NAMES[value]
  if (value === 'fallback') return 'default'
  return typeof value === 'string' ? value : undefined
}

const FLAGS_WORD = ['sneaking', 'sprinting', 'gliding', 'swimming', 'spinning'] as const
const EXTENDED_FLAGS_WORD = ['crawling', 'pushTowardsClosestSpace'] as const
// The flags' names in a decoded flags word.
const WIRE_NAMES: Readonly<Record<string, string>> = { pushTowardsClosestSpace: 'push_towards_closest_space', spinning: 'spin_attack' }
// The extended word's bits: where a decoded word carries its raw value, the flags are read from it (a decoder's names
// for this word can be a bit off).
const EXTENDED_BITS: Readonly<Record<string, number>> = { crawling: 50, pushTowardsClosestSpace: 45 }
// The extended word's bit of the climbable block the player is in.
const IN_ASCENDABLE_BIT = 35
// The extended word's bits of the scaffolding the player is in, and of the one under it (the next bit).
const IN_SCAFFOLDING_BIT = 5

// The raw 64-bit word of a decoded flags word, where it carries one.
function rawWord (value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return BigInt.asUintN(64, value)
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)._value : undefined
  return typeof raw === 'string' || typeof raw === 'bigint' || typeof raw === 'number' ? BigInt.asUintN(64, BigInt(raw)) : undefined
}

// A named flag of a decoded flags word: an object of booleans or a list of set names.
export function flagValue (value: unknown, name: string): boolean | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return name in value ? !!(value as Record<string, unknown>)[name] : false
  if (Array.isArray(value)) return value.includes(name)
  return undefined
}

// The actor flags a set_entity_data packet restates, and the box height it sends with a pose; null when neither.
export function restatedFlags (params: Record<string, any>): StampedFlags | null {
  const out: StampedFlags = { tick: Number(params.tick) }
  let found = false
  for (const item of params.metadata || []) {
    if (item.key === 'flags' || item.key === 'flags_extended') {
      const raw = item.key === 'flags_extended' ? rawWord(item.value) : undefined
      if (raw !== undefined) out.inAscendable = ((raw >> BigInt(IN_ASCENDABLE_BIT)) & 1n) === 1n
      if (raw !== undefined) out.inScaffolding = ((raw >> BigInt(IN_SCAFFOLDING_BIT)) & 3n) !== 0n
      for (const name of item.key === 'flags' ? FLAGS_WORD : EXTENDED_FLAGS_WORD) {
        const on = raw !== undefined ? ((raw >> BigInt(EXTENDED_BITS[name]!)) & 1n) === 1n : flagValue(item.value, WIRE_NAMES[name] || name)
        if (on !== undefined) {
          out[name] = on
          found = true
        }
      }
    } else if (item.key === 'boundingbox_height' && typeof item.value === 'number') {
      out.height = item.value
      found = true
    }
  }
  return found ? out : null
}
