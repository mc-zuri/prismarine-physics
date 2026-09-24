// The collision sweep: the box moves one axis at a time (Y, then X, then Z), each shape clipping the axis motion in
// turn. A shape clips only when it overlaps the box on the two other axes and is separated on the moving one by less
// than the motion; a shape the box already overlaps on all three axes pushes it out along the shallowest axis when
// that penetration is within the depenetration limit of that axis (movement/depenetration.ts), and is moved through
// otherwise. Gaps within 1e-6 of
// zero count as touching: a box a float32 step inside a block top rests there, unpushed.
import { Vec3 } from 'vec3'
import { Box, type BoxLike } from '../math/box.ts'
import { f, FLT_MAX } from '../math/float.ts'
import type { Vec3Like, World } from '../types.ts'
import { collisionBoxes, type Mover } from '../world/blocks.ts'

const OVERLAP_EPSILON = f(9.9999997e-7)
// A whole block on each axis: the limit while nothing holds the player.
export const FULL_DEPENETRATION: Readonly<Vec3Like> = { x: 1, y: 1, z: 1 }

// What a sweep reports besides the movement: the penetration depths of every clip, summed, and the collision boxes
// it was made against.
export interface SweepReport { totalClip: number, shapes?: Box[] }

type Axis3 = [number, number, number]
// An axis index: x, y or z.
type Axis = 0 | 1 | 2
const AXES: readonly Axis[] = [0, 1, 2]

function snapGap (value: number): number { return Math.abs(value) > OVERLAP_EPSILON ? value : 0 }
function clampLow (value: number): number { return value > 0 ? value : 0 }
function lesser (a: number, b: number): number { return a < b ? a : b }

// The result of clipping one axis of a motion against one shape.
export interface Clip {
  // the penetration resolved (0 when the shape did not overlap on all axes)
  depth: number
  // the clipped motion without, and with, the push out of an overlapping shape
  unpushed: Axis3
  pushed: Axis3
  // the axis pushed along
  axis: Axis
}

// Clips the motion `motion` (one non-zero component) of `box` against `shape`.
export function clipAxis (shape: BoxLike, box: BoxLike, motion: Axis3): Clip {
  const result: Clip = { depth: 0, unpushed: [...motion], pushed: [...motion], axis: 0 }
  if (shape.minX >= shape.maxX || shape.minY >= shape.maxY || shape.minZ >= shape.maxZ) return result
  const push: Axis3 = [snapGap(f(shape.maxX - box.minX)), snapGap(f(shape.maxY - box.minY)), snapGap(f(shape.maxZ - box.minZ))]
  const pushBack: Axis3 = [snapGap(f(box.maxX - shape.minX)), snapGap(f(box.maxY - shape.minY)), snapGap(f(box.maxZ - shape.minZ))]
  const depth: Axis3 = [0, 0, 0]
  const sign: Axis3 = [0, 0, 0]
  const separation: Axis3 = [0, 0, 0]
  const overlaps: [boolean, boolean, boolean] = [false, false, false]
  for (const k of AXES) {
    const positive = clampLow(push[k])
    const negative = clampLow(pushBack[k])
    // the negative side is tested first
    if (negative === 0) { separation[k] = pushBack[k]; sign[k] = -1; continue }
    if (positive === 0) { separation[k] = push[k]; sign[k] = 1; continue }
    overlaps[k] = true
    depth[k] = lesser(positive, negative)
    sign[k] = positive > negative ? -1 : 1
  }
  // at most one axis may separate; a second one means the shape is clear of the box
  let separated: Axis | undefined
  for (const k of AXES) {
    if (overlaps[k]) continue
    if (separated !== undefined) return result
    separated = k
  }
  if (separated !== undefined) {
    const gapSign = sign[separated]
    const gap = separation[separated]
    if (f(gap - f(motion[separated] * gapSign)) > 0) {
      const clipped = f(gap * gapSign)
      result.unpushed[separated] = clipped
      result.pushed[separated] = clipped
    }
    return result
  }
  // all three overlap: push out along the shallowest axis
  result.depth = lesser(depth[2], lesser(depth[1], lesser(depth[0], FLT_MAX)))
  const nearerOfXY: Axis = depth[0] > depth[1] ? 1 : 0
  const axisIndex: Axis = depth[nearerOfXY] <= depth[2] ? nearerOfXY : 2
  const pushOut = f(depth[axisIndex] * sign[axisIndex])
  const wanted = motion[axisIndex]
  const takePush = pushOut <= 0 ? (pushOut <= wanted) : (wanted <= pushOut)
  result.pushed[axisIndex] = takePush ? pushOut : wanted
  result.axis = axisIndex
  return result
}

// Sweeps `box` (moved in place) by the requested movement through `shapes`, walked backwards once per axis; returns
// the movement applied. `limit` is the depenetration limit per axis; `report` receives the summed clip depths.
export function sweep (box: BoxLike, mx: number, my: number, mz: number, shapes: readonly BoxLike[], limit: Vec3Like = FULL_DEPENETRATION, report?: SweepReport): Vec3 {
  const limits: Axis3 = [limit.x, limit.y, limit.z]
  let totalClip = 0
  const moved: Axis3 = [0, 0, 0]
  const steps: Axis3[] = [[0, my, 0], [mx, 0, 0], [0, 0, mz]]
  for (const requested of steps) {
    let motion = requested
    for (let i = shapes.length - 1; i >= 0; i--) {
      const clip = clipAxis(shapes[i]!, box, motion)
      motion = limits[clip.axis] < clip.depth ? clip.unpushed : clip.pushed
      totalClip = f(totalClip + clip.depth)
    }
    moved[0] = f(moved[0] + motion[0])
    moved[1] = f(moved[1] + motion[1])
    moved[2] = f(moved[2] + motion[2])
    box.minX = f(box.minX + motion[0])
    box.minY = f(box.minY + motion[1])
    box.minZ = f(box.minZ + motion[2])
    box.maxX = f(box.maxX + motion[0])
    box.maxY = f(box.maxY + motion[1])
    box.maxZ = f(box.maxZ + motion[2])
  }
  if (report) report.totalClip = totalClip
  return new Vec3(moved[0], moved[1], moved[2])
}

// Sweeps `box` (moved in place) against the blocks around the path; returns the movement applied.
export function collide (world: World, box: Box, mx: number, my: number, mz: number, mover?: Mover, limit: Vec3Like = FULL_DEPENETRATION, report?: SweepReport): Vec3 {
  const shapes = collisionBoxes(world, box.clone().extend(mx, my, mz), mover)
  if (report) report.shapes = shapes
  return sweep(box, mx, my, mz, shapes, limit, report)
}
