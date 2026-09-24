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

### Bedrock Edition

`Physics(registry, world)` returns the Bedrock engine when `registry.type === 'bedrock'` (a
[prismarine-registry](https://github.com/PrismarineJS/prismarine-registry) such as
`require('prismarine-registry')('bedrock_1.26.20')`). It takes the same `PlayerState` and exposes the same
`simulatePlayer` / `adjustPositionHeight`, so mineflayer code does not change; it reproduces the Bedrock client's
movement bit for bit (1.26.10 to 1.26.51) and adds what a Bedrock client needs:

- `physics.playerAuthInput(playerState)`: the `player_auth_input` packet the client would send after the tick.
- `BedrockSession`: the server's movement packets (teleports, corrections re-simulated from their tick, the movement
  attribute, restated actor flags) applied the way the client applies them.
- The controls are raw keys: sprinting, sneaking, crawling, swimming, gliding and flying are decided from them, as on
  the client.

The engine is TypeScript under `lib/bedrock/`, loaded without a build step (Node 22.18+). See
[docs/bedrock](docs/bedrock/README.md): an overview, the mineflayer integration, a reference of every module, and
how it is tested.

### PlayerState

A player state is an object containing the properties:

Read / Write properties:
- pos : position (vec3) of the player entity
- vel : velocity (vec3) of the player entity
- onGround : (boolean) is the player touching ground ?
- isInWater : (boolean) is the player in water ?
- isInLava : (boolean) is the player in lava ?
- isInWeb : (boolean) is the player in a web ?
- isCollidedHorizontally : (boolean) is the player collided horizontally with a solid block ?
- isCollidedVertically : (boolean) is the player collided vertically with a solid block ?
- elytraFlying : (boolean) is the player elytra flying ?
- jumpTicks : (integer) number of ticks before the player can auto-jump again
- jumpQueued : (boolean) true if the jump control state was true between the last tick and the current one
- fireworkRocketDuration : (number) how many ticks of firework boost are remaining ?

Read only properties:
- yaw : (float) the yaw angle, in radians, of the player entity
- pitch: (float) the pitch angle, in radians, of the player entity
- control : (object) control states vector with properties:
  - forward
  - back
  - left
  - right
  - jump
  - sprint
  - sneak