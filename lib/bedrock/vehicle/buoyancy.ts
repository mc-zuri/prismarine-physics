// Buoyancy: what keeps a boat on the water. After the move, a timer advances the wave; a boat whose cell is liquid
// with air above floats toward the surface less the wave, and one with liquid above rises; gravity pulls it otherwise.
import { f } from '../math/float.ts'
import type { Block, Vec3Like, World } from '../types.ts'
import { blockAt, blockName } from '../world/blocks.ts'
import { cellLiquid, liquidDepthOf, liquidSurfaceHeight } from '../world/liquids.ts'

// The wave: none, waves (a boat) or bobbing (a horse in water).
export const MovementType = { None: 0, Waves: 1, Bobbing: 2 } as const
export type WaveKind = typeof MovementType[keyof typeof MovementType]

// A floating entity's buoyancy: its settings (from the entity's buoyancy data) and the wave timer.
export interface Buoyancy {
  baseBuoyancy: number
  applyGravity: boolean
  movementType: WaveKind
  bigWaveProbability: number
  bigWaveSpeed: number
  liquidBlocks: readonly string[]
  timer: number
}

// A boat's buoyancy.
export function boatBuoyancy (): Buoyancy {
  return { baseBuoyancy: 1, applyGravity: true, movementType: MovementType.Waves, bigWaveProbability: f(0.03), bigWaveSpeed: 10, liquidBlocks: ['water', 'flowing_water'], timer: 0 }
}

// Reads an entity's buoyancy data (its JSON metadata) over the current settings, keeping the timer. The liquids are
// cleared first: a malformed one leaves the rest and floats in nothing.
export function buoyancyFromData (json: string, into: Buoyancy = boatBuoyancy()): Buoyancy {
  let data: unknown
  try { data = JSON.parse(json) } catch { return { ...into, liquidBlocks: [] } }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...into, liquidBlocks: [] }
  const d = data as Record<string, unknown>
  const num = (key: string, current: number): number => typeof d[key] === 'number' ? f(d[key] as number) : current
  return {
    baseBuoyancy: num('base_buoyancy', into.baseBuoyancy),
    applyGravity: typeof d.apply_gravity === 'boolean' ? d.apply_gravity : into.applyGravity,
    movementType: d.movement_type === 'none' ? MovementType.None : d.movement_type === 'bobbing' ? MovementType.Bobbing : MovementType.Waves,
    bigWaveProbability: num('big_wave_probability', into.bigWaveProbability),
    bigWaveSpeed: num('big_wave_speed', into.bigWaveSpeed),
    liquidBlocks: Array.isArray(d.liquid_blocks) ? d.liquid_blocks.filter((b): b is string => typeof b === 'string').map(b => b.replace(/^minecraft:/, '')) : [],
    timer: into.timer
  }
}

// The wave timer's step: one a tick when bobbing, else faster with the horizontal speed, ten times on a big wave
// (`roll` is a uniform draw in [0, 1); a draw at or under the probability is a big wave).
export function advanceTimer (buoyancy: Buoyancy, vel: Vec3Like, roll: number): void {
  if (buoyancy.movementType === MovementType.Bobbing) {
    buoyancy.timer = buoyancy.timer + 1
    return
  }
  const speed = f(Math.sqrt(f(f(vel.z * vel.z) + f(vel.x * vel.x))))
  // the timer is a double: the step is worked in double and only its twentieth is narrowed to float
  let step = speed * 30 + 1
  if (!(buoyancy.bigWaveProbability < roll)) step = step * buoyancy.bigWaveSpeed
  buoyancy.timer = buoyancy.timer + f(step * 0.05000000074505806)
}

// Whether the entity at `pos` floats (in a liquid it floats in, below its surface, with no such liquid above) or has to
// resurface (that liquid above too).
export interface FloatRequest { canFloat: boolean, needToResurface: boolean }

export function floatRequest (world: World, buoyancy: Buoyancy, pos: Vec3Like): FloatRequest {
  const x = Math.floor(pos.x)
  const y = Math.floor(pos.y)
  const z = Math.floor(pos.z)
  // the cell's liquid (its own block, or a waterlogged block's water); a bubble column is water
  const liquidOf = (block: Block | null | undefined): Block | null => cellLiquid(block)
  const floatsIn = (liquid: Block | null): boolean => {
    const name = blockName(liquid)
    return buoyancy.liquidBlocks.includes(name === 'bubble_column' ? 'water' : name)
  }
  const here = liquidOf(blockAt(world, x, y, z))
  const inside = floatsIn(here)
  const overhead = floatsIn(liquidOf(blockAt(world, x, y + 1, z)))
  const surface = liquidSurfaceHeight(liquidDepthOf(here), y)
  return { canFloat: surface > f(pos.y) && inside && !overhead, needToResurface: inside && overhead }
}

// Gravity with drag: (vy - 0.04) * 0.98.
export function buoyancyGravity (vy: number): number {
  return f(f(vy + f(-0.04)) * f(0.98))
}

// The float: the velocity keeps 0.7 and rises at most 0.05 toward the lift that brings the entity to the surface less
// the wave. Returns the new vertical velocity, or the old one when nothing floats it.
export function buoyancyFloat (buoyancy: Buoyancy, request: FloatRequest, pos: Vec3Like, vy: number): number {
  let surface: number
  let wave = 0
  if (request.canFloat) {
    const fraction = f(pos.y - f(Math.floor(pos.y)))
    const raw = f(f(f(buoyancy.baseBuoyancy - fraction) * f(0.9)) + f(0.1))
    surface = raw > 1 ? 1 : raw > 0 ? raw : 0
    if (buoyancy.movementType === MovementType.Waves) wave = f(f(f(Math.sin(buoyancy.timer)) + 1) * f(0.035))
    else if (buoyancy.movementType === MovementType.Bobbing) wave = f(f(f(Math.sin(buoyancy.timer * f(0.31415927))) + f(1.2)) * f(0.5))
    if (surface === 0) return vy
  } else if (request.needToResurface) {
    surface = 1
  } else {
    return vy
  }
  const damped = f(vy * f(0.7))
  const lift = f(f(f(surface - wave) + f(-0.1)) * f(0.15))
  const ceiling = f(damped + f(0.05))
  return lift < ceiling ? lift : ceiling
}
