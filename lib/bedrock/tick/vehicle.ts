// One tick of a vehicle the player rides. A boat the player steers is simulated as the client predicts it: the paddles,
// the friction, the turn and thrust, the move through the blocks and the buoyancy; so is a horse it steers: the charged
// jump, the turn, the walk and the fall. Any other vehicle is the server's; the player sits in it.
import { Vec3 } from 'vec3'
import { Box } from '../math/box.ts'
import { scalar } from '../math/crt.ts'
import { f } from '../math/float.ts'
import { moveWithCollisions } from '../movement/auto-step.ts'
import type { Ctx, Player, Vec3Like, XZ } from '../types.ts'
import { dismountPosition } from '../vehicle/dismount.ts'
import { applyBoatFriction, BOAT_HEIGHT, BOAT_HEIGHT_OFFSET, BOAT_WIDTH, boatControl, boatFriction, newPaddle, OUT_OF_CONTROL_LIMIT, paddleForces, paddleRowing, paddleWithForce, type Paddle } from '../vehicle/boat.ts'
import { chargeJump, mountMove, newHorseState, powerJump, turnToward, type HorseState } from '../vehicle/horse.ts'
import { frictionInfluencedSpeed, moveRelative } from '../movement/travel.ts'
import { advanceTimer, boatBuoyancy, buoyancyFloat, buoyancyFromData, buoyancyGravity, floatRequest, type Buoyancy } from '../vehicle/buoyancy.ts'
import { honeyCellsIn, honeySlide } from '../world/honey.ts'
import { applyLiquidFlow } from '../world/liquids.ts'
import { blockAt, blockFriction, blockName } from '../world/blocks.ts'
import { dragsDown } from '../world/bubble-columns.ts'
import { capMoveSpeed, clampMoveLength } from './move.ts'

// A vehicle the player rides: the server's entity, and when the player steers a boat, the boat's own state.
export interface Vehicle {
  // the vehicle's unique id (the packet names it) and kind (e.g. 'boat')
  id: number | bigint
  kind: string
  // its position (the box floor plus its height offset), velocity and rotation (degrees)
  pos: Vec3
  vel: Vec3
  // its position before its last move (the way a dismount looks first)
  posPrev?: Vec3Like | undefined
  // its collision box as the moves left it (undefined: built from the position)
  box?: Box | undefined
  yaw: number
  pitch: number
  // its buoyancy data (the entity's JSON metadata), where the caller has it
  buoyancyData?: string | undefined
  // the turn rate the mount set it off with (the link's angular velocity), taken when its simulation starts
  angularVelocity?: number | undefined
  // whether the player's client simulates it (a boat the player controls)
  predicted: boolean
  // where the rider sits, relative to the vehicle's position before its yaw
  seat: Vec3Like
  onGround?: boolean | undefined
  isCollidedHorizontally?: boolean | undefined
  isCollidedVertically?: boolean | undefined
  width?: number | undefined
  height?: number | undefined
  // the height of the position above the box's floor (a boat's 0.375 when not given)
  heightOffset?: number | undefined
  boat?: BoatState | undefined
  // the vehicle takes the rider's jump (it jumps or dashes itself, or moves up and down), and the rider is in the seat
  // that controls it: jumping does not take the rider off
  jumpControlled?: boolean | undefined
  // a steered horse's state, and the attributes it moves by: its movement speed and jump strength
  horse?: HorseState | undefined
  speed?: number | undefined
  jumpStrength?: number | undefined
}

// A predicted boat's state between ticks.
export interface BoatState {
  yRotD: number
  outOfControlTicks: number
  paddles: [Paddle, Paddle]
  localTick: number
  buoyancy: Buoyancy
  // the buoyancy data the settings were last read from
  buoyancyData?: string | undefined
}

export function newBoatState (buoyancy: Buoyancy = boatBuoyancy()): BoatState {
  return { yRotD: 0, outOfControlTicks: 0, paddles: [newPaddle(), newPaddle()], localTick: 0, buoyancy }
}

// The rider's paddling this tick: the move vector and the up key (the force the paddles are given), or the two paddle
// buttons of a touch or classic control scheme.
export interface PaddleInput { move: XZ, up: boolean, rowing?: [boolean, boolean] }

