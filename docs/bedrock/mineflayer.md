# Using the Bedrock engine from mineflayer

mineflayer's Bedrock support (`lib/bedrock_plugins/client_input.js` on its Bedrock branch) runs this engine as the
bot's own client: every tick it simulates the player from the bot's controls and sends the `player_auth_input` the
vanilla client would have sent. The server's movement packets go to a `BedrockSession`, which applies them the way
the client does. This page describes that integration, and how to do the same without mineflayer.

## What mineflayer builds

```js
const { Physics, PlayerState, BedrockSession } = require('prismarine-physics')

const physics = Physics(bot.registry, world)          // bot.registry is a Bedrock prismarine-registry
const session = new BedrockSession({ physics, world })

// the packets the session handles; everything else it ignores (handlePacket returns false)
for (const name of ['start_game', 'move_player', 'correct_player_move_prediction', 'set_entity_motion', 'update_attributes', 'set_entity_data']) {
  bot._client.on(name, packet => session.handlePacket(name, packet))
}
```

`Physics(registry, world)` returns the Bedrock engine because the registry's type is `bedrock`. `world` is anything
with `getBlock(vec3)` returning a prismarine-block (or `null` for air). The engine reads `name`, `boundingBox`
('block' / 'empty'), `shapes` (collision boxes relative to the cell) and, for liquids, the `liquid_depth` state.

