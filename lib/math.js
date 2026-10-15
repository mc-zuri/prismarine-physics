exports.clamp = function clamp (min, x, max) {
  return Math.max(min, Math.min(x, max))
}

// Java's float constants for turning degrees into radians: (float)Math.PI and (float)(Math.PI / 180.0)
exports.PI_F = Math.fround(Math.PI)
exports.DEG_TO_RAD_F = Math.fround(0.017453292)

// Mth.sin / Mth.cos: a 65536-entry float table, SIN[i] = (float)Math.sin(i * 2 * PI / 65536). Before 1.21.11 the
// index is the float angle times 10430.378F in float, cast to int. Since 1.21.11 the float angle is widened to
// double, multiplied by 10430.378350470453 and cast to long (the table is built differently but holds the same
// values). The low 16 bits pick the entry; the cosine's is a quarter turn further.
const SIN_TABLE = new Float32Array(65536)
for (let i = 0; i < 65536; i++) SIN_TABLE[i] = Math.sin(i * Math.PI * 2 / 65536)
const SIN_SCALE_F = Math.fround(10430.378)
const SIN_SCALE = 10430.378350470453

// Math.trunc is Java's narrowing cast for these values; & keeps the low 16 bits of any integer below 2^53
exports.mthSin = function mthSin (radians, doubleIndex) {
  const index = doubleIndex ? radians * SIN_SCALE : Math.fround(radians * SIN_SCALE_F)
  return SIN_TABLE[Math.trunc(index) & 65535]
}

exports.mthCos = function mthCos (radians, doubleIndex) {
  const index = doubleIndex ? radians * SIN_SCALE + 16384 : Math.fround(Math.fround(radians * SIN_SCALE_F) + 16384)
  return SIN_TABLE[Math.trunc(index) & 65535]
}
