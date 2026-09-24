# Bedrock physics: overview

The Bedrock engine simulates the local player of a Bedrock Edition client one tick (1/20 s) at a time and builds the
`player_auth_input` packet that client would send after it. It reproduces the client bit for bit: the same float32
arithmetic in the same order, the same collision, the same input handling. That is what lets a bot report positions a
server accepts without corrections.

It is a separate engine from the Java one in `index.js`. The two share the public API (`Physics`, `PlayerState`,
`simulatePlayer`) but not the model. The Bedrock player differs in ways a shared engine could not carry:

| | Java engine | Bedrock engine |
|---|---|---|
| Precision | doubles | float32, every intermediate result rounded where the client rounds |
| Source of truth | the position | the collision box; the position is derived from it (feet = box floor, x/z = box centre) |
| Collision | per-axis offsets against block boxes | a Y then X then Z sweep that also pushes out of overlaps up to one block |
| Friction | applied before the move | applied after the move, with components under 2^-23 flushed to zero |
| Input | the controls are the move | the controls are raw keys, cooked into a move vector; sprinting, sneaking, swimming, crawling, gliding and flying are decided from them |
| Server packets | position set directly | a history of past ticks: a correction is installed on the tick it is stamped for and the ticks since are simulated again |

## Where the code lives

All Bedrock code is TypeScript under `lib/bedrock/`, run without a build: `lib/ts-hooks.js` registers a module
hook that strips the types when a `.ts` file is loaded. `index.js` loads the engine through it when
`Physics(registry, world)` is given a Bedrock registry.

```
lib/bedrock/
  index.ts        Physics(): the physics object, its tunables and methods
  types.ts        the shapes the engine works on (Player, BedrockState, World, Ctx, ...)
  tick/           one tick, as a sequence of steps; tick/index.ts fixes their order
  movement/       the movement rules: input, sprint, pose, flight, glide, travel, jump, collision, step-up, ...
  world/          reading the world: blocks and collision boxes, liquids, bubble columns, climbables, slowdown blocks
  math/           float32 helpers, the box, rotations and the sine table, the C-runtime sine/cosine
  network/        the input packet, the server's movement packets, the history of ticks, the session
  data/           the compiled sine/cosine routines and sine table
```

The layers only depend downward: `tick` uses `movement` and `world`, which use `math`; `network` uses all of them.
Every function a step calls is exported from its module and tested on its own (`docs/bedrock/testing.md`).

## One tick

`simulatePlayer(player, world)` runs the steps below, in this order. Each is one exported function; the names are
the ones in `lib/bedrock/tick/`.

```
beginTick        float32 velocity; jump cooldown; the box in the current pose; the ground block and its
                 friction; flying ability and fly intent; in water / in lava; the push of flowing water or lava
readInput        the raw keys cooked into the move vector and the derived flags
decideSprint     start / stop sprinting (+ the x1.3 boost on the movement attribute)
spinAttack       a riptide launch; the spin ends on a hit, a wall, landing or after 19 ticks
decidePose       swim pose amount; start / stop swimming; the fly toggle and the glide start / stop;
                 the sneak / crawl / swim pose from the sneak key and the room above
climbBeforeMove  ladders, vines and scaffolding: clamp the fall, climb on jump, descend on sneak
takePose         the box takes the pose's height; the water state is kept; lava is sensed again;
                 a handled teleport is reported
  - an immobile player stops here, velocity cleared
travel           a glide, or: the fly controls, the jump, and the input pushed along the yaw at the
                 travel type's speed (ground, air, water, lava, flying), swim steering
  - a teleport tick stops here, after the jump
slowDown         cobweb (less with Weaving), powder snow and berry bushes scale the move
requestMove      the move asked of the sweep: flight nudge, the 500 cap, at most 16 long, the sneak edge
sweepMove        the box sweeps through the blocks, pushed out of overlaps within the depenetration
                 limit, stepping up to 0.5625 where that gets further
settleCollisions blocked axes stop; landing and its bounce (slime, bed); the ground flag
climbOnPush      pushing into a ladder or vine climbs
velocityAfterMove  gravity, drag and friction for the travel type (land, water, lava, flying, gliding)
climbOutOfLiquid pushing into a ledge from a liquid boosts up
bubbleColumns    bubble columns push up or drag down
                 the slowdown blocks for the next tick; the input the next tick compares with
standOnSticky    standing on slime or honey slows the horizontal velocity
```

## The state

The engine works on mineflayer's `PlayerState` shape (feet `pos`, `vel`, the ground and collision flags, `control`,
the effect levels) and keeps its own per-player state on `player.bedrock` between ticks: the float32 box, the pose
and movement flags, the double-tap timers, the previous tick's input, the swim pose amount, the slowdown blocks of
the previous tick. `types.ts` documents every field. `PlayerState` copies it to and from `bot.bedrockPhysicsState`, so
it survives between the `PlayerState` objects mineflayer creates each tick.

When something other than the engine moves the player (a teleport, a respawn, a plugin), the position no longer
matches the box's anchor, and the next tick rebuilds the box around the new position.

## The server's packets

The server corrects the client with tick-stamped packets that arrive a few ticks late. The session
(`network/session.ts`, `BedrockSession`) keeps the inputs and the resulting state of the last ticks, so:

- a movement correction is installed on the tick it is stamped for, and the ticks since are simulated again with the
  inputs they had;
- a teleport is installed on the next tick, which reports `handled_teleport` and skips its travel;
- a movement attribute (the walking speed, the powder-snow freeze) is installed live and on the stored ticks since its
  stamp;
- restated actor flags (sprinting, sneaking, swimming, gliding, crawling, the box height) are written only where they
  differ from what the player had on that tick, so the player's own later changes stand;
- a knockback (`set_entity_motion`) sets the velocity: live when unstamped, and installed on its tick with the ticks
  since simulated again when stamped.

## Versions

The registry's version selects two rules:

- the travel's sine and cosine: the builds up to 1.26.10 compute them as a vectorised pair, those from 1.26.20 with
  the C runtime's scalar routines; the two differ by one float32 step on most angles;
- the landing bounce: up to 1.26.10, slime under the centre of the feet bounces any landing; from 1.26.20 the block
  is the one the landing stands on among the move's collision boxes (slime bounces fully, a bed three quarters),
  a landing slower than 0.08 does not bounce, and the landing tick's gravity is corrected for the part of the fall
  spent reaching the block.

Everything else is the same from 1.26.10 to 1.26.51. What the engine does not model yet is listed in
[Coverage](coverage.md).
