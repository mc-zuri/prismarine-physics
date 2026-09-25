// The movement history the client keeps: the inputs of the last few ticks and the state after each. A server update
// stamped for an earlier tick is installed there and the ticks since are simulated again with the inputs they had,
// so a packet that arrives a few ticks late lands where the server meant it.
//
//   const rewind = new BedrockRewind({ step: (state, frame) => { ...apply frame's inputs; physics.simulatePlayer(state, world) } })
//   // every tick: rewind.push(frame); step(state, frame); rewind.snapshot(frame.t, state)
//   // a correction stamped for tick T: rewind.rewindTo(T, state, () => physics.applyCorrection(state, correction))
import { Vec3 } from 'vec3'

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

// One tick's inputs, by tick. `turned: false` says no turn input reached the tick's move.
export interface Frame { t: number, turned?: boolean | undefined, [input: string]: unknown }

// The rotation a frame carries.
const ROTATION = ['yaw', 'pitch', 'bedrockYaw', 'bedrockPitch']

// A frame without its rotation.
function withoutRotation (frame: Frame): Frame {
  const out: Frame = { ...frame }
  for (const key of ROTATION) delete out[key]
  return out
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
  // again, so a frame after the first that had no turn keeps the rotation the one before it ran with.
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
    for (const past of this.frames) {
      if (past.t <= from || past.t >= this.current) continue
      this.step!(state, !first && past.turned === false ? withoutRotation(past) : past)
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
