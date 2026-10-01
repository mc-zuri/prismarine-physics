exports.clamp = function clamp (min, x, max) {
  return Math.max(min, Math.min(x, max))
}

// Java's float arithmetic: every float operation rounds to float32.
const f32 = Math.fround
const javaMath = require('./java-math')
exports.f32 = f32

// Mth.sin / Mth.cos: a 65536-entry float table. Before 1.21.11 the argument is a float scaled by 10430.378F in
// float; since, a double scaled by 10430.378350470453 and truncated as a long (the table is built from the same
// scale, so its entries can differ in the last bit too).
const SIN_SCALE_F = f32(10430.378)
const SIN_SCALE = 10430.378350470453
let legacyTable
let modernTable
function table (modern) {
  if (modern) {
    if (!modernTable) {
      modernTable = new Float32Array(65536)
      for (let i = 0; i < 65536; i++) modernTable[i] = javaMath.sin(i / SIN_SCALE)
    }
    return modernTable
  }
  if (!legacyTable) {
    legacyTable = new Float32Array(65536)
    for (let i = 0; i < 65536; i++) legacyTable[i] = javaMath.sin(i * Math.PI * 2 / 65536)
  }
  return legacyTable
}

// Java's (int) of a float or (long) of a double truncates toward zero; the mask keeps the low 16 bits, which
// ToInt32 preserves for any integer below 2^53.
exports.mthSin = function mthSin (radians, modern) {
  if (modern) return table(true)[Math.trunc(radians * SIN_SCALE) & 65535]
  return table(false)[Math.trunc(f32(f32(radians) * SIN_SCALE_F)) & 65535]
}

exports.mthCos = function mthCos (radians, modern) {
  if (modern) return table(true)[Math.trunc(radians * SIN_SCALE + 16384) & 65535]
  return table(false)[Math.trunc(f32(f32(f32(radians) * SIN_SCALE_F) + 16384)) & 65535]
}
