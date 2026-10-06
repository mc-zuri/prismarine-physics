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
//
// Node reads the module when this file loads. A browser has no file to read: the stand-ins hold until loadCrtAsync()
// has fetched and compiled it (asynchronously, as a page's main thread must compile a module of this size), and then
// give way to the exact routines in the same objects.
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
  instantiate (bytes: ArrayBuffer, imports: object): Promise<{ instance: { exports: unknown } }>
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

// The compiled routines and the buffer x_sincosf writes its pair into.
export interface Crt { exports: CrtExports, out: Float32Array }

// What loadCrt reads the module with: Node's fs.
export interface FileReader { readFileSync (file: string | URL): Uint8Array }

// What loadCrtAsync fetches the module with: the global fetch.
export type Fetch = (url: string | URL) => Promise<{ ok: boolean, arrayBuffer (): Promise<ArrayBuffer> }>

// The module beside this file: a file: URL in Node; in a bundle, the URL of the asset the bundler made of it.
export const WASM_URL = new URL('../data/crt-math.wasm', import.meta.url)

// Node's fs, taken from the process rather than imported (a bundle for a browser would have to resolve the import);
// null where there is none.
export function nodeFs (proc: unknown = (globalThis as { process?: unknown }).process): FileReader | null {
  const node = proc as { getBuiltinModule?: (id: string) => unknown } | null | undefined
  if (!node || typeof node.getBuiltinModule !== 'function') return null
  return node.getBuiltinModule('node:fs') as FileReader
}

function crtOf (exports: CrtExports): Crt {
  return { exports, out: new Float32Array(exports.memory.buffer, exports.x_out(), 4) }
}

// The compiled routines and their output buffer, or null when they cannot be loaded (no file, or no fs to read it
// with).
export function loadCrt (file: string | URL = WASM_URL, fs: FileReader | null = nodeFs()): Crt | null {
  if (!fs) return null
  try {
    const bytes = fs.readFileSync(file)
    return crtOf(new WebAssemblyApi.Instance(new WebAssemblyApi.Module(bytes), {}).exports as unknown as CrtExports)
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

// Whether the exact routines are in use.
export let exact = wasm !== null
// The scalar sine and cosine (the builds from 1.26.20).
export const scalar = makeScalar(wasm && wasm.exports)
// The paired sine and cosine (the builds up to 1.26.10).
export const paired = makePaired(wasm && wasm.exports, wasm && wasm.out)
// The sine table.
export const sineTable = makeSineTable(wasm && wasm.exports)

// Puts the routines of a loaded module in place of what is in use, in the same objects: the engine holds scalar,
// paired and the table from when it loaded.
export function useCrt (crt: Crt): void {
  Object.assign(scalar, makeScalar(crt.exports))
  Object.assign(paired, makePaired(crt.exports, crt.out))
  sineTable.set(makeSineTable(crt.exports))
  exact = true
}

// Fetches, compiles and uses the exact routines where they could not be read when this file loaded (a browser).
// Resolves whether they are in use; on a failure the stand-ins stay.
export async function loadCrtAsync (url: string | URL = WASM_URL, fetchFile: Fetch = (globalThis as unknown as { fetch: Fetch }).fetch): Promise<boolean> {
  if (exact) return true
  try {
    const response = await fetchFile(url)
    if (!response.ok) return false
    const { instance } = await WebAssemblyApi.instantiate(await response.arrayBuffer(), {})
    useCrt(crtOf(instance.exports as unknown as CrtExports))
    return true
  } catch {
    return false
  }
}