// The vehicle's box around its position.
export function vehicleBox (vehicle: Vehicle): Box {
  const w = f(f(vehicle.width ?? BOAT_WIDTH) * f(0.5))
  const floor = f(vehicle.pos.y - f(vehicle.heightOffset ?? BOAT_HEIGHT_OFFSET))
  return new Box(f(vehicle.pos.x - w), floor, f(vehicle.pos.z - w), f(vehicle.pos.x + w), f(floor + f(vehicle.height ?? BOAT_HEIGHT)), f(vehicle.pos.z + w))
}

// The paddles take the rider's input: a force from the move vector, or the rowing buttons.
export function paddle (boat: BoatState, input: PaddleInput): void {
  const tick = boat.localTick | 0
  const [left, right] = boat.paddles
  if (input.rowing) {
    paddleRowing(left, tick, input.rowing[0])
    paddleRowing(right, tick, input.rowing[1])
  } else {
    const [leftForce, rightForce] = paddleForces(input.move, input.up)
    paddleWithForce(left, tick, leftForce)
    paddleWithForce(right, tick, rightForce)
  }
  boat.localTick++
}

// The move through the blocks: capped, clamped to 16, swept (stepping up `stepHeight`: a boat none); a blocked axis stops.
export function moveVehicle (ctx: Ctx, vehicle: Vehicle, stepHeight = 0): void {
  const requested = clampMoveLength(capMoveSpeed(vehicle.vel))
  // the box is kept from tick to tick (float32 corners, as it moves); a position set from outside rebuilds it
  const box = vehicle.box ? vehicle.box.clone() : vehicleBox(vehicle)
  // the vehicle collides with the blocks only (not with itself as a solid entity)
  const blocks = { getBlock: ctx.world.getBlock.bind(ctx.world) }
  const applied = moveWithCollisions(blocks, box, requested, !!vehicle.onGround, stepHeight, false)
  const moved = new Box(f(box.minX + applied.x), f(box.minY + applied.y), f(box.minZ + applied.z), f(box.maxX + applied.x), f(box.maxY + applied.y), f(box.maxZ + applied.z))
  vehicle.box = moved
  vehicle.pos.set(f(f(moved.minX + moved.maxX) * f(0.5)), f(moved.minY + f(vehicle.heightOffset ?? BOAT_HEIGHT_OFFSET)), f(f(moved.minZ + moved.maxZ) * f(0.5)))
  const blocked = { x: applied.x !== f(requested.x), y: applied.y !== f(requested.y), z: applied.z !== f(requested.z) }
  vehicle.isCollidedHorizontally = blocked.x || blocked.z
  vehicle.isCollidedVertically = blocked.y
  vehicle.onGround = blocked.y && requested.y < 0
  vehicle.vel.set(blocked.x ? 0 : vehicle.vel.x, blocked.y ? 0 : vehicle.vel.y, blocked.z ? 0 : vehicle.vel.z)
}

// One tick of a boat the player steers. `roll` draws the big-wave chance (uniform in [0, 1)).
export function simulateBoat (ctx: Ctx, vehicle: Vehicle, input: PaddleInput, roll: () => number = Math.random): void {
  const boat = vehicle.boat ?? (vehicle.boat = { ...newBoatState(), yRotD: f(vehicle.angularVelocity ?? 0) })
  // the settings follow the entity's buoyancy data as it changes; the wave timer runs on
  if (vehicle.buoyancyData !== undefined && vehicle.buoyancyData !== boat.buoyancyData) {
    boat.buoyancy = buoyancyFromData(vehicle.buoyancyData, boat.buoyancy)
    boat.buoyancyData = vehicle.buoyancyData
  }
  vehicle.posPrev = { x: vehicle.pos.x, y: vehicle.pos.y, z: vehicle.pos.z }
  // flowing water pushes the boat, as any entity in it, before the tick's movement
  applyLiquidFlow(ctx.world, vehicle.box ?? vehicleBox(vehicle), vehicle.vel)
  paddle(boat, input)
  const friction = boatFriction(ctx.world, vehicle.pos, !!vehicle.onGround)
  const motion = { vel: vehicle.vel, yaw: vehicle.yaw, yRotD: boat.yRotD }
  applyBoatFriction(motion, friction.invFriction)
  if (friction.floating) boat.outOfControlTicks = 0
  else if (friction.resurfacing) boat.outOfControlTicks++
  if (boat.outOfControlTicks <= OUT_OF_CONTROL_LIMIT) boatControl(motion, boat.paddles, friction, scalar)
  vehicle.yaw = motion.yaw
  boat.yRotD = motion.yRotD
  moveVehicle(ctx, vehicle)
  // the blocks the moved boat is in, found over its box grown by half a block on every side
  const reach = insideReach(vehicle.box!)
  boatBubbleColumns(ctx, vehicle, reach)
  // the honey blocks it is in slow it, as any entity
  honeySlide(vehicle.vel, vehicle.pos, f(vehicle.width ?? BOAT_WIDTH), honeyCellsIn(ctx.world, reach))
  advanceTimer(boat.buoyancy, vehicle.vel, roll())
  const request = floatRequest(ctx.world, boat.buoyancy, vehicle.pos)
  if (boat.buoyancy.applyGravity) vehicle.vel.y = buoyancyGravity(vehicle.vel.y)
  vehicle.vel.y = buoyancyFloat(boat.buoyancy, request, vehicle.pos, vehicle.vel.y)
}