A world may also have `solidEntityBoxes(box)`, the collision boxes of the solid entities (boats) near a box; mineflayer's
world view gives the boats it knows, except the one the bot rides.
`dolphinsNear(box)` says whether a dolphin is in a box (Dolphin's Grace); mineflayer's world view answers from the
dolphins it knows.

mineflayer's world view adds one rule: a block of a column that has not loaded yet is solid below the player's feet
and air at or above them. A player teleported ahead of its chunks then stands where it landed, as the client's does,
instead of falling through.

## Every tick

```js
// 1. the player: mineflayer's PlayerState (bot.entity, the controls, effects, abilities, inventory)
const state = new PlayerState(bot, { ...bot.controlState })

// 2. one tick: the packets due now, then the simulation; the session keeps the tick for later corrections
session.tick(state, { t: tick, control: state.control, yaw: state.yaw, pitch: state.pitch })

// 3. back onto the bot (position, velocity, flags, and bot.bedrockPhysicsState, the engine's own state)
state.apply(bot)
bot.emit('physicsTick')

// 4. the packet: the engine's fields plus the tick and the version's presence flags
const packet = { ...physics.playerAuthInput(state), tick, ...presenceFlags }
bot._client.queue('player_auth_input', packet)
```

- `input_data` comes as a list of flag names. Versions before 1.26.51 carry it as a bitset: bedrock-protocol takes
  an object of `{ name: true }` there (`Object.fromEntries(list.map(n => [n, true]))`).
- `presenceFlags` are the `*_presence` fields some versions' schema adds (1.26.40 to 1.26.45); read them from
  `bot.registry.protocol`.
- The session re-simulates past ticks from its own copies of the state, so the fields the engine writes (`pos`,
  `vel`, the ground and collision flags, `elytraFlying`, `jumpTicks`, `fireworkRocketDuration`, `bedrock`,
  `attributes`) must stay the engine's between ticks. mineflayer keeps one `PlayerState` and refreshes only the other
  fields from the bot each tick; it takes the player from the bot again only when something else changed what the
  last tick wrote (a respawn, a plugin moving the bot).

### The tick number

The server matches each input to its own tick and drops inputs outside its rewind window
(`start_game.rewind_history_size`). mineflayer anchors to `start_game.current_tick` and counts wall-clock time from
there in 50 ms steps, simulating one step per elapsed tick (a timer never fires at exactly 20 Hz). A movement
correction's tick moves the anchor forward if the bot has fallen behind, never back.

For tests and replays, `createBot({ ..., physicsTicks: 'manual' })` (or a client with `manualTicks: true`) turns the
timer off; `bot.bedrockTick(tick)` then runs exactly one tick and queues its packet.

## What the engine reads from the player

`PlayerState` fills these from the bot; a caller without mineflayer sets them on any object of the same shape.

| Field | Meaning |
|---|---|
| `pos`, `vel` | feet position and velocity (Vec3); the velocity is reported after friction, like the packet's `delta` |
| `onGround`, `isInWater`, `isInLava`, `isInWeb`, `isCollidedHorizontally`, `isCollidedVertically` | written by the engine |
| `yaw`, `pitch` | mineflayer radians; `bedrockYaw` / `bedrockPitch` (degrees: yaw 0 faces +z, pitch > 0 looks down) override them |
| `control` | `forward back left right jump sneak sprint` are the key levels; `raw` any other key bit (`ascend`, `descend`, `wantUpSlow`, `sneakToggleDown`, the diagonals, the jump/sneak edges); `analogMoveVector` a stick `{x, z}`; `moveVector` an already cooked move |
| `jumpTicks`, `jumpQueued` | the jump cooldown, and a jump pressed since the last tick |
| `attributes['minecraft:movement']` | the walking speed: `{ base, current }` (`current` includes the sprint boost) |
| `speed`, `slowness`, `jumpBoost`, `levitation`, `slowFalling`, `blindness`, `weaving` | effect levels (amplifier + 1; 0 = none). mineflayer keys `bot.entity.effects` by Bedrock's wire ids: speed 1, slowness 2, jump boost 8, blindness 15, levitation 24, slow falling 27, weaving 33 |
| `flying`, `mayFly`, `flyIntent`, `flySpeed`, `verticalFlySpeed` | the flying ability and the permission to toggle it; `flyIntent` defaults to `flying` |
| `noClip` | the no-clip ability: the move passes through everything |
| `gameMode` | `'creative'` hovers harder; `'spectator'` always stands and is in no block's effect |
| `elytraEquipped`, `elytraFlying`, `fireworkRocketDuration` | gliding; `elytraFlying` is the engine's own decision, and a change by the caller (the server's gliding flag) is taken |
| `depthStrider`, `swiftSneak`, `soulSpeed` | enchantment levels |
| `vehicle` | the vehicle the bot rides (mineflayer's vehicles plugin keeps it as `bot.bedrockVehicle` from `set_entity_link`): its unique id, kind, position, velocity, rotation, seat, and `predicted` for a boat the bot drives; `bot.dismount()` leaves it at once and `physics.dismount(state)` stands the bot beside it, and the entity of a boat the bot drives follows the prediction, so the boat the bot steps off is where it left it |
| `fireworkUsed` | a firework rocket used this tick (consumed by the tick; `PlayerState` reads `bot.fireworkUsed`, which mineflayer's `activateItem` sets): gliding, the glide boosts for 20 ticks unless a longer boost runs |
| `riptideLaunch`, `spinHits` | a riptide launch this tick (the released trident's Riptide level: the caller decides the release counts, charged 10 ticks in water) and the mobs the spin hit this tick; both consumed by the tick. `PlayerState` reads them from `bot.riptideLaunch` / `bot.spinHits`, and a session frame can carry them so a replayed tick launches again |
| `usingItem`, `food`, `immobile`, `instabuild` | item use slows and stops sprinting; a food level of 6 or less stops sprinting; an immobile player does not move |
| `bedrock` | the engine's own state (`bot.bedrockPhysicsState`); leave it to the engine |

## The server's packets

`session.handlePacket(name, params)` takes packets as bedrock-protocol decodes them and returns whether it used
them:

| Packet | Effect (at the start of the next tick) |
|---|---|
| `start_game` | the local player's runtime id, and the history size |
| `move_player` (local player) | a teleport: position (the packet's y is the eye), rotation, ground flag; the next packet reports `handled_teleport`; a teleport of 16 blocks or more starts the history over |
| `correct_player_move_prediction` (player) | installed on its tick, the ticks since simulated again; dropped when it agrees with what the player had on that tick |
| `set_entity_motion` (local player) | a knockback: the velocity, set live; a stamped one is also installed on its tick and the ticks since simulated again |
| `update_attributes` (local player) | the movement attribute; the last of several received together wins |
| `movement_effect` (local player) | the glide boost: installed on its tick with the ticks since simulated again when it turns the boost on or off, else its ticks left, aged from its tick |
| `set_entity_data` (local player) | the restated sprinting / sneaking / swimming / gliding / crawling flags, the push toward free space and the box height, where they differ from that tick |

The same actions are available directly (`session.teleport`, `session.correct`, `session.motion`,
`session.movementAttribute`, `session.actorFlags`) and as single-player writes on the physics object
(`physics.handleTeleport`, `physics.applyCorrection`, `physics.applyMotion`, `physics.setMovementAttribute`,
`physics.setActorFlags`) for a caller that tracks ticks itself.

## Without mineflayer

```js
const { Physics } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const registry = require('prismarine-registry')('bedrock_1.26.20')

const physics = Physics(registry, world)
const player = { pos: new Vec3(0.5, 64, 0.5), vel: new Vec3(0, 0, 0), onGround: true, jumpTicks: 0, control: { forward: true } }
for (let t = 0; t < 20; t++) {
  physics.simulatePlayer(player, world)
  const packet = physics.playerAuthInput(player) // position (eye), delta, move vectors, input_data, ...
}
```

## Checking an integration

mineflayer's `test/bedrock/replay.test.js` replays whole recorded sessions (every packet the server sent, every
input the vanilla client sent) through a real `createBot` with manual ticks, and counts the ticks whose input packet
the bot reproduces exactly. It is the end-to-end check that the bot, the world view, the session and the engine
agree with the client.
