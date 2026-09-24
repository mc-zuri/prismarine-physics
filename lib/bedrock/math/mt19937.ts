// The client's core random: a Mersenne Twister working on its own state block (the seed, the 624 words, the draw
// index and how many words are seeded so far), twisting one word just before it is used and seeding the words lazily.
// A recording carries this block, so a replay can make the client's own draws.
import { f } from './float.ts'

const WORDS = 624
const OFFSET = 397
const MT_AT = 4
const MTI_AT = MT_AT + WORDS * 4
const INITED_AT = MTI_AT + 4
// The bytes a draw reads: the seed, the words and the two cursors.
export const MT19937_STATE_BYTES = INITED_AT + 4
const TO_UNIT = 2.3283064365386963e-10

function view (state: Uint8Array): DataView { return new DataView(state.buffer, state.byteOffset, state.byteLength) }
function seedWord (previous: number, i: number): number { return (Math.imul(1812433253, (previous ^ (previous >>> 30)) >>> 0) + i) >>> 0 }

// A state block seeded as the client seeds its level random: the first 398 words, the rest seeded as they are drawn.
export function mt19937FromSeed (seed: number): Uint8Array {
  const state = new Uint8Array(MT19937_STATE_BYTES)
  const data = view(state)
  data.setUint32(0, seed >>> 0, true)
  data.setUint32(MT_AT, seed >>> 0, true)
  for (let i = 1; i <= OFFSET; i++) data.setUint32(MT_AT + i * 4, seedWord(data.getUint32(MT_AT + (i - 1) * 4, true), i), true)
  data.setInt32(MTI_AT, WORDS, true)
  data.setInt32(INITED_AT, OFFSET + 1, true)
  return state
}

// The next 32-bit word, advancing the state in place.
export function mt19937NextWord (state: Uint8Array): number {
  const data = view(state)
  const word = (i: number): number => data.getUint32(MT_AT + i * 4, true)
  const setWord = (i: number, value: number): void => data.setUint32(MT_AT + i * 4, value >>> 0, true)
  let mti = data.getInt32(MTI_AT, true)
  let inited = data.getInt32(INITED_AT, true)
  if (mti >= WORDS + 1) {
    // never seeded: the fixed seed 5489
    setWord(0, 5489)
    for (let i = 1; i < WORDS; i++) setWord(i, seedWord(word(i - 1), i))
    inited = WORDS
    mti = 0
  } else if (mti === WORDS) {
    mti = 0
  }
  const next = word((mti + 1) % WORDS)
  const y = ((word(mti) & 0x80000000) | (next & 0x7FFFFFFE)) >>> 0
  setWord(mti, word((mti + OFFSET) % WORDS) ^ (y >>> 1) ^ ((next & 1) !== 0 ? 0x9908B0DF : 0))
  if (inited <= WORDS - 1) {
    setWord(inited, seedWord(word(inited - 1), inited))
    inited++
  }
  let v = word(mti)
  data.setInt32(MTI_AT, mti + 1, true)
  data.setInt32(INITED_AT, inited, true)
  v = (v ^ (v >>> 11)) >>> 0
  v = (v ^ ((v << 7) & 0x9D2C5680)) >>> 0
  v = (v ^ ((v << 15) & 0xEFC60000)) >>> 0
  return (v ^ (v >>> 18)) >>> 0
}

// The next float in [0, 1): a word times 2^-32, narrowed to float32.
export function mt19937NextFloat (state: Uint8Array): number {
  return f(mt19937NextWord(state) * TO_UNIT)
}
