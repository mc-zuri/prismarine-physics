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

// Math.cos closer to the Java runtime's: correctly rounded. HotSpot's (x86-64) Math.cos is that for all but about 1 in
// 1000 pitch angles, while a JavaScript engine's (fdlibm's, as StrictMath.cos) is one unit in the last place off for
// about 2 in 100. For the angles of a pitch (|x| <= PI / 2) it sums the Taylor series in double-double arithmetic and
// rounds once; other angles fall back to Math.cos.
exports.javaCos = function javaCos (x) {
  if (!(Math.abs(x) <= 1.6)) return Math.cos(x)
  const x2 = ddMul([x, 0], [x, 0])
  let term = [1, 0]
  let sum = [1, 0]
  for (let k = 1; Math.abs(term[0]) > 1e-40; k++) {
    term = ddDivInt(ddMul(term, x2), -(2 * k - 1) * (2 * k))
    sum = ddAdd(sum, term)
  }
  return sum[0] + sum[1]
}

function twoSum (a, b) {
  const s = a + b
  const v = s - a
  return [s, (a - (s - v)) + (b - v)]
}
function quickTwoSum (a, b) {
  const s = a + b
  return [s, b - (s - a)]
}
function split (a) {
  const c = 134217729 * a
  const hi = c - (c - a)
  return [hi, a - hi]
}
function twoProd (a, b) {
  const p = a * b
  const [ah, al] = split(a)
  const [bh, bl] = split(b)
  return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl]
}
function ddAdd (a, b) {
  const [s, e] = twoSum(a[0], b[0])
  return quickTwoSum(s, e + a[1] + b[1])
}
function ddMul (a, b) {
  const [p, e] = twoProd(a[0], b[0])
  return quickTwoSum(p, e + a[0] * b[1] + a[1] * b[0])
}
function ddDivInt (a, n) {
  const q = a[0] / n
  const [p, e] = twoProd(q, n)
  return quickTwoSum(q, (a[0] - p - e + a[1]) / n)
}
