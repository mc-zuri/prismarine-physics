# Bedrock physics

The Bedrock Edition player physics of prismarine-physics: a tick-by-tick reproduction of the client's movement,
bit for bit, and the `player_auth_input` packet it sends.

- [Overview](overview.md): how the engine differs from the Java one, where the code lives, one tick step by step,
  the state it keeps, the server's packets, what depends on the version.
- [Using it from mineflayer](mineflayer.md): the integration mineflayer's Bedrock support uses, what the engine reads
  from the player, the server packets, and using it without mineflayer.
- [Coverage](coverage.md): what the engine models, and what it does not yet.
- [Reference](reference.md): every module and export, generated from the sources.
- [Testing](testing.md): unit tests and coverage, recorded client cases, recorded sessions.

```js
const { Physics, PlayerState, BedrockSession } = require('prismarine-physics')
const physics = Physics(require('prismarine-registry')('bedrock_1.26.20'), world)
physics.simulatePlayer(playerState, world)
const packet = physics.playerAuthInput(playerState)
```

The engine is TypeScript (`lib/bedrock/`), loaded without a build step: `lib/ts-hooks.js` strips the types when a
file is loaded. It needs Node 22.18 or later.
