# Bedrock physics: coverage

What the engine reproduces, and what it does not yet. Everything under "Modelled" is checked against the client:
by the recorded sessions (`test/bedrock/fixtures.test.js`), the recorded client cases (`test/bedrock/golden.test.ts`)
or the shared rewind cases (`test/bedrock/rewind-parity.test.js`); see [Testing](testing.md).

## Modelled

**Input and pose**

- raw keys and analogue sticks cooked into the move vector; the input flags of `player_auth_input`
- a gamepad: the stick, the input mode the packet reports, and the toggle sneak, which the client keeps held through
  an input clear and reports as `persist_sneak`
- a screen open (a menu, the inventory) clears the tick's input: no move and no want up, want down or jumping, the
  sneaking and sprinting of the tick before standing
- sprint: the key, the double tap, the hunger and riding limits, stopping on a wall or a slow move, the server's
  restated sprint flag
- using an item (eating, drinking, drawing a bow, charging a trident) scales the move to 0.1225 and stops a sprint;
  the packet marks its start
- sneak, crawl and swim poses, with the room above checked before standing up; the swim pose amount
- flight: the double-tap toggle, hover, the up and down speeds, the creative glide lift; the fly speed attribute
- elytra gliding, with firework boosts: the client's own 20 from the use, then the server's `movement_effect` installed
  on its tick; the boost counts down two a tick (the server's 54 boosts 27 ticks)
- the riptide spin: the launch along the look, the horizontal pose, and its end on a hit, a wall, landing or after 19
  ticks (the caller reports the launch and the hits)

**Travel**

- ground, air, water, lava and flying travel speeds; Speed and Slowness through the movement attribute; the speed in
  water and in lava from their own movement attributes (`minecraft:underwater_movement`, `minecraft:lava_movement`),
  0.02 unless the server changes them
- Depth Strider in water; Soul Speed on soul sand
- Dolphin's Grace: a swimming player looks for dolphins every 60 ticks of swimming, the first after 60 (the world's
  `dolphinsNear`), and one within 5 blocks doubles its swim speed for 60 ticks, without the Depth Strider drag
- the jump: cooldown, Jump Boost, honey, powder snow, the sprint push, rising in liquids, the swim pose hold
- swimming toward the look, the water sink when wanting down
- sliding down the side of a honey block: 0.4 of the horizontal velocity and a fall of at most 0.12 per block, the
  fall distance reset
- ladders, vines and scaffolding: the fall clamp, climbing on jump or while pushing into the wall, descending on sneak; from
  1.26.20 a held jump in scaffolding climbs while the climbable-block flag the last move left is on (before, a move about
  to cross into a cell without scaffolding stopped it); a sneak in scaffolding does not descend on the tick after the server
  restates its scaffolding flags cleared
- leaving a liquid over a ledge

**The move**

- the float32 collision sweep (Y, then X, then Z) with depenetration of overlapping blocks, and the server's
  push-towards-closest-space flag
- no-clip (the ability a spectator has): the move passes through everything; a spectator is in no block's effect
- stepping up to 0.5625; the sneak edge; the 500 speed cap and the 16-block move clamp
- cobweb (less with Weaving), powder snow and sweet berry bushes; powder snow holds up and is climbed in leather boots,
  and catches a fall of more than 2.5 on its 0.9 high box (the fall distance tracked as the client counts it); in
  leather boots it is climbed at 0.15, and the sneak of the tick before descends through it at 0.15 (a sneak pressed as
  the player lands on it still lands)
- the climbable-block flag the server restates, weighed against the client's own check of the block at the feet: set,
  a jump beside scaffolding rises 0.15 (with a 10 tick wait) instead of jumping
- the landing bounce: slime and beds, and the landing tick's gravity correction from 1.26.20

**After the move**

- gravity, Slow Falling, Levitation and the per-travel drag and friction; a Levitation that arrives late takes effect
  from the tick after its stamp, and before 1.26.51 from no earlier than 4 ticks before the current one
- the push of flowing water and lava; bubble columns up and down
- standing on slime or honey

**Vehicles and solid entities**

- a boat the player steers, as the client predicts it: the paddles from the move vector, the friction of what it is
  in or on, the turn and thrust, the move, and the buoyancy on water; the packet reports the boat