// The rider's input to a horse it steers: its move vector, its jump key now and last tick, and its look.
export interface HorseInput { move: XZ, jump: boolean, yaw: number, pitch: number, jumpBoost?: number | undefined }

// A horse's step up.
const HORSE_STEP = f(0.5625)

// One tick of a horse the player steers: the jump the rider charged, the turn toward its look, the walk (at the horse's
// speed on the ground, a tenth of it in the air), the move, and the fall and friction.
export function simulateHorse (ctx: Ctx, vehicle: Vehicle, input: HorseInput): void {
  const horse = vehicle.horse ?? (vehicle.horse = newHorseState())
  vehicle.posPrev = { x: vehicle.pos.x, y: vehicle.pos.y, z: vehicle.pos.z }
  chargeJump(horse, input.jump, !!horse.wasJumping)
  horse.wasJumping = input.jump
  vehicle.yaw = turnToward(vehicle.yaw, input.yaw)
  vehicle.pitch = f(input.pitch * f(0.5))
  const local = mountMove(input.move)
  const onGround = !!vehicle.onGround
  if (horse.pendingJump > 0 && onGround && !horse.jumping) {
    powerJump(vehicle.vel, vehicle.yaw, vehicle.jumpStrength ?? 0, horse.pendingJump, input.jumpBoost ?? 0, local.z > 0, false)
    horse.pendingJump = 0
    horse.jumping = true
  }
  const box = vehicle.box ?? vehicleBox(vehicle)
  const ground = blockAt(ctx.world, vehicle.pos.x, f(box.minY - 0.1), vehicle.pos.z)
  const slip = blockFriction(ground, ctx.settings.defaultSlipperiness)
  const walk = vehicle.speed ?? ctx.settings.playerSpeed
  const speed = onGround ? frictionInfluencedSpeed({ walkSpeed: walk, slipperiness: slip, onGround: true }) : f(f(walk) * f(0.1))
  moveRelative(vehicle.vel, vehicle.yaw, local.x, local.z, speed, ctx.trig)
  moveVehicle(ctx, vehicle, HORSE_STEP)
  if (vehicle.onGround && !onGround) {
    horse.jumping = false
    horse.pendingJump = 0
  }
  const friction = onGround ? f(f(slip) * f(0.91)) : f(0.91)
  vehicle.vel.set(scaleAxis(vehicle.vel.x, friction), f(f(vehicle.vel.y - f(0.08)) * f(0.98)), scaleAxis(vehicle.vel.z, friction))
}

// A velocity component slowed by friction: one of at most 2^-23 stops.
function scaleAxis (axis: number, scale: number): number {
  return f(axis * (Math.abs(axis) <= f(1.1920929e-7) ? 0 : scale))
}

// Bubble columns the moved boat is in (the cells of `box`), each with water (not air) above it: a downward one pulls
// it down 0.03 (to -0.3 at most), an upward one lifts it 0.06 (to 0.7 at most).
export function boatBubbleColumns (ctx: Ctx, vehicle: Vehicle, box: Box): void {
  for (let x = Math.floor(f(box.minX + 0.001)); x <= Math.floor(f(box.maxX - 0.001)); x++) {
    for (let y = Math.floor(f(box.minY + 0.001)); y <= Math.floor(f(box.maxY - 0.001)); y++) {
      for (let z = Math.floor(f(box.minZ + 0.001)); z <= Math.floor(f(box.maxZ - 0.001)); z++) {
        const block = blockAt(ctx.world, x, y, z)
        if (blockName(block) !== 'bubble_column' || blockName(blockAt(ctx.world, x, y + 1, z)) === 'air') continue
        const vy = vehicle.vel.y
        vehicle.vel.y = dragsDown(block) ? Math.max(f(-0.30000001), f(vy + f(-0.029999999))) : Math.min(f(0.69999999), f(vy + f(0.059999999)))
      }
    }
  }
}

