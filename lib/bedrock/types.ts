// The shapes the engine works on. A player is mineflayer's PlayerState (or anything shaped like it): feet position,
// velocity, the ground and collision flags, the control state, and `bedrock`, the per-player state the engine keeps
// between ticks.
import type { Vec3 } from 'vec3'
import type { Box, BoxLike } from './math/box.ts'
import type { Trig } from './math/crt.ts'
import type { Vec3Like } from './math/rotation.ts'
import type { Vehicle } from './tick/vehicle.ts'

export type { Vec3Like }

// A horizontal vector (x = left, z = forward for a move).
export interface XZ { x: number, z: number }

// A collision box relative to its cell: min x, y, z, then max x, y, z.
export type Shape = readonly [number, number, number, number, number, number]

// A block as prismarine-block gives it. `shapes` are the collision boxes relative to the cell, `boundingBox` is
// 'block' or 'empty'.
export interface Block {
  name: string
  type?: number | undefined
  boundingBox?: string | undefined
  shapes?: Shape[] | undefined
  // the liquid in the cell's second layer (a waterlogged block's water), where the world carries it
  liquid?: Block | null | undefined
  getProperties?: () => Record<string, unknown>
  _properties?: Record<string, unknown> | undefined
}

// The blocks the engine reads: the block at an integer cell, or null / undefined for air.
export interface World {
  getBlock (pos: Vec3): Block | null | undefined
  // the collision boxes of the solid entities (boats) near a box, which the player collides with like blocks
  solidEntityBoxes? (query: BoxLike): BoxLike[]
  // whether a dolphin is in a box (Dolphin's Grace)
  dolphinsNear? (query: BoxLike): boolean
  // whether the column at a position has loaded: a player teleported to one that has not waits there for it
  loaded? (pos: Vec3Like): boolean
}

// The raw key bits beyond mineflayer's booleans, and the six jump / sneak edge bits (derived from the key levels when
// not given).
export interface RawKeys {
  up?: boolean
  down?: boolean
  left?: boolean
  right?: boolean
  jumpDown?: boolean
  sneakDown?: boolean
  sprintDown?: boolean
  ascend?: boolean
  descend?: boolean
  changeHeight?: boolean
  wantUpSlow?: boolean
  wantDownSlow?: boolean
  ascendBlock?: boolean
  descendBlock?: boolean
  sneakToggleDown?: boolean
  upLeft?: boolean
  upRight?: boolean
  downLeft?: boolean
  downRight?: boolean
  jumpPressed?: boolean
  jumpReleased?: boolean
  jumpCurrent?: boolean
  sneakPressed?: boolean
  sneakReleased?: boolean
  sneakCurrent?: boolean
}

// The control state: mineflayer's key booleans, plus the optional raw bits, an analog stick (x = left, z = forward)
// and an already cooked move vector that bypasses the input cook.
export interface Control {
  forward?: boolean | undefined
  back?: boolean | undefined
  left?: boolean | undefined
  right?: boolean | undefined
  jump?: boolean | undefined
  sneak?: boolean | undefined
  sprint?: boolean | undefined
  raw?: RawKeys | undefined
  analogMoveVector?: Partial<XZ> | undefined
  moveVector?: Partial<XZ> | undefined
  // the client keeps the sneak key held through an input clear (a gamepad's toggle sneak); the packet reports it
  persistSneak?: boolean | undefined
  // a screen is open (a menu, the inventory): the client clears the tick's input
  screen?: boolean | undefined
  // the input device the packet reports: 'mouse' (keyboard and mouse, the default), 'touch', 'game_pad'
  inputMode?: string | undefined
}

// Every raw key bit of one tick, levels and edges.
export type Keys = Required<RawKeys>

// The input of one tick after cooking: the keys, the move vector (x = left, z = forward, sneak-scaled), the raw
// direction before the sneak scale, the stick, and the flags derived from the keys.
export interface CookedInput {
  keys: Keys
  move: XZ
  rawMove: XZ
  analog: XZ
  direction: XZ
  sprinting: boolean
  sneaking: boolean
  jumping: boolean
  wantUp: boolean
  wantDown: boolean
  persistSneak: boolean
  inputMode: string
}

// What a player climbs.
export type ClimbableKind = 'ladder' | 'vine' | 'scaffolding' | 'powder_snow'

// The blocks that slow a move while the player is inside them (cobweb is `web`).
export type SlowdownBlock = 'powder_snow' | 'web' | 'sweet_berry_bush'

// The engine's own per-player state, kept on `entity.bedrock` between ticks.
export interface BedrockState {
  // the float32 collision box; the position is derived from it
  aabb?: Box | undefined
  // the box's height, and the position it was last built or moved to (a position that differs means something
  // else moved the player and the box is rebuilt)
  height?: number | undefined
  anchor?: Vec3 | undefined
  // the pose's box height, once a pose was taken or the server sent one
  poseHeight?: number | undefined