- a tamed, saddled horse, donkey or mule the player steers, as the client predicts it: the jump the rider charges by
  holding jump (from its second tick held; 0.4 to 1 of the horse's jump strength, with 0.4 of it forward when moving),
  the turn toward the rider's look (wrapped in float32), the walk at the horse's speed on the ground and a tenth of it
  in the air, sideways at half and backward at a quarter; the packet reports the horse
- sitting in any other vehicle (minecart, pig, camel, strider, an untamed horse): the server moves it; jumping in one
  that does not take the jump (a camel dashes, a tamed horse leaps) asks to leave it, and the rider stands and jumps
  the next tick
- boats are solid to a player on foot: it stands on them, and one it is inside is only pushed out 0.1 at most
- vehicle corrections from the server, installed in the history like the player's
- the dismount (`physics.dismount`): the rider stands at the first free spot beside its vehicle, the sides of the
  way it moved first, on the floor there, at rest

**Server packets**

- the game type the client holds: its own from `start_game` and `set_player_game_type`, the world's (`start_game`,
  `set_default_game_type`) where its own is the default; a `/gamemode`'s `update_player_game_type` changes nothing for
  the local player (a player switched to creative that way hovers as a survival player)
- movement corrections and teleports, installed in the tick history and simulated forward
- the respawn: a new player at the spawn, at rest, standing and full size, whose first tick falls without moving;
  what the server sent the player that died and the session has not run yet (a knockback stamped before the death) is
  dropped, and the history starts over
- movement attributes, with effect modifiers
- restated actor flags
- knockback (`set_entity_motion`)
- the glide boost (`movement_effect`)

## Not modelled yet

What the client does and the engine does not, found by comparing the engine with the client's own systems and by
replaying every recorded session. A server running authoritative movement corrects the player on these; the engine
then continues from the correction.

**Mounts**

- a horse's rearing (it stands after a jump, and a standing horse takes no move)
- where the rider of a vehicle the server moves sits between the server's positions: the seat turns and moves with the
  vehicle as the client shows it at the tick, but not as far as the frame the client renders when it runs the tick (a
  part of the next interpolation step), nor with a rearing horse's lean
- the rider's yaw clamped to its vehicle's

**Boats**

- the wave phase: the bobbing timer runs from the boat's spawn and a random draw makes the big waves, from a
  generator other things draw from too. A replay takes the draw from the client's random state in the capture (and is
  exact); a live bot does not know that state, so its height drifts from the server's within a few hundredths

**Attributes and entity data**

- the `friction_modifier`, `air_drag_modifier` and `bounciness` attributes and the uniform air drag flag, which the
  client applies to ground friction, air drag and landings (vanilla keeps them at 1, 1 and 0; flight already takes
  the first two from the caller)
- entity data other than the flags and the box height

**Chunks, death and loading**

- a chunk the client has not loaded is a wall: the collision adds a full-height box for each such column within half a
  chunk of the move, and a move next to one keeps its horizontal velocity when it is blocked. Which chunks count is
  the client's own state (a chunk is not loaded until its sub-chunks are built), not something the packets tell, so
  a bot's world cannot follow it tick for tick; the engine collides with the blocks it has and nothing else
- a dead player sends no input until the server's respawn marks it ready (the caller's to hold back)
- the loading screen of a dimension change: its ability layer and the ticks that send no input

**Input**

- touch input, and what a gamepad or touch changes beyond the stick, the toggle sneak and the input mode (the
  scaffolding descend hold, their sprint trigger and paddles)
- `missed_swing`: the flag a swing at nothing sets; the caller has no way to ask for it yet
- the prediction-sync packet a client sends some time after a correction

## Where the replays still differ

Every recording below is replayed through a full mineflayer bot (`test/bedrock/replay.test.js` in mineflayer), tick by
tick against the client's packets. Of the 246,429 ticks the client captured on 1.26.20.4 and 1.26.51.1, these differ:

| Recording | Differs | Why |
|---|---|---|
| elytra, 1.26.20.4 | 76 of 2673 | gliding at 15 blocks a tick into chunks the client had not loaded: most stop at their walls (see above); 20 are `missed_swing` |
| ground, 1.26.51.1 | 20 of 3264 | `sprintYaw_91_20t` (18) and `walkThenSneak_w3_s10` (2); not established |
| core, 1.26.20.4 | 12 of 7065 | walking into powder snow; not established |
| water, both clients | 2 and 10 | `water_surface_sprint_y0`: a server-restated swim resizes the box before the move, dropping the float32 drift x keeps in the box; one ULP of position. Rebuilding the box on every restated height breaks the sneak recordings, so which restatements rebuild it is open |
| honey, both clients | 8 and 2 | `honey_sneak_20t`: sneaking on honey; not established |
| ground, 1.26.20.4 | 4 | `sprint_10t_to_sneak_10t`; not established |
| air, 1.26.51.1 | 1 | a sprint start one tick apart |
| mob effects (202) | 1 | a turn at the pole: the camera's own jitter |
| mounts, 1.26.20.4 | 222 of 3322 | where the rider sits on a camel, a pig or an untamed horse the server moves: the client seats it where the vehicle is rendered in the frame that runs the tick (its render interpolation at that frame's progress, and a rearing horse's lean); the engine seats it where the vehicle is shown at the tick; the seat is off by the vehicle's turn and move over part of a frame (about 1°, a few hundredths of a block), which a client without render frames cannot reproduce, and the server does not check a passenger's seat on a vehicle it moves |
| mounts, 1.26.51.1 | 144 of 3355 | the same |
| teleport, 1.26.20.4 | 5 of 5974 | a sprint stopped at a teleport, and two landings after a long hop |
| snow, both clients | 1 and 3 of about 700 | a tick of sneaking down through it in leather boots |
| climbing, 1.26.20.4 | 3 | a landing at the foot of a scaffolding descent, and a landing between scenarios (1.26.51.1 exact) |
| blocks, 1.26.20.4 | 2 of 1838 | a landing between scenarios and a move vector while swimming down a bubble column (1.26.51.1 exact) |
| sneakedge, 1.26.51.1 | 2 of 1219 | a float32 unit of a slow slide between scenarios |
| parity, 1.26.51.1 | 22 of 1385 | a column the client has the level chunk of but has not yet requested the sections of: it moves through it as air at altitude (the level chunk says the content ends 64 blocks above the floor), while over a column whose sections it has requested (a teleport's target) it stands; the replay does not know which the client has requested, and treating everything above a column's content as air breaks the teleports (1.26.20.4 exact) |
| items, both clients | 2 of 3335 and 3 of 3319 | one tick of a sprint swim toward a dolphin held 10 blocks ahead (the swim is a little faster for that tick, and even again after it; the dolphin held 4 ahead and the free one are exact), a crawl start between scenarios (1.26.20.4), and one float32 unit (one ULP) in the height of a landing on the boat just left (1.26.51.1) |
| monsters, 1.26.20.4 (gamepad) | 326 of 3203 | a hand-played fight: a hit that knocks the player into a wall stops it a float32 unit from where the client does (the knockback's velocity is exact; the client's box is not in the capture), and the replay, which takes the client's position from there, cannot rebuild the box the client has against the wall; a few item uses and swings; not established |
| happy_ghast, 1.26.20.4 (gamepad) | 303 of 1850 | riding the happy ghast, which the server moves: the rider's seat (see above) |
| dragon, 1.26.20.4 (gamepad) | 928 of 5003 | the change to the End, which is not modelled, and a float32 unit of position after hits |
| boat, both clients | 11 of 1529 and 1 of 1561 | the first strokes of a boat on the ground whose click mount took three tries, a tick apart (1.26.20.4), and the landing on the boat just left (1.26.51.1) |

The 1.26.10.4 proxy recording (10109 of 10167) has no client capture to time its packets by. The gameplay sessions
played by hand on a gamepad (`npm run record -- <scenario>` in the recorder, batch 203) are replayed too; `ghast`
(1118 ticks) is exact.

## Recordings

The recorder (`bedrock-tools-v2/packages/recorder`, `BEDROCK_FIXTURE=<name> node src/main.ts`, with
`BEDROCK_FIXTURE_VERSION=Flat2651` for 1.26.51.1; `BEDROCK_FIXTURE=list` lists them) has recorded every fixture it
registers on both clients: 72 recordings, 246,400 ticks, 99.8% of them replayed exactly (245,820 of 246,429). Knockback, push, teleport, ice, soul sand, sneak edges, poses, epsilon moves, multi-system cases,
mounts and powder snow are replayed on both; the rows above are what they still show.
