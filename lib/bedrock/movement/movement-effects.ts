// Movement effects: timed boosts in lanes by type (a firework's glide boost, a dolphin's swim boost), each with the
// ticks it has left (-1: without end, 0: none).

// Whether an effect's remaining duration already covers a wanted one: a shorter one does not replace it.
export function durationCovers (have: number, want: number): boolean {
  if (have === want) return true
  return want !== -1 && (have === -1 || have >= want)
}

// An effect at the end of a tick: one tick less, gone after its last.
export function countDown (duration: number): number {
  if (duration === 0 || duration === -1) return duration
  return duration >= 2 ? duration - 1 : 0
}

// A firework rocket used while gliding: the glide boost the client gives itself until the server's word arrives.
export const FIREWORK_BOOST_TICKS = 20
// The glide boost counts down two a tick: the server's 54 boosts 27 ticks, the client's own 20 ten.
export const GLIDE_BOOST_RATE = 2

// The glide boost after a firework use: the client's own length, unless what is left already covers it; not gliding,
// the use does nothing.
export function fireworkBoost (duration: number, gliding: boolean): number {
  return gliding && !durationCovers(duration, FIREWORK_BOOST_TICKS) ? FIREWORK_BOOST_TICKS : duration
}