  keys?: Keys | undefined
  input?: CookedInput | undefined
  // the start / stop events this tick raised (the input packet's action flags)
  actions?: Set<string> | undefined

  // the player's pose and movement flags
  sprinting?: boolean | undefined
  sneaking?: boolean | undefined
  swimming?: boolean | undefined
  // whether the last tick was spent in a vehicle, and where the rider was at its start
  riding?: boolean | undefined
  seatedAt?: Vec3Like | undefined
  crawling?: boolean | undefined
  gliding?: boolean | undefined
  // the glide flag as the engine last wrote it to entity.elytraFlying, to notice a caller's change
  glideMirror?: boolean | undefined
  // whether the movement attribute carries the sprint boost
  sprintBoost?: boolean | undefined

  // sprint trigger: started from the sprint key (not a double tap), and the double-tap window
  sprintingOnInput?: boolean | undefined
  sprintTriggerTime?: number | undefined
  // fly trigger: the double-tap window and the key that opened it
  jumpTriggerTime?: number | undefined
  flyTriggerSource?: number | undefined
  // ticks spent gliding
  fallFlyTicks?: number | undefined

  // the previous tick's input, as the triggers read it
  wasJumping?: boolean | undefined
  wasChangeHeight?: boolean | undefined
  wasSneaking?: boolean | undefined
  wasRunning?: boolean | undefined
  // the jumping flag of the previous tick, and whether jump was held
  jumpingFlag?: boolean | undefined
  jumpHeld?: boolean | undefined

  // the swim pose amount (0..1), the eye under water, the look direction of the tick
  poseAmount?: number | undefined
  headInWater?: boolean | undefined
  // the block at the eye is a liquid, whatever its level (what the swim steering reads)
  breathingInLiquid?: boolean | undefined
  // how far the eye sits below the standing eye height: eased half-way each tick toward the pose's, and read by the
  // eye checks as it was before the last easing
  eyeOffset?: number | undefined
  eyeOffsetPrev?: number | undefined
  // how far the player has fallen since it last stood, swam, climbed or flew
  fallDistance?: number | undefined
  // the ticks until the next look for dolphins, and the boost one gave (ticks left; -1 without end)
  dolphinScanTimer?: number | undefined
  dolphinBoost?: number | undefined
  // the riptide spin, and the ticks it has run
  spinning?: boolean | undefined
  spinTicks?: number | undefined
  view?: Vec3Like | undefined

  climbable?: ClimbableKind | null | undefined
  scaffoldDescend?: boolean | undefined
  // the ticks a gamepad has held the sneak toggle over scaffolding
  scaffoldDropHeld?: number | undefined
  wasInWater?: boolean | undefined
  wasInLava?: boolean | undefined
  // a teleport was handled since the last tick; and one a rewind simulated through since (still reported handled, but
  // the tick runs in full)
  teleported?: boolean | undefined
  teleportSimulatedThrough?: boolean | undefined
  // the actions ticks a rewind simulated again raised that they had not: reported with the next tick
  // the climbable-block flag the server restated since the last tick (false: a scaffolding climb does not rise; true
  // outside a climbable: a jump rises 0.15 instead)
  ascendRestated?: boolean | undefined
  scaffoldRestated?: boolean | undefined
  // the climbable-block flag as the client's own check left it after the tick's move
  ascendable?: boolean | undefined
  // the same check of the layer under the feet (a block to descend through), and whether the player descends through
  // powder snow this tick (the sneak of the tick before over it)
  overDescendable?: boolean | undefined
  descendingSnow?: boolean | undefined
  carriedActions?: Set<string> | undefined
  // left a vehicle it steered since the last tick (the tick's input was read in the seat)
  leftSteeredVehicle?: boolean | undefined
  // the teleport pending is a respawn's (it reports no handled teleport)
  respawned?: boolean | undefined
  // the rider jumped in a vehicle that does not take the jump: it asks to leave (the caller dismounts it)
  leaveVehicle?: boolean | undefined
  // the flying ability as the client holds it (its own toggle), and the server's flag it last saw
  flying?: boolean | undefined
  serverFlying?: boolean | undefined
  // the hover's friction override while flying
  flightFrictionOverride?: number | undefined
  // the landing tick's bounce: the fall speed before the collision and what the sweep moved
  bounce?: { pre: number, post: number } | null | undefined
  // the slowdown blocks the box overlapped at the end of the previous tick
  pendingSlowdowns?: Set<SlowdownBlock> | undefined
  // the depenetration state (movement/depenetration.ts), and the server's request to push toward free space
  depenetrationBits?: number | undefined
  pushTowardsClosestSpace?: boolean | undefined
  // the move asked of the collision sweep, and the position before it (the sprint's wall test)
  lastRequested?: Vec3Like | undefined
  lastPos?: Vec3Like | undefined
}

// An attribute as the player carries it: the value without the sprint boost (`base`) and with it (`current`); `default`
// / `value` are read when those are missing.
export interface AttributeValue {
  base?: number | undefined
  default?: number | undefined
  current?: number | undefined
  value?: number | undefined
}

