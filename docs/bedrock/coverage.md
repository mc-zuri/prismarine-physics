# Bedrock physics: coverage

What the engine reproduces, and what it does not yet. Everything under "Modelled" is checked against the client:
by the recorded sessions (`test/bedrock/fixtures.test.js`), the recorded client cases (`test/bedrock/golden.test.ts`)
or the shared rewind cases (`test/bedrock/rewind-parity.test.js`); see [Testing](testing.md).

## Modelled

**Input and pose**

- raw keys and analogue sticks cooked into the move vector; the input flags of `player_auth_input`
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

- ground, air, water, lava and flying travel speeds; Speed and Slowness through the movement attribute
- Depth Strider in water; Soul Speed on soul sand
- Dolphin's Grace: a swimming player looks for dolphins every 60 ticks of swimming, the first after 60 (the world's
  `dolphinsNear`), and one within 5 blocks doubles its swim speed for 60 ticks, without the Depth Strider drag
- the jump: cooldown, Jump Boost, honey, powder snow, the sprint push, rising in liquids, the swim pose hold
- swimming toward the look, the water sink when wanting down
- sliding down the side of a honey block: 0.4 of the horizontal velocity and a fall of at most 0.12 per block, the
  fall distance reset
- ladders, vines and scaffolding: the fall clamp, climbing on jump or while pushing into the wall, descending on sneak
- leaving a liquid over a ledge

**The move**

- the float32 collision sweep (Y, then X, then Z) with depenetration of overlapping blocks, and the server's
  push-towards-closest-space flag
- no-clip (the ability a spectator has): the move passes through everything; a spectator is in no block's effect
- stepping up to 0.5625; the sneak edge; the 500 speed cap and the 16-block move clamp
- cobweb (less with Weaving), powder snow and sweet berry bushes; powder snow holds up and is climbed in leather boots,
  and catches a fall of more than 2.5 on its 0.9 high box (the fall distance tracked as the client counts it)
- the landing bounce: slime and beds, and the landing tick's gravity correction from 1.26.20

**After the move**

- gravity, Slow Falling, Levitation and the per-travel drag and friction
- the push of flowing water and lava; bubble columns up and down
- standing on slime or honey

**Vehicles and solid entities**

- a boat the player steers, as the client predicts it: the paddles from the move vector, the friction of what it is
  in or on, the turn and thrust, the move, and the buoyancy on water; the packet reports the boat
- sitting in any other vehicle (minecart, pig, strider): the server moves it
- boats are solid to a player on foot: it stands on them, and one it is inside is only pushed out 0.1 at most
- vehicle corrections from the server, installed in the history like the player's
- the dismount (`physics.dismount`): the rider stands at the first free spot beside its vehicle, the sides of the
  way it moved first, on the floor there, at rest

**Server packets**

- movement corrections and teleports, installed in the tick history and simulated forward
- movement attributes, with effect modifiers
- restated actor flags
- knockback (`set_entity_motion`)
- the glide boost (`movement_effect`)

## Not modelled yet

- the liquid movement attributes the server can send (vanilla keeps them at their defaults)
- horse, camel and other mounts the player steers (the client predicts a tamed, saddled one; unverified, so the
  engine seats the player and leaves the mount to the server)
- a boat's wave phase: its timer runs from the boat's spawn and a random draw makes the big waves, so the bobbing
  height drifts from the server's within a few hundredths, and the server corrects it
- the different step height on blocks that prevent jumping

A server running authoritative movement corrects the player on these; the engine then continues from the
correction.
