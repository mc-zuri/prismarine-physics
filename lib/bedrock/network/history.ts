// The history ring's bookkeeping: which frame a server correction lands on, what it arms, and when the re-simulation
// pass runs. Ticks are BigInt here: they are 64-bit, and two ticks past 2^53 would compare equal as Numbers.
import { cloneValue } from './rewind.ts'

// The largest history window.
export const MAX_HISTORY = 1000

// The history size the server asks for, narrowed to 16 bits (so 65536 is a window of one), zero raised to one, and
// capped at 1000.
export function sanitizeHistorySize (size: number): number {
  if (!Number.isSafeInteger(size)) throw new Error('History size must be a safe integer')
  const narrowed = ((size % 65536) + 65536) % 65536
  return Math.min(narrowed === 0 ? 1 : narrowed, MAX_HISTORY)
}

// A correction filed on the history: the bits it arms, and whatever it carries.
export interface Correction { bits: number, [field: string]: unknown }

// One frame: the state at the start of its tick, the input the tick consumed, the corrections filed against it, and
// whether the pass must replay from here.
export interface HistoryFrame {
  tick: bigint
  snapshot: unknown
  input: unknown
  corrections: Correction[]
  marked: boolean
}

// The history ring: frames by tick, the corrections filed on them, the queue for the tick being simulated, and the bits
// that arm a re-simulation.
export class ActorHistory {
  window: number
  frames: HistoryFrame[] = []
  // corrections for the tick being simulated, waiting for its frame
  queued: Correction[] = []
  pendingBits = 0

  constructor (window: number) {
    if (!Number.isInteger(window) || window < 1 || window > MAX_HISTORY) throw new Error('History window must be 1..1000')
    this.window = window
  }

  get oldestTick (): bigint { return this.frames[0]?.tick ?? 0n }
  get newestTick (): bigint { return this.frames.at(-1)?.tick ?? 0n }
  get (tick: bigint): HistoryFrame | undefined { return this.frames.find(frame => frame.tick === tick) }

  // Pushes the frame of a tick. The queued corrections move onto it (so a pushed frame can arrive marked); a tick
  // that does not follow the newest one starts the ring over, since the pass cannot step over a gap.
  push (tick: bigint, snapshot: unknown, input: unknown): HistoryFrame {
    if (typeof tick !== 'bigint' || tick < 0n) throw new Error('History tick must be a nonnegative bigint')
    const frame: HistoryFrame = { tick, snapshot: cloneValue(snapshot), input: cloneValue(input), corrections: this.queued, marked: this.queued.length > 0 }
    for (const correction of this.queued) this.pendingBits |= correction.bits
    this.queued = []
    if (this.frames.length && tick !== this.newestTick + 1n) this.frames = []
    this.frames.push(frame)
    while (this.frames.length > this.window) this.frames.shift()
    return frame
  }

  // Files a correction on the frame of `tick`, arming `pendingBits` (the correction's own by default).
  attach (tick: bigint, correction: Correction, pendingBits = correction.bits): boolean {
    const frame = this.get(tick)
    if (!frame) return false
    frame.corrections.push(cloneValue(correction))
    this.pendingBits |= pendingBits
    return true
  }

  mark (tick: bigint): void {
    const frame = this.get(tick)
    if (frame) frame.marked = true
  }

  queue (correction: Correction): void { this.queued.push(cloneValue(correction)) }

  clear (): void {
    this.frames = []
    this.queued = []
    this.pendingBits = 0
  }

  // The end of a pass clears the marks and the pending bits; the corrections stay on their frames.
  complete (): void {
    this.pendingBits = 0
    for (const frame of this.frames) frame.marked = false
  }

  // The tick a pass starts from, or undefined when nothing arms one. Only bit 0 (a position correction) arms it; an
  // attribute or an actor flag rides its frame until a position correction replays through it.
  anchor (): bigint | undefined {
    if ((this.pendingBits & 1) === 0) return undefined
    const frame = this.frames.find(one => one.marked)
    return frame ? frame.tick : undefined
  }
}

// How the packet's handler reaches the ring: a listener refuses a tick older than the ring, a direct route clamps it
// to the oldest frame.
export type Route = 'listener' | 'direct'

// Files a correction stamped `packetTick`. It belongs to the frame after its tick (it says what the state was at the
// end of that tick); when that frame is not pushed yet, it waits in the queue. Returns 'attached', 'queued', or null
// when refused (tick 0, an empty ring, a tick the ring does not hold).
export function fileCorrection (history: ActorHistory | null | undefined, packetTick: bigint, correction: Correction, route: Route = 'listener'): 'attached' | 'queued' | null {
  if (typeof packetTick !== 'bigint') throw new Error('A correction files against a bigint tick')
  if (packetTick === 0n) return null
  if (!history || !history.frames.length) return null
  if (route === 'listener' && packetTick < history.oldestTick) return null
  const target = route === 'direct' && packetTick < history.oldestTick ? history.oldestTick : packetTick
  if (!history.get(target)) return null
  const frame = target + 1n
  if (history.get(frame)) {
    history.attach(frame, correction)
    history.mark(frame)
    return 'attached'
  }
  history.queue(correction)
  return 'queued'
}
