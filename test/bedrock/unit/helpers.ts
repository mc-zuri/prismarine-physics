// Small worlds and players for the unit tests. Blocks are plain objects in the shape the engine reads (name,
// boundingBox, shapes, liquid depth), so a test states exactly the world it needs.
import { Vec3 } from 'vec3'
import { paired, scalar } from '../../../lib/bedrock/math/crt.ts'
import { defaultSettings } from '../../../lib/bedrock/index.ts'
import type { Block, Ctx, Player, Settings, Shape, World } from '../../../lib/bedrock/types.ts'

const FULL: Shape[] = [[0, 0, 0, 1, 1, 1]]

// The blocks the tests place, by name.
export const BLOCKS: Record<string, Block> = {
  air: { name: 'air', type: 0, boundingBox: 'empty' },
  stone: { name: 'stone', boundingBox: 'block', shapes: FULL },
  dirt: { name: 'dirt', boundingBox: 'block' },
  ice: { name: 'ice', boundingBox: 'block', shapes: FULL },
  blue_ice: { name: 'blue_ice', boundingBox: 'block', shapes: FULL },
  slime: { name: 'slime', boundingBox: 'block', shapes: FULL },
  bed: { name: 'bed', boundingBox: 'block', shapes: [[0, 0, 0, 1, 0.5625, 1]] },
  honey_block: { name: 'honey_block', boundingBox: 'block', shapes: [[0.0625, 0, 0.0625, 0.9375, 0.9375, 0.9375]] },
  soul_sand: { name: 'soul_sand', boundingBox: 'block', shapes: [[0, 0, 0, 1, 0.875, 1]] },
  magma: { name: 'magma', boundingBox: 'block', shapes: FULL },
  bottom_slab: { name: 'stone_slab', boundingBox: 'block', shapes: [[0, 0, 0, 1, 0.5, 1]] },
  snow_layer: { name: 'snow_layer', boundingBox: 'block', shapes: [[0, 0, 0, 1, 0.25, 1]] },
  // a block whose collision starts 0.2 above its cell
  hanging: { name: 'hanging', boundingBox: 'block', shapes: [[0, 0.2, 0, 1, 1, 1]] },
  fence: { name: 'oak_fence', boundingBox: 'block', shapes: [[0.375, 0, 0.375, 0.625, 1.5, 0.625]] },
  ladder: { name: 'ladder', boundingBox: 'empty', shapes: [[0, 0, 0.8125, 1, 1, 1]] },
  vine: { name: 'vine', boundingBox: 'empty' },
  scaffolding: { name: 'scaffolding', boundingBox: 'block', shapes: FULL },
  water: { name: 'water', boundingBox: 'empty', _properties: { liquid_depth: 0 } },
  flowing_water: { name: 'flowing_water', boundingBox: 'empty', _properties: { liquid_depth: 3 } },
  bubble_column: { name: 'bubble_column', boundingBox: 'empty' },
  lava: { name: 'lava', boundingBox: 'empty' },
  cobweb: { name: 'cobweb', boundingBox: 'empty' },
  web: { name: 'web', boundingBox: 'empty' },
  powder_snow: { name: 'powder_snow', boundingBox: 'empty' },
  sweet_berry_bush: { name: 'sweet_berry_bush', boundingBox: 'empty' }
}

export function block (name: string): Block {
  const known = BLOCKS[name]
  if (!known) throw new Error(`no test block ${name}`)
  return known
}

// A world from a function of the cell to a block name (null or 'air' for air).
export function worldFrom (pick: (x: number, y: number, z: number) => string | null | undefined): World & { reads: number } {
  const world = {
    reads: 0,
    getBlock (pos: Vec3) {
      world.reads++
      const name = pick(pos.x, pos.y, pos.z)
      return name ? block(name) : block('air')
    }
  }
  return world
}

// A world from explicit cells ("x,y,z" -> name) over a floor of `floor` below y = floorY (none when floorY is null).
export function worldOf (cells: Record<string, string>, floorY: number | null = 0, floor = 'stone'): World & { reads: number } {
  return worldFrom((x, y, z) => cells[`${x},${y},${z}`] || (floorY !== null && y < floorY ? floor : null))
}

export const EMPTY = worldFrom(() => null)
export const FLAT = worldOf({})

export function settings (overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), ...overrides }
}

export function ctx (world: World = FLAT, options: { modern?: boolean, settings?: Partial<Settings> } = {}): Ctx {
  const modern = options.modern !== false
  return { settings: settings(options.settings), trig: modern ? scalar : paired, bounceCorrection: modern, world }
}

// A player standing at `pos` (feet) with the given fields.
export function player (pos: [number, number, number] = [0.5, 0, 0.5], fields: Partial<Player> = {}): Player {
  return {
    pos: new Vec3(pos[0], pos[1], pos[2]),
    vel: new Vec3(0, 0, 0),
    onGround: true,
    jumpTicks: 0,
    jumpQueued: false,
    yaw: Math.PI,
    pitch: 0,
    control: {},
    ...fields
  }
}

export const f = Math.fround
