// The movement history the client keeps: the inputs of the last few ticks and the state after each. A server update
// stamped for an earlier tick is installed there and the ticks since are simulated again with the inputs they had,
// so a packet that arrives a few ticks late lands where the server meant it.
//
//   const rewind = new BedrockRewind({ step: (state, frame) => { ...apply frame's inputs; physics.simulatePlayer(state, world) } })
//   // every tick: rewind.push(frame); step(state, frame); rewind.snapshot(frame.t, state)
//   // a correction stamped for tick T: rewind.rewindTo(T, state, () => physics.applyCorrection(state, correction))
import { Vec3 } from 'vec3'
import { f } from '../math/float.ts'
import { pitchOf, wrapDegrees, yawOf, type Rotated } from '../math/rotation.ts'

// A deep copy: vectors, anything with clone(), sets, maps, arrays and plain objects.
export function cloneValue<T> (value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Vec3) return new Vec3(value.x, value.y, value.z) as T
  const cloneable = value as { clone?: () => T }
  if (typeof cloneable.clone === 'function') return cloneable.clone()
  if (value instanceof Set) return new Set([...value].map(cloneValue)) as T
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, cloneValue(v)])) as T
  if (Array.isArray(value)) return value.map(cloneValue) as T
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = cloneValue(v)
  return out as T
}

// A deep copy of a player state.
export function cloneState<T> (state: T): T { return cloneValue(state) }

// One tick's inputs, by tick.
export interface Frame { t: number, [input: string]: unknown }

// The rotation a frame carries.
const ROTATION = ['yaw', 'pitch', 'bedrockYaw', 'bedrockPitch']

// A frame without its rotation.
function withoutRotation (frame: Frame): Frame {
  const out: Frame = { ...frame }
  for (const key of ROTATION) delete out[key]
  return out
}

// Whether a frame carries a rotation.
function rotated (frame: Frame): boolean {
  return typeof frame.yaw === 'number' || typeof frame.bedrockYaw === 'number'
}

// A frame with a rotation in degrees, in the form it carries its own.
function withRotation (frame: Frame, yaw: number, pitch: number): Frame {
  if (typeof frame.bedrockYaw === 'number') return { ...frame, bedrockYaw: yaw, bedrockPitch: pitch }
  return { ...frame, yaw: Math.PI - yaw * Math.PI / 180, pitch: -pitch * Math.PI / 180 }
}

// A change of the view smaller than this (pitch and yaw squared, degrees) is no turn: the client does not keep it.
const TURN_THRESHOLD = f(0.001)

// The frame a tick after the first simulated again runs with: its turn (the change from the frame before) added to the
// rotation the tick before ran with, the yaw wrapped and the pitch within +-90, or that rotation as it is when the turn
// is below the threshold. While that rotation is still the one recorded, the recorded one is taken as it is.
function replayedFrame (frame: Frame, before: Frame | undefined, state: Rotated): Frame {
  if (!before || !rotated(frame) || !rotated(before)) return frame
  const turnYaw = f(yawOf(frame as Rotated) - yawOf(before as Rotated))
  const turnPitch = f(pitchOf(frame as Rotated) - pitchOf(before as Rotated))
  if (!(f(f(turnYaw * turnYaw) + f(turnPitch * turnPitch)) > TURN_THRESHOLD)) return withoutRotation(frame)
  const yaw = yawOf(state)
  const pitch = pitchOf(state)
  if (yaw === yawOf(before as Rotated) && pitch === pitchOf(before as Rotated)) return frame
  let turned = f(yaw + turnYaw)
  if (turned < -180 || turned >= 180) turned = wrapDegrees(turned)
  return withRotation(frame, turned, Math.min(90, Math.max(-90, f(pitch + turnPitch))))
}

// Simulates one past tick again from its frame.
export type Step<S> = (state: S, frame: Frame) => void

// The history of the last ticks: their frames and the state after each, and the re-simulation from a corrected tick.
export class BedrockRewind<S extends object = Record<string, unknown>> {
  step: Step<S> | undefined
  history: number
  // the frames kept, oldest first, and the state after each tick
  frames: Frame[] = []
  snapshots = new Map<number, S>()
  // the state one tick older than the history, which a rewind from a correction filed there still starts from
  edge: { tick: number, state: S } | undefined
  // the history starts over at a teleport; the tick being simulated
  oldest = -Infinity
  current = -Infinity

  constructor ({ step, history = 16 }: { step?: Step<S>, history?: number } = {}) {
    this.step = step
    this.history = history
  }

  // Files this tick's frame before it is simulated.
  push (frame: Frame): void {
    this.current = frame.t
    this.frames.push(frame)
    if (this.frames.length > this.history + 1) this.frames.shift()
    for (const [tick, state] of this.snapshots) {
      if (tick >= frame.t - this.history) continue
      if (tick === frame.t - this.history - 1) this.edge = { tick, state }
      this.snapshots.delete(tick)
    }
  }

  // Remembers the state after simulating `tick`.
  snapshot (tick: number, state: S): void {
    this.snapshots.set(tick, cloneState(state))
  }

  // Forgets the frames before `tick`.
  reset (tick: number): void {
    this.oldest = tick
  }

  // Restores the state after `tick` (no earlier than the history kept), runs `install(state)` on it, and simulates
  // every frame after it up to the current tick again. Without a state kept for the tick, it is installed on the
  // live state alone: the frames since were simulated into that state already. A state is kept with the rotation the
  // view had at the end of its tick, which is the next tick's; nothing moves the view while the ticks are simulated
  // again, so the ticks after the first take only their turns (replayedFrame).
  // `from`: an earlier tick to simulate again from (a correction filed there before; the one just older than the
  // history too), the install still made after `tick`.
  rewindTo (tick: number, state: S, install: (state: S) => void, from = tick): void {
    const oldest = Math.max(this.oldest, this.current - this.history)
    tick = Math.max(tick, oldest)
    const edge = this.edge && from < oldest && from === this.edge.tick && from >= this.oldest ? this.edge : undefined
    from = edge ? edge.tick : Math.min(Math.max(from, oldest), tick)
    const saved = edge ? edge.state : this.snapshots.get(from)
    if (!saved) {
      install(state)
      return
    }
    Object.assign(state, cloneState(saved))
    let installed = from === tick
    if (installed) install(state)
    let first = true
    let last: Frame | undefined
    for (const past of this.frames) {
      const before = last
      last = past
      if (past.t <= from || past.t >= this.current) continue
      this.step!(state, first ? past : replayedFrame(past, before, state as Rotated))
      first = false
      this.snapshot(past.t, state)
      if (past.t === tick) {
        install(state)
        installed = true
      }
    }
    if (!installed) install(state)
  }
}
