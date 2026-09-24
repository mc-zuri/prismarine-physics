// Single-precision arithmetic. The Bedrock player state is float32 throughout, so every intermediate result the
// engine keeps is rounded with `f` (Math.fround) at the point where a float32 store would round it.

// Rounds a number to the nearest float32.
export const f = Math.fround

// 2^-23: velocity components this small are flushed to zero by the friction step.
export const VELOCITY_EPSILON = f(1.1920928955078125e-7)
// The largest finite float32.
export const FLT_MAX = 3.4028234663852886e38
// The smallest positive float32 (a subnormal).
export const FLOAT32_MIN_SUBNORMAL = 1.401298464324817e-45
