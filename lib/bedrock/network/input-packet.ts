// The player_auth_input packet the client sends after each tick, built from the simulated player.
import { f } from '../math/float.ts'
import { directionFromRotation, pitchOf, yawOf } from '../math/rotation.ts'
import type { Player } from '../types.ts'

// The packet's input flags by bit number, in bedrock-protocol's names. Up to 1.26.20 the wire carries them as a
// bitset, from 1.26.51 as the list of set bit numbers; the numbering is the same.
export const INPUT_FLAGS = [
  'ascend', 'descend', 'north_jump', 'jump_down', 'sprint_down', 'change_height', 'jumping', 'auto_jumping_in_water',
  'sneaking', 'sneak_down', 'up', 'down', 'left', 'right', 'up_left', 'up_right', 'want_up', 'want_down',
  'want_down_slow', 'want_up_slow', 'sprinting', 'ascend_block', 'descend_block', 'sneak_toggle_down', 'persist_sneak',
  'start_sprinting', 'stop_sprinting', 'start_sneaking', 'stop_sneaking', 'start_swimming', 'stop_swimming',
  'start_jumping', 'start_gliding', 'stop_gliding', 'item_interact', 'block_action', 'item_stack_request',
  'handled_teleport', 'emoting', 'missed_swing', 'start_crawling', 'stop_crawling', 'start_flying', 'stop_flying',
  'received_server_data', 'client_predicted_vehicle', 'paddling_left', 'paddling_right',
  'block_breaking_delay_enabled', 'horizontal_collision', 'vertical_collision', 'down_left', 'down_right',
  'start_using_item', 'camera_relative_movement_enabled', 'rot_controlled_by_move_direction', 'start_spin_attack',
  'stop_spin_attack', 'hotbar_only_touch', 'jump_released_raw', 'jump_pressed_raw', 'jump_current_raw',
  'sneak_released_raw', 'sneak_pressed_raw', 'sneak_current_raw'
] as const

// A snake_case flag name in camelCase.
export function camelCase (name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

// The same flags in camelCase, by bit number, and the bit of each.
export const INPUT_FLAG_NAMES: readonly string[] = INPUT_FLAGS.map(camelCase)
// The bit number of each camelCase flag name.
export const INPUT_FLAG_BITS: ReadonlyMap<string, number> = new Map(INPUT_FLAG_NAMES.map((name, bit) => [name, bit]))

// The input flags of the tick just simulated, as camelCase names: the raw key bits, the input's derived bits, the
// start / stop actions the tick raised, the move's collision flags, and the constant a keyboard-and-mouse client sets.
export function inputFlags (entity: Player): Set<string> {
  const st = entity.bedrock || {}
  const keys = st.keys
  const input = st.input
  const bits: Record<string, boolean | undefined> = {
    ascend: keys?.ascend,
    descend: keys?.descend,
    jumpDown: keys?.jumpDown,
    sprintDown: keys?.sprintDown,
    changeHeight: keys?.changeHeight,
    sneakDown: keys?.sneakDown,
    up: keys?.up,
    down: keys?.down,
    left: keys?.left,
    right: keys?.right,
    upLeft: keys?.upLeft,
    upRight: keys?.upRight,
    downLeft: keys?.downLeft,
    downRight: keys?.downRight,
    wantDownSlow: keys?.wantDownSlow,
    wantUpSlow: keys?.wantUpSlow,
    ascendBlock: keys?.ascendBlock,
    descendBlock: keys?.descendBlock,
    sneakToggleDown: keys?.sneakToggleDown,
    jumpReleasedRaw: keys?.jumpReleased,
    jumpPressedRaw: keys?.jumpPressed,
    jumpCurrentRaw: keys?.jumpCurrent,
    sneakReleasedRaw: keys?.sneakReleased,
    sneakPressedRaw: keys?.sneakPressed,
    sneakCurrentRaw: keys?.sneakCurrent,
    jumping: input?.jumping,
    sneaking: input?.sneaking,
    sprinting: input?.sprinting,
    wantUp: input?.wantUp,
    wantDown: input?.wantDown,
    horizontalCollision: entity.isCollidedHorizontally,
    verticalCollision: entity.isCollidedVertically,
    blockBreakingDelayEnabled: true
  }
  const flags = new Set<string>()
  for (const [name, value] of Object.entries(bits)) if (value) flags.add(name)
  for (const action of st.actions || []) flags.add(action)
  return flags
}

const NO_INPUT = { move: { x: 0, z: 0 }, rawMove: { x: 0, z: 0 }, analog: { x: 0, z: 0 } }

// The packet, in bedrock-protocol's field names (the caller adds `tick` and, where the version has them, the presence
// flags). The position is the eye position, `delta` the velocity after friction, the rotation the tick's; the camera
// orientation is the look direction (the client's camera follows it within 1e-3), the head yaw the yaw.
export function buildPlayerAuthInput (entity: Player, eyeHeight = 1.6200100183486938): Record<string, unknown> {
  const yaw = yawOf(entity)
  const pitch = pitchOf(entity)
  const input = entity.bedrock?.input || NO_INPUT
  const view = directionFromRotation(pitch, yaw)
  const vehicle = entity.vehicle
  if (vehicle && vehicle.predicted) {
    // in a vehicle it simulates, the client reports the vehicle: its position and velocity, its rotation and its id;
    // the collision flags stay the rider's own, as it last moved itself
    const packet = buildPlayerAuthInput({ ...entity, vehicle: undefined }, eyeHeight)
    ;(packet.input_data as string[]).push('client_predicted_vehicle')
    // the driver's left and right keys are the paddle buttons (forward paddles nothing)
    const keys = vehicle.kind.endsWith('boat') ? entity.bedrock?.keys : undefined
    if (keys?.left) (packet.input_data as string[]).push('paddling_left')
    if (keys?.right) (packet.input_data as string[]).push('paddling_right')
    return {
      ...packet,
      position: { x: f(vehicle.pos.x), y: f(vehicle.pos.y), z: f(vehicle.pos.z) },
      delta: { x: f(vehicle.vel.x), y: f(vehicle.vel.y), z: f(vehicle.vel.z) },
      vehicle_rotation: { x: f(vehicle.pitch), z: f(vehicle.yaw) },
      predicted_vehicle: BigInt(vehicle.id)
    }
  }
  return {
    pitch,
    yaw,
    position: { x: f(entity.pos.x), y: f(f(entity.pos.y) + f(eyeHeight)), z: f(entity.pos.z) },
    move_vector: { x: input.move.x, z: input.move.z },
    head_yaw: yaw,
    input_data: [...inputFlags(entity)].map(name => INPUT_FLAGS[INPUT_FLAG_BITS.get(name)!]).filter(Boolean),
    input_mode: 'mouse',
    play_mode: 'screen',
    interaction_model: 'touch',
    interact_rotation: { x: pitch, z: yaw },
    delta: { x: f(entity.vel.x), y: f(entity.vel.y), z: f(entity.vel.z) },
    analogue_move_vector: { x: input.analog.x, z: input.analog.z },
    camera_orientation: { x: view.x, y: view.y, z: view.z },
    raw_move_vector: { x: input.rawMove.x, z: input.rawMove.z }
  }
}
