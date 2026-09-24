import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { BedrockRewind, cloneState, cloneValue, type Frame } from '../../../../lib/bedrock/network/rewind.ts'

describe('bedrock network/rewind', () => {
  it('deep-copies vectors, cloneables, sets, maps, arrays and objects', () => {
    const value = { v: new Vec3(1, 2, 3), box: new Box(0, 0, 0, 1, 1, 1), set: new Set([{ a: 1 }]), map: new Map([['k', { b: 2 }]]), list: [{ c: 3 }], n: null, s: 'x' }
    const copy = cloneValue(value)
    assert.deepStrictEqual(copy, value)
    assert.notStrictEqual(copy.v, value.v)
    assert.ok(copy.v instanceof Vec3)
    assert.ok(copy.box instanceof Box)
    assert.notStrictEqual([...copy.set][0], [...value.set][0])
    assert.notStrictEqual(copy.map.get('k'), value.map.get('k'))
    assert.notStrictEqual(copy.list[0], value.list[0])
    assert.strictEqual(cloneValue(5), 5)
    assert.deepStrictEqual(cloneState({ a: [1] }), { a: [1] })
  })

  it('keeps the last `history` frames and the snapshots within them', () => {
    const rewind = new BedrockRewind<{ n: number }>({ history: 2 })
    for (let t = 1; t <= 5; t++) {
      rewind.push({ t })
      rewind.snapshot(t, { n: t })
    }
    assert.deepStrictEqual(rewind.frames.map(frame => frame.t), [4, 5])
    assert.deepStrictEqual([...rewind.snapshots.keys()], [3, 4, 5])
    assert.strictEqual(rewind.current, 5)
    assert.notStrictEqual(rewind.snapshots.get(5), { n: 5 })
  })

  it('rewinds to a tick, installs, and simulates the frames since again', () => {
    const steps: number[] = []
    const rewind = new BedrockRewind<{ n: number }>({ step: (state, frame: Frame) => { steps.push(frame.t); state.n += 10 } })
    const state = { n: 0 }
    for (let t = 1; t <= 4; t++) {
      rewind.push({ t })
      state.n = t
      rewind.snapshot(t, state)
    }
    rewind.rewindTo(2, state, s => { s.n = 100 })
    assert.deepStrictEqual(steps, [3], 'the frames after 2, before the current tick')
    assert.strictEqual(state.n, 110)
    assert.strictEqual(rewind.snapshots.get(3)!.n, 110)
  })

  it('rewinds no earlier than a reset, and without a snapshot installs on the live state', () => {
    const rewind = new BedrockRewind<{ n: number }>({ step: () => {} })
    for (let t = 1; t <= 4; t++) {
      rewind.push({ t })
      rewind.snapshot(t, { n: t })
    }
    rewind.reset(3)
    const state = { n: 0 }
    rewind.rewindTo(1, state, () => {})
    assert.strictEqual(state.n, 3)
    const live = { n: 7 }
    rewind.rewindTo(9, live, () => {})
    assert.strictEqual(live.n, 7)
    assert.strictEqual(new BedrockRewind().history, 16)
  })

  it('rewinds a tick older than the history to the oldest state kept, never replaying onto the live state', () => {
    const steps: number[] = []
    const rewind = new BedrockRewind<{ n: number }>({ history: 2, step: (state, frame: Frame) => { steps.push(frame.t); state.n += 10 } })
    for (let t = 1; t <= 6; t++) {
      rewind.push({ t })
      rewind.snapshot(t, { n: t })
    }
    const state = { n: 60 }
    rewind.rewindTo(1, state, s => { s.n += 100 })
    assert.deepStrictEqual(steps, [5], 'from the oldest state kept (tick 4), the frames since')
    assert.strictEqual(state.n, 4 + 100 + 10)
    rewind.snapshots.delete(4)
    const live = { n: 60 }
    rewind.rewindTo(1, live, s => { s.n += 100 })
    assert.deepStrictEqual([live.n, steps.length], [160, 1], 'no state kept: installed live, nothing replayed')
  })

  it('replays a frame after the first with no turn at the rotation the one before it ran with', () => {
    const ran: Array<Array<number | undefined>> = []
    const rewind = new BedrockRewind<{ yaw: number, pitch: number }>({
      step: (state, frame: Frame) => {
        if (typeof frame.yaw === 'number') state.yaw = frame.yaw
        if (typeof frame.pitch === 'number') state.pitch = frame.pitch
        ran.push([frame.t, state.yaw, state.pitch, frame.bedrockYaw as number | undefined])
      }
    })
    const frames: Frame[] = [
      { t: 1, yaw: 1, pitch: 1 },
      { t: 2, yaw: 2, pitch: 2, turned: false },
      { t: 3, yaw: 3, pitch: 3, bedrockYaw: 3, bedrockPitch: 3, turned: false },
      { t: 4, yaw: 4, pitch: 4, turned: true },
      { t: 5, yaw: 5, pitch: 5 }
    ]
    for (const frame of frames) {
      rewind.push(frame)
      rewind.snapshot(frame.t, { yaw: frame.t, pitch: frame.t })
    }
    rewind.rewindTo(1, { yaw: 0, pitch: 0 }, () => {})
    assert.deepStrictEqual(ran, [[2, 2, 2, undefined], [3, 2, 2, undefined], [4, 4, 4, undefined]], 'the first replayed frame and a turn take their own')
    assert.strictEqual(frames[2]!.yaw, 3, 'the frame kept is left as it is')
  })
})
