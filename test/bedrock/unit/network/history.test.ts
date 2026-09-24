import assert from 'node:assert'
import { ActorHistory, fileCorrection, MAX_HISTORY, sanitizeHistorySize } from '../../../../lib/bedrock/network/history.ts'

const correction = (bits = 1) => ({ bits, tag: 'c' })

function ring (from: bigint, to: bigint, window = 16): ActorHistory {
  const history = new ActorHistory(window)
  for (let t = from; t <= to; t++) history.push(t, { t }, { t })
  return history
}

describe('bedrock network/history', () => {
  it('sanitises the requested history size to 16 bits, at least 1, at most 1000', () => {
    assert.strictEqual(sanitizeHistorySize(40), 40)
    assert.strictEqual(sanitizeHistorySize(0), 1)
    assert.strictEqual(sanitizeHistorySize(65536), 1)
    assert.strictEqual(sanitizeHistorySize(65537), 1)
    assert.strictEqual(sanitizeHistorySize(-1), MAX_HISTORY)
    assert.strictEqual(sanitizeHistorySize(5000), MAX_HISTORY)
    assert.throws(() => sanitizeHistorySize(1.5), /safe integer/)
  })

  it('takes a window of 1..1000 frames', () => {
    for (const bad of [0, 1001, 2.5]) assert.throws(() => new ActorHistory(bad), /1\.\.1000/)
    const history = new ActorHistory(2)
    assert.deepStrictEqual([history.oldestTick, history.newestTick], [0n, 0n])
  })

  it('pushes consecutive frames, dropping the oldest beyond the window, and restarts at a gap', () => {
    const history = ring(1n, 5n, 3)
    assert.deepStrictEqual(history.frames.map(frame => frame.tick), [3n, 4n, 5n])
    assert.deepStrictEqual([history.oldestTick, history.newestTick], [3n, 5n])
    history.push(9n, {}, {})
    assert.deepStrictEqual(history.frames.map(frame => frame.tick), [9n])
    assert.throws(() => history.push(-1n, {}, {}), /nonnegative bigint/)
    assert.throws(() => history.push(3 as unknown as bigint, {}, {}), /nonnegative bigint/)
  })

  it('copies the snapshot and the input it is given', () => {
    const snapshot = { pos: { x: 1 } }
    const frame = new ActorHistory(2).push(1n, snapshot, { k: 1 })
    snapshot.pos.x = 2
    assert.deepStrictEqual(frame.snapshot, { pos: { x: 1 } })
  })

  it('files a correction on the frame after its tick, marking it and arming the bits', () => {
    const history = ring(1n, 5n)
    assert.strictEqual(fileCorrection(history, 3n, correction()), 'attached')
    assert.deepStrictEqual([history.get(4n)!.marked, history.get(4n)!.corrections.length, history.pendingBits], [true, 1, 1])
    assert.strictEqual(history.anchor(), 4n)
  })

  it('queues a correction for the tick being simulated until its frame is pushed', () => {
    const history = ring(1n, 5n)
    assert.strictEqual(fileCorrection(history, 5n, correction(2)), 'queued')
    assert.strictEqual(history.pendingBits, 0)
    const frame = history.push(6n, {}, {})
    assert.deepStrictEqual([frame.marked, frame.corrections.length, history.pendingBits], [true, 1, 2])
    assert.strictEqual(history.anchor(), undefined, 'only bit 0 arms a pass')
  })

  it('refuses tick 0, an empty ring, and a tick the ring does not hold', () => {
    const history = ring(10n, 12n)
    assert.strictEqual(fileCorrection(history, 0n, correction()), null)
    assert.strictEqual(fileCorrection(new ActorHistory(4), 3n, correction()), null)
    assert.strictEqual(fileCorrection(null, 3n, correction()), null)
    assert.strictEqual(fileCorrection(history, 20n, correction()), null)
    assert.throws(() => fileCorrection(history, 3 as unknown as bigint, correction()), /bigint tick/)
  })

  it('refuses a stale tick on the listener route and clamps it to the oldest frame on the direct route', () => {
    const history = ring(10n, 12n)
    assert.strictEqual(fileCorrection(history, 5n, correction(), 'listener'), null)
    assert.strictEqual(fileCorrection(history, 5n, correction(), 'direct'), 'attached')
    assert.strictEqual(history.get(11n)!.marked, true)
  })

  it('attaches with the caller\'s bits, and ignores a frame it does not hold', () => {
    const history = ring(1n, 3n)
    assert.strictEqual(history.attach(2n, correction(1), 4), true)
    assert.strictEqual(history.pendingBits, 4)
    assert.strictEqual(history.attach(9n, correction()), false)
    history.mark(9n)
    assert.ok(history.frames.every(frame => !frame.marked))
  })

  it('completes a pass: marks and bits cleared, corrections kept', () => {
    const history = ring(1n, 5n)
    fileCorrection(history, 2n, correction())
    history.complete()
    assert.deepStrictEqual([history.pendingBits, history.anchor(), history.get(3n)!.corrections.length], [0, undefined, 1])
    history.pendingBits = 1
    assert.strictEqual(history.anchor(), undefined, 'armed with no marked frame')
  })

  it('clears everything', () => {
    const history = ring(1n, 3n)
    history.queue(correction())
    history.pendingBits = 3
    history.clear()
    assert.deepStrictEqual([history.frames.length, history.queued.length, history.pendingBits], [0, 0, 0])
  })
})
