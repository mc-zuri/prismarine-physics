import assert from 'node:assert'
import { Vec3 } from 'vec3'
import { Box } from '../../../../lib/bedrock/math/box.ts'
import { BedrockRewind, cloneState, cloneValue, type Frame } from '../../../../lib/bedrock/network/rewind.ts'

const f = Math.fround

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

  it('keeps the frames and snapshots of the last `history` ticks, and the state and frame just older', () => {
    const rewind = new BedrockRewind<{ n: number }>({ history: 2 })
    for (let t = 1; t <= 5; t++) {
      rewind.push({ t })
      rewind.snapshot(t, { n: t })
    }
    assert.deepStrictEqual(rewind.frames.map(frame => frame.t), [3, 4, 5])
    assert.deepStrictEqual([...rewind.snapshots.keys()], [3, 4, 5])
    assert.deepStrictEqual(rewind.edge, { tick: 2, state: { n: 2 } })
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

  it('replays the ticks after the first with their turns only, on the rotation the tick before ran with', () => {
    const deg = (yaw: number): number => Math.PI - yaw * Math.PI / 180
    const pit = (pitch: number): number => -pitch * Math.PI / 180
    const ran: number[][] = []
    const rewind = new BedrockRewind<{ yaw: number, pitch: number, bedrockYaw?: number, bedrockPitch?: number }>({
      step: (state, frame: Frame) => {
        if (typeof frame.yaw === 'number') state.yaw = frame.yaw
        if (typeof frame.pitch === 'number') state.pitch = frame.pitch
        if (typeof frame.bedrockYaw === 'number') state.bedrockYaw = frame.bedrockYaw
        if (typeof frame.bedrockPitch === 'number') state.bedrockPitch = frame.bedrockPitch
        ran.push([frame.t, f((Math.PI - state.yaw) * 180 / Math.PI), f(-state.pitch * 180 / Math.PI)])
      }
    })
    // recorded: 10 (jittered to 10.0001 on tick 3, no turn), a turn of +5 yaw and -95 pitch on tick 4, one of +200 yaw
    // on tick 5
    const frames: Frame[] = [
      { t: 1, yaw: deg(0), pitch: pit(0) },
      { t: 2, yaw: deg(10), pitch: pit(0) },
      { t: 3, yaw: deg(f(10.0001)), pitch: pit(0) },
      { t: 4, yaw: deg(f(15.0001)), pitch: pit(-95) },
      { t: 5, yaw: deg(f(215.0001)), pitch: pit(-95) },
      { t: 6 }
    ]
    for (const frame of frames) {
      rewind.push(frame)
      rewind.snapshot(frame.t, { yaw: frame.yaw as number ?? 0, pitch: frame.pitch as number ?? 0 })
    }
    rewind.rewindTo(1, { yaw: 0, pitch: 0 }, () => {})
    assert.deepStrictEqual(ran.map(r => r[0]), [2, 3, 4, 5])
    assert.deepStrictEqual(ran[0]!.slice(1), [10, 0], 'the first its own')
    assert.deepStrictEqual(ran[1]!.slice(1), [10, 0], 'a change below the threshold is no turn')
    assert.deepStrictEqual(ran[2]!.slice(1), [f(10 + f(f(15.0001) - f(10.0001))), -90], 'the turn added, the pitch within 90')
    assert.deepStrictEqual(ran[3]!.slice(1), [f(f(ran[2]![1]! + 200) - 360), -90], 'the yaw wrapped')
    // while the rotation simulated again is the recorded one, a turn takes the recorded rotation as it is
    ran.length = 0
    rewind.rewindTo(3, { yaw: 0, pitch: 0 }, () => {})
    assert.deepStrictEqual(ran.map(r => r.slice(1)), [[f(15.0001), -95], [f(215.0001), -95]])
    // a frame carrying Bedrock degrees gets them back in degrees
    const inDegrees = new BedrockRewind<{ bedrockYaw: number, bedrockPitch: number }>({ step: (state, frame: Frame) => { state.bedrockYaw = frame.bedrockYaw as number ?? state.bedrockYaw; state.bedrockPitch = frame.bedrockPitch as number ?? state.bedrockPitch } })
    for (const [t, yaw] of [[1, 0], [2, 0], [3, f(0.0001)], [4, 30]] as const) {
      inDegrees.push({ t, bedrockYaw: yaw, bedrockPitch: 0 })
      inDegrees.snapshot(t, { bedrockYaw: yaw, bedrockPitch: 0 })
    }
    inDegrees.push({ t: 5 })
    const live = { bedrockYaw: 0, bedrockPitch: 0 }
    inDegrees.rewindTo(1, live, () => {})
    assert.strictEqual(live.bedrockYaw, f(0 + f(30 - f(0.0001))))
  })

  it('replays known turns: none keeps the rotation, the set yaw while on the recording, else each turn added', () => {
    const deg = (yaw: number): number => Math.PI - yaw * Math.PI / 180
    const pit = (pitch: number): number => -pitch * Math.PI / 180
    const ran: number[][] = []
    const rewind = new BedrockRewind<{ yaw: number, pitch: number }>({
      step: (state, frame: Frame) => {
        if (typeof frame.yaw === 'number') state.yaw = frame.yaw
        if (typeof frame.pitch === 'number') state.pitch = frame.pitch
        ran.push([f((Math.PI - state.yaw) * 180 / Math.PI), f(-state.pitch * 180 / Math.PI)])
      }
    })
    const frames: Frame[] = [
      { t: 1, yaw: deg(10), pitch: pit(5) },
      { t: 2, yaw: deg(10), pitch: pit(5) },
      { t: 3, yaw: deg(f(10.001)), pitch: pit(5), turns: { deltas: [] } },
      { t: 4, yaw: deg(f(20.002)), pitch: pit(6), turns: { deltas: [[1, 10]], yaw: f(20.003) } },
      { t: 5, yaw: deg(179), pitch: pit(6), turns: { deltas: [[0, 160], [0, 10]], yaw: 179 } },
      { t: 6 }
    ]
    for (const frame of frames) {
      rewind.push(frame)
      rewind.snapshot(frame.t, { yaw: frame.yaw as number ?? 0, pitch: frame.pitch as number ?? 0 })
    }
    rewind.rewindTo(1, { yaw: 0, pitch: 0 }, () => {})
    assert.deepStrictEqual(ran[1], [10, 5], 'no turn: the rotation the tick before ran with')
    assert.deepStrictEqual(ran[2], [10 + 10, 6], 'off the recording: the turn added, the pitch recorded')
    const wrap = (v: number): number => { let r = f(f(v + 180) % 360); if (r < 0) r = f(r + 360); return f(r + -180) }
    assert.deepStrictEqual(ran[3], [wrap(f(wrap(f(20 + 160)) + 10)), 6], 'each turn added, the yaw wrapped')
    ran.length = 0
    rewind.rewindTo(3, { yaw: 0, pitch: 0 }, () => {})
    assert.deepStrictEqual(ran, [[f(20.002), 6], [179, 6]], 'on the recording: the yaw the turns set')
  })

  it('simulates again from an earlier tick, the install still made after its own', () => {
    const log: string[] = []
    const rewind = new BedrockRewind<{ n: number }>({ step: (state, frame: Frame) => { log.push(`step ${frame.t}`); state.n += 10 } })
    for (let t = 1; t <= 5; t++) {
      rewind.push({ t })
      rewind.snapshot(t, { n: t })
    }
    const state = { n: 0 }
    rewind.rewindTo(3, state, s => { log.push('install'); s.n += 100 }, 1)
    assert.deepStrictEqual(log, ['step 2', 'step 3', 'install', 'step 4'])
    assert.strictEqual(state.n, 1 + 10 + 10 + 100 + 10)
    log.length = 0
    rewind.rewindTo(5, { n: 0 }, () => { log.push('install') }, 3)
    assert.deepStrictEqual(log, ['step 4', 'install'], 'its own tick not simulated again: installed at the end')
  })

  it('simulates again from the state just older than the history only for a correction filed there', () => {
    const steps: number[] = []
    const rewind = new BedrockRewind<{ n: number }>({ history: 2, step: (state, frame: Frame) => { steps.push(frame.t); state.n += 10 } })
    for (let t = 1; t <= 6; t++) {
      rewind.push({ t })
      rewind.snapshot(t, { n: t })
    }
    const state = { n: 0 }
    rewind.rewindTo(5, state, s => { s.n += 100 }, 3)
    assert.deepStrictEqual(steps, [4, 5], 'from the state after tick 3')
    assert.strictEqual(state.n, 3 + 10 + 10 + 100)
    steps.length = 0
    rewind.rewindTo(5, { n: 0 }, () => {}, 2)
    assert.deepStrictEqual(steps, [5], 'further back: the oldest state in the history')
    steps.length = 0
    rewind.reset(4)
    rewind.rewindTo(5, { n: 0 }, () => {}, 3)
    assert.deepStrictEqual(steps, [5], 'not across a reset')
  })
})
