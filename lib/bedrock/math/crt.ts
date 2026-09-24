// The float sine and cosine the travel rotates the input with, in the two shapes the game's builds compute them,
// and the game's sine table. data/crt-math.wasm carries the routines and the table, transcribed from the C runtime's
// machine code and compiled without fast math or fused multiply-adds, so each result is the runtime's float32 bit for
// bit.
//
//   scalar - the C runtime's sinf and cosf, called by the clang builds from 1.26.20 on. Checked against the running
//            runtime on 500,000 angles.
//   paired - the vectorised sine/cosine pair the fast-math builds up to 1.26.10 emit for a sinf/cosf pair. It
//            differs from the scalar routines on about four fifths of angles, by one float32 step.
//
//   table  - the 65536-entry sine table: the scalar sinf of i / 10430.378 (65536 / 2 pi), every step in float32.
//            Equal to the game's table on every entry.
//
// Without WebAssembly, Math.sin / Math.cos rounded to float32 stand in for all three: the correctly rounded value, one
// float32 step from the scalar routine on about 0.13% of angles (85 of the table's entries).
import fs from 'node:fs'
import path from 'node:path'
import { f } from './float.ts'

// A sine and a cosine.
export interface SinCos { sin: number, cos: number }

// Sine and cosine of an angle in degrees, both from one routine.
export interface Trig {
  sinDeg (deg: number): number
  cosDeg (deg: number): number
  sinCosDeg (deg: number): SinCos
}

// The WebAssembly API, typed here as far as it is used (the compile targets carry no DOM types).
interface Wasm {
  Module: new (bytes: Uint8Array) => object
  Instance: new (module: object, imports: object) => { exports: unknown }
}
const WebAssemblyApi = (globalThis as unknown as { WebAssembly: Wasm }).WebAssembly

interface CrtExports {
  memory: { buffer: ArrayBuffer }
  x_out (): number
  x_sinf (deg: number): number
  x_cosf (deg: number): number
  x_sincosf (deg: number): void
  x_sin_table (): number
}

const WASM_FILE = path.join(import.meta.dirname, '..', 'data', 'crt-math.wasm')

// The compiled routines and their output buffer, or null when they cannot be loaded.
export function loadCrt (file = WASM_FILE): { exports: CrtExports, out: Float32Array } | null {
  try {
    const bytes = fs.readFileSync(file)
    const exports = new WebAssemblyApi.Instance(new WebAssemblyApi.Module(bytes), {}).exports as unknown as CrtExports
    return { exports, out: new Float32Array(exports.memory.buffer, exports.x_out(), 4) }
  } catch {
    return null
  }
}

const wasm = loadCrt()

const DEG_TO_RAD = f(0.017453292)
const TABLE_STEPS_PER_RADIAN = f(10430.378) // 65536 / (2 pi)
const approxSin = (deg: number): number => f(Math.sin(f(f(deg) * DEG_TO_RAD)))
const approxCos = (deg: number): number => f(Math.cos(f(f(deg) * DEG_TO_RAD)))

// The scalar routines of a loaded module, or the Math.sin / Math.cos stand-ins without one.
export function makeScalar (crt: CrtExports | null): Trig {
  const sinDeg = crt ? (deg: number) => crt.x_sinf(deg) : approxSin
  const cosDeg = crt ? (deg: number) => crt.x_cosf(deg) : approxCos
  return { sinDeg, cosDeg, sinCosDeg: (deg) => ({ sin: sinDeg(deg), cos: cosDeg(deg) }) }
}

// The paired routine of a loaded module, or the Math.sin / Math.cos stand-ins without one.
export function makePaired (crt: CrtExports | null, out: Float32Array | null): Trig {
  const sinCosDeg = crt && out
    ? (deg: number): SinCos => { crt.x_sincosf(deg); return { sin: out[0]!, cos: out[1]! } }
    : (deg: number): SinCos => ({ sin: approxSin(deg), cos: approxCos(deg) })
  return { sinCosDeg, sinDeg: (deg) => sinCosDeg(deg).sin, cosDeg: (deg) => sinCosDeg(deg).cos }
}

// The sine table of a loaded module, or Math.sin of the same angles without one.
export function makeSineTable (crt: CrtExports | null): Float32Array {
  if (crt) return new Float32Array(crt.memory.buffer, crt.x_sin_table(), 65536).slice()
  const table = new Float32Array(65536)
  for (let i = 0; i < 65536; i++) table[i] = Math.sin(f(i / TABLE_STEPS_PER_RADIAN))
  return table
}

// Whether the exact routines loaded.
export const exact = wasm !== null
// The scalar sine and cosine (the builds from 1.26.20).
export const scalar = makeScalar(wasm && wasm.exports)
// The paired sine and cosine (the builds up to 1.26.10).
export const paired = makePaired(wasm && wasm.exports, wasm && wasm.out)
// The sine table.
export const sineTable = makeSineTable(wasm && wasm.exports)