// The player as the engine simulates it: mineflayer's PlayerState shape. Everything but the position and the
// velocity is optional and defaults to a survival player on foot.
export interface Player {
  pos: Vec3
  vel: Vec3
  onGround?: boolean | undefined
  isInWater?: boolean | undefined
  isInLava?: boolean | undefined
  isInWeb?: boolean | undefined
  isCollidedHorizontally?: boolean | undefined
  isCollidedVertically?: boolean | undefined
  isSwimming?: boolean | undefined
  elytraFlying?: boolean | undefined
  elytraEquipped?: boolean | undefined
  jumpTicks?: number | undefined
  jumpQueued?: boolean | undefined
  fireworkRocketDuration?: number | undefined
  yaw?: number | undefined
  pitch?: number | undefined
  bedrockYaw?: number | undefined
  bedrockPitch?: number | undefined
  control?: Control | undefined
  attributes?: Record<string, AttributeValue> | undefined
  // the flying ability, the fly intent (the double-tap toggle; defaults to the ability) and the fly speeds
  flying?: boolean | undefined
  flyIntent?: boolean | undefined
  flySpeed?: number | undefined
  verticalFlySpeed?: number | undefined
  mayFly?: boolean | undefined
  // the no-clip ability: the move passes through everything
  noClip?: boolean | undefined
  instabuild?: boolean | undefined
  gameMode?: string | undefined
  immobile?: boolean | undefined
  food?: number | undefined
  usingItem?: boolean | undefined
  // effect levels (0 = none) and enchantment levels
  speed?: number | undefined
  slowness?: number | undefined
  jumpBoost?: number | undefined
  levitation?: number | undefined
  slowFalling?: number | undefined
  blindness?: number | undefined
  depthStrider?: number | undefined
  swiftSneak?: number | undefined
  // Soul Speed on the boots (soul sand does not slow the player), and the Weaving effect (cobweb slows it less)
  soulSpeed?: number | undefined
  weaving?: number | undefined
  // leather boots on (powder snow holds the player up and can be climbed)
  leatherBoots?: boolean | undefined
  // the vehicle the player rides (tick/vehicle.ts), and the draw a predicted boat's big wave takes (uniform in [0, 1))
  vehicle?: Vehicle | undefined
  bigWaveRoll?: () => number
  // the client's core random state (math/mt19937.ts), where the caller has it: a boat's big-wave roll is drawn from it
  randomState?: Uint8Array | undefined
  // a riptide launch this tick (the trident's Riptide level; consumed by the tick), and the mobs the spin hit this tick
  riptideLaunch?: number | undefined
  spinHits?: number | undefined
  // a firework rocket used this tick (consumed by the tick)
  fireworkUsed?: boolean | undefined
  // an item use started this tick (consumed by the tick; `usingItem` holds while it lasts)
  itemUseStarted?: boolean | undefined
  // a swing at nothing this tick (consumed by the tick): the packet's missed_swing
  missedSwing?: boolean | undefined
  lastOnGround?: boolean | undefined
  bedrock?: BedrockState | undefined
}

// A player whose engine state exists (every tick creates it first).
export type Simulated = Player & { bedrock: BedrockState }

// The tunables: public on the physics object, read by the tick.
export interface Settings {
  gravity: number
  slowFallingGravity: number
  airdrag: number
  playerSpeed: number
  sprintSpeed: number
  sneakSpeed: number
  stepHeight: number
  playerHalfWidth: number
  playerHeight: number
  eyeHeight: number
  jumpVelocity: number
  sprintJumpBoost: number
  defaultSlipperiness: number
  airborneInertia: number
  airborneAcceleration: number
  airborneSprintAcceleration: number
  waterInertia: number
  waterSprintInertia: number
  lavaInertia: number
  liquidAcceleration: number
  waterGravity: number
  lavaGravity: number
  outOfLiquidImpulse: number
  ladderMaxSpeed: number
  ladderClimbSpeed: number
  scaffoldingClimbSpeed: number
  autojumpCooldown: number
  flySpeed: number
  verticalFlySpeed: number
  bubbleColumnSurfaceDrag: BubbleDrag
  bubbleColumnDrag: BubbleDrag
  velocityEpsilon: number
  movementSpeedAttribute: string
}

// How a bubble column moves the vertical velocity: down by `down` to at least `maxDown`, or up by `up` to at most
// `maxUp`.
export interface BubbleDrag { down: number, maxDown: number, up: number, maxUp: number }

// What a tick step reads besides the player: the tunables, the version's rules and the world.
export interface Ctx {
  settings: Settings
  // the travel's sine / cosine routines of the version
  trig: Trig
  // from 1.26.20: a slow landing on slime does not bounce, and the landing tick's gravity is corrected for the bounce
  bounceCorrection: boolean
  // from 1.26.20: a held jump in scaffolding climbs while the climbable-block flag the last move left is on
  scaffoldingClimbFlag: boolean
  world: World
}