// The box a boat finds the blocks it is in over: its own grown by half a block on every side.
function insideReach (box: Box): Box {
  return new Box(f(box.minX - 0.5), f(box.minY - 0.5), f(box.minZ - 0.5), f(box.maxX + 0.5), f(box.maxY + 0.5), f(box.maxZ + 0.5))
}

// Whether a jumping rider leaves the vehicle: any the client does not predict, but a boat or one that takes the jump.
export function leavesOnJump (vehicle: Vehicle): boolean {
  return !vehicle.predicted && !vehicle.kind.endsWith('boat') && !vehicle.jumpControlled
}

// The rider leaves the vehicle (the dismount button, or the server taking it off: `byRider` false): it stands at the
// dismount spot, keeping the velocity it had riding, its ground flag as riding left it, with its box rebuilt; with no
// spot it stays where it sat.
// `alpha`: the frame's progress into the next tick when the rider left; given, the rider is first seated where the
// vehicle is shown then (between its last two positions). `unlinked`: the server's link removal took it off, after the
// tick's input was read in the seat.
export function dismount (ctx: Ctx, entity: Player, byRider = true, alpha?: number, unlinked = false): void {
  const vehicle = entity.vehicle
  if (!vehicle) return
  const seat = seatPosition(vehicle)
  const eye = f(ctx.settings.eyeHeight)
  const w = f(ctx.settings.playerHalfWidth)
  const feetY = f(seat.y - eye)
  const riderBox = { minX: -w, minY: feetY, minZ: -w, maxX: w, maxY: f(feetY + f(ctx.settings.playerHeight)), maxZ: w }
  const at = dismountPosition(ctx.world, vehicle, seat, riderBox, byRider)
  if (at.standing) entity.pos.set(at.x, at.y, at.z)
  else {
    // no spot: the centre of the rider's own box (built where it was at the start of the last tick), its eye 0.001
    // above the centre plus the eye height
    const from = alpha !== undefined && vehicle.posPrev ? shownSeat(vehicle, f(alpha), eye) : entity.bedrock?.seatedAt ?? entity.pos
    const box = { minX: f(from.x - w), minY: from.y, minZ: f(from.z - w), maxX: f(from.x + w), maxY: f(from.y + f(ctx.settings.playerHeight)), maxZ: f(from.z + w) }
    const centre = (min: number, max: number): number => f(f(f(max - min) * 0.5) + min)
    const eyeY = f(f(centre(box.minY, box.maxY) + eye) + f(0.001))
    entity.pos.set(centre(box.minX, box.maxX), f(eyeY - eye), centre(box.minZ, box.maxZ))
  }
  entity.vehicle = undefined
  if (entity.bedrock) {
    entity.bedrock.aabb = undefined
    // the tick's input was read in the seat: it still reports the paddles
    if (unlinked && vehicle.predicted) entity.bedrock.leftSteeredVehicle = true
  }
}

// The rider's feet on the seat of the vehicle as shown at `alpha` of the way from its previous position to its
// position.
function shownSeat (vehicle: Vehicle, alpha: number, eye: number): Vec3Like {
  const prev = vehicle.posPrev!
  const lerp = (a: number, b: number): number => f(f(f(b - a) * alpha) + a)
  const pos = new Vec3(lerp(prev.x, vehicle.pos.x), lerp(prev.y, vehicle.pos.y), lerp(prev.z, vehicle.pos.z))
  const seat = seatPosition({ ...vehicle, pos })
  return { x: seat.x, y: f(seat.y - eye), z: seat.z }
}

// Where the rider sits: the vehicle's position plus the seat, turned by the vehicle's yaw.
export function seatPosition (vehicle: Vehicle): Vec3 {
  const radians = f(vehicle.yaw * f(0.017453292))
  const sin = f(Math.sin(radians))
  const cos = f(Math.cos(radians))
  const s = vehicle.seat
  return new Vec3(f(vehicle.pos.x + f(f(s.x * cos) - f(s.z * sin))), f(vehicle.pos.y + f(s.y)), f(vehicle.pos.z + f(f(s.x * sin) + f(s.z * cos))))
}
