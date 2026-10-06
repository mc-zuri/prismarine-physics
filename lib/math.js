exports.clamp = function clamp (min, x, max) {
  return Math.max(min, Math.min(x, max))
}

// Java's float arithmetic: every float operation rounds to float32.
const f32 = Math.fround
exports.f32 = f32

// The sin and cos behind Java's Math.sin/cos and the Mth tables. JavaScript's can differ from Java's in the last bit;
// a caller that needs Java's exactly passes them to Physics(mcData, world, { trig }), or installs them for every
// engine without that option with setTrig before the first tick builds the tables.
const trig = { sin: Math.sin, cos: Math.cos }
exports.trig = trig
exports.setTrig = function setTrig ({ sin, cos }) {
  if (tables.has(trig)) throw new Error('setTrig must run before the sine tables are built')
  trig.sin = sin
  trig.cos = cos
}

// Mth.sin / Mth.cos: a 65536-entry float table. Before 1.21.11 the argument is a float scaled by 10430.378F in
// float; since, a double scaled by 10430.378350470453 and truncated as a long (the table is built from the same
// scale, so its entries can differ in the last bit too).
const SIN_SCALE_F = f32(10430.378)
const SIN_SCALE = 10430.378350470453
// The tables of each sin and cos, built on first use: { legacy, modern }
const tables = new WeakMap()
function table (functions, modern) {
  let built = tables.get(functions)
  if (!built) tables.set(functions, built = {})
  if (modern) {
    if (!built.modern) {
      built.modern = new Float32Array(65536)
      for (let i = 0; i < 65536; i++) built.modern[i] = functions.sin(i / SIN_SCALE)
    }
    return built.modern
  }
  if (!built.legacy) {
    built.legacy = new Float32Array(65536)
    for (let i = 0; i < 65536; i++) built.legacy[i] = functions.sin(i * Math.PI * 2 / 65536)
  }
  return built.legacy
}

// Java's (int) of a float or (long) of a double truncates toward zero; the mask keeps the low 16 bits, which
// ToInt32 preserves for any integer below 2^53.
function mthSin (functions, radians, modern) {
  if (modern) return table(functions, true)[Math.trunc(radians * SIN_SCALE) & 65535]
  return table(functions, false)[Math.trunc(f32(f32(radians) * SIN_SCALE_F)) & 65535]
}

function mthCos (functions, radians, modern) {
  if (modern) return table(functions, true)[Math.trunc(radians * SIN_SCALE + 16384) & 65535]
  return table(functions, false)[Math.trunc(f32(f32(f32(radians) * SIN_SCALE_F) + 16384)) & 65535]
}

exports.mthSin = (radians, modern) => mthSin(trig, radians, modern)
exports.mthCos = (radians, modern) => mthCos(trig, radians, modern)

// The trigonometry of one engine: the given sin and cos (default: the shared, setTrig-able ones) with their own
// Mth tables. The same functions share their tables across engines.
exports.forTrig = function forTrig (functions = trig) {
  if (typeof functions?.sin !== 'function' || typeof functions?.cos !== 'function') throw new Error('trig needs sin and cos functions')
  return {
    sin: radians => functions.sin(radians),
    cos: radians => functions.cos(radians),
    mthSin: (radians, modern) => mthSin(functions, radians, modern),
    mthCos: (radians, modern) => mthCos(functions, radians, modern)
  }
}
