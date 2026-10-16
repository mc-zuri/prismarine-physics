# prismarine-physics

[![NPM version](https://img.shields.io/npm/v/prismarine-physics.svg)](http://npmjs.com/package/prismarine-physics)
[![Build Status](https://github.com/PrismarineJS/prismarine-physics/workflows/CI/badge.svg)](https://github.com/PrismarineJS/prismarine-physics/actions?query=workflow%3A%22CI%22)
[![Discord](https://img.shields.io/badge/chat-on%20discord-brightgreen.svg)](https://discord.gg/GsEFRM8)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-brightgreen.svg)](https://gitter.im/PrismarineJS/general)
[![Irc](https://img.shields.io/badge/chat-on%20irc-brightgreen.svg)](https://irc.gitter.im/)

[![Try it on gitpod](https://img.shields.io/badge/try-on%20gitpod-brightgreen.svg)](https://gitpod.io/#https://github.com/PrismarineJS/prismarine-physics)

Provide the physics engine for minecraft entities

## Usage

```js
const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')

const mcData = require('minecraft-data')('1.13.2')
const Block = require('prismarine-block')('1.13.2')

const physics = Physics(mcData, world)
const controls = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  sneak: false
}
const player = {
    entity: {
      position: pos,
      velocity: new Vec3(0, 0, 0),
      onGround: false,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: 0,
      pitch: 0
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0
  }
const playerState = new PlayerState(player, controls)

while (!player.entity.onGround) {
  // simulate 1 tick of player physic, then apply the result to the player
  physics.simulatePlayer(playerState, world).apply(player)
}
```

See `examples/` for more.


## API

### Physics

#### simulatePlayer(playerState, world)
- playerState : instance of the PlayerState class
- world : interface with a function `getBlock(position)` returning the prismarine-block at the given position

#### autoJump
- (boolean, default false) the client's auto-jump option, from 1.11: a player walking on the ground into a step 0.5 to
  1.2 high (higher with Jump Boost) with room above jumps on the next tick (LocalPlayer.updateAutoJump)

#### syncPose(entity, pose)
- entity : the player entity as a PlayerState reads it (its position, pose and physicsBox)
- pose : (string) the pose the server set for the player in its entity data: standing, crouching, swimming,
  fall_flying or spin_attack

From 1.14 the player takes the pose until its next tick sets its own, after the move. Up to 1.16 the player's box is
then rebuilt from its lower corner at the pose's size, even when the pose is unchanged. A caller that talks to a server
calls this when the player's entity data sets its pose (mineflayer does).

### PlayerState

A player state is an object containing the properties:

Read / Write properties:
- pos : position (vec3) of the player entity
- vel : velocity (vec3) of the player entity
- onGround : (boolean) is the player touching ground ?
- isInWater : (boolean) is the player in water ?
- isInLava : (boolean) is the player in lava ?
- isInWeb : (boolean) is the player stuck in a block (cobweb, sweet berry bush, powder snow) for the next move?
- stuckSpeedMultiplier : (vec3 or null) how much that block scales the next move (Entity.makeStuckInBlock)
- isCollidedHorizontally : (boolean) is the player collided horizontally with a solid block ?
- isCollidedVertically : (boolean) is the player collided vertically with a solid block ?
- elytraFlying : (boolean) is the player gliding with an elytra? From 1.15 the engine starts a glide when jump is
  pressed in the air with an elytra that is not one use from breaking (bot.inventory slot 6). As in the vanilla client,
  landing does not end a glide: the server ends it with entity data, which the caller applies by clearing this flag
  (mineflayer does). The engine ends a glide itself only while creative flying up to 1.21.1 and from 1.21.5 on a
  climbable block. A simulation without a server should clear it when the player lands
- wasJumping : (boolean) the jump key as the last tick left it; a glide starts on a press of jump, not while it is held
- fallFlyingRequested : (boolean, set by each tick) did the client ask the server to start gliding on this tick (the
  START_FALL_FLYING command)? From 1.15 on the tick the engine starts a glide; up to 1.14, where only the server
  starts it, on a press of jump while falling with a usable elytra. A caller that talks to a server sends the command
  then, or the server never starts the glide
- flightEndedOnLanding : (boolean, set by each tick) did landing end the flight on this tick? A caller that talks to a
  server then sends its abilities, after any START_FALL_FLYING command (onUpdateAbilities)
- jumpTicks : (integer) number of ticks before the player can auto-jump again
- autoJumpTime : (integer) ticks left of a jump the auto-jump option set up (read from and written to bot.autoJumpTime)
- riptide : (integer) the riptide level of a trident the player let go of before this tick, used 10 ticks or more in
  water or rain (bot.riptide; 0 for none, and the tick clears it): from 1.13 it pushes the player along its look by
  3 * (1 + level) / 4, and on the ground first moves it 1.2 up (TridentItem.releaseUsing)
- spinAttack : (boolean) whether the server's entity data has the player in a riptide's spin attack
  (bot.entity.spinAttack), which takes the 0.6 high pose
- autoJumped : (boolean, set by each tick) did the auto-jump option press jump on this tick? A caller that sends its keys
  (player_input, 1.21.2+) sends jump pressed then (Input.makeJump)
- jumpQueued : (boolean) true if the jump control state was true between the last tick and the current one
- fireworkRocketDuration : (number) how many ticks of firework boost are remaining ?
- box : (AABB or null) up to 1.16, the player's box as the last move left it; the position is read from it. It is kept on
  the entity as `physicsBox` ({ box, position }) and used only while the entity is still at that position, otherwise
  the box is rebuilt from the position
- shiftKeyDown : (boolean) the sneak key as the last tick left it; from 1.15 the sneak slowdown follows it, a tick after
  the key
- isSprinting : (boolean) is the player sprinting? The sprint control starts a sprint, releasing it does not stop one
- sprintTriggerTime : (integer) ticks left for a second press of forward to start a sprint (a double tap)
- forwardImpulse : (number) the forward input the last tick's sprint logic read
- eyeInWater : (boolean) from 1.13, whether the eyes were in water as the last tick found them
- isSwimming : (boolean) from 1.13, whether the player swims (a sprint under water), as the last tick left it
- fallDistance : (number) how far the player has fallen since it was last on the ground or in water (Entity.fallDistance),
  as the last tick left it
- isInPowderSnow : (boolean) whether powder snow touched the player during the last tick (Entity.isInPowderSnow)
- pose : (string) standing, crouching, swimming, fall_flying or spin_attack, as the last tick left it; from 1.9 it sizes
  the box (1.65 sneaking on 1.9 to 1.13; from 1.14 1.5 crouching and 0.6 swimming, crawling and gliding)
- isUnderWater : (boolean) whether the player is under water for this tick's sprint logic: from 1.16 the eyes of the tick
  before while in water, on 1.13 to 1.15 the eyes now (the engine sets it from 1.13)
- supportingBlockPos : (vec3 or null) from 1.20, the block holding the player up as the last move found it
  (Entity.mainSupportingBlockPos); the blocks under the player that affect its movement are found from it
- onGroundNoBlocks : (boolean) from 1.20, whether the last move found no supporting block while on the ground
- flying : (boolean) is the player creative flying (bot.entity.flying, from the abilities the server grants)? A player
  that may fly toggles it with a second press of jump within 6 ticks, a spectator always flies, and a flyer that lands
  stops flying unless a spectator; a caller that talks to a server sends its abilities when it changes (mineflayer does)
- jumpTriggerTime : (integer) ticks left for a second press of jump to toggle flight
- flightToggled : (boolean, set by each tick) did a press of jump toggle flight on this tick (or a spectator start
  flying)? A caller that talks to a server then sends its abilities, before any START_FALL_FLYING command
  (onUpdateAbilities)

Read only properties:
- food : (number) the food level (bot.food); 6 or less keeps a sprint from starting
- mayFly : (boolean) may the player fly (bot.abilities.mayFly); then hunger does not keep it from sprinting
- gameMode : (string) the game mode (bot.game.gameMode); a spectator moves through blocks, is never on the ground,
  keeps flying and takes the pose it wants
- worldBorder : (object, optional) the world border (bot.worldBorder): centerX, centerZ and size. A player inside it
  cannot leave it (up to 1.13 the cells outside it collide as full blocks; from 1.14 its shape collides, from 1.18 only
  near it). Without one the engine takes the default border, 59999968 across around 0, 0. Up to 1.13 a player counts as
  inside it within 1 past it, or 1 short of it when the last check found it outside (bot.entity.outsideBorder)
- dimension : (string) the dimension type (bot.game.dimension); from 1.16 lava currents push three times as hard in
  the_nether
- blindness : (integer) the blindness effect's level; blindness keeps a sprint from starting
- yaw : (float) the yaw angle, in radians, of the player entity
- yRot : (number, optional) the yaw in degrees as the client keeps it, not wrapped (bot.entity.yRot). The sine table
  reads it, and -80 and 280 differ in the last bits; used when it looks the same way as yaw
- pitch: (float) the pitch angle, in radians, of the player entity
- usingItem : (boolean) is the player using its held item (bot.usingHeldItem)? It slows the input to 0.2F
- swiftSneak : (integer) the Swift Sneak level of the leggings (bot.inventory slot 7), which lessens the sneak slowdown on 1.19 and 1.20
- soulSpeed : (integer) the Soul Speed level of the boots (bot.inventory slot 8), which cancels the slowdown of soul sand
  and soul soil on 1.16 to 1.20
- attributes : (object) the synced attributes (bot.entity.attributes), keyed by the registry's resource name
  (`registry.attributesByName[name].resource`), each `{ value, modifiers }`. The engine reads movement speed and, on the
  versions that have them, sneaking speed, jump strength and the movement and water movement efficiencies. As the
  vanilla client does, it takes the sprint modifier off the movement speed when sprinting stops and puts it on when
  sprinting starts, and nowhere else: attributes the server sends replace all the modifiers, so a player can sprint
  without the modifier until it stops and starts again; apply writes the attributes back. With no synced movement
  speed the sprint modifier follows isSprinting
- control : (object) control states vector with properties:
  - forward
  - back
  - left
  - right
  - jump
  - sprint
  - sneak