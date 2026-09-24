# Bedrock physics: testing

Four layers of tests hold the engine to the game client, from single functions to whole recorded sessions.

| Layer | Where | What it checks | Run |
|---|---|---|---|
| Unit tests | `test/bedrock/unit/**` | every exported function on small hand-built worlds, every branch | `npm run test:unit` |
| Recorded client cases | `test/bedrock/golden.test.ts`, `test/fixtures/bedrock/golden/` | single functions against the client's own inputs and results, bit for bit | part of `npm run test:unit` |
| History and attribute cases | `test/bedrock/rewind-parity.test.js`, `test/fixtures/bedrock/rewind-parity.json` | the history ring, correction filing and attribute arithmetic against shared cases | part of `npm run test:unit` |
| Recorded sessions | `test/bedrock/fixtures.test.js`, `test/fixtures/bedrock/<version>/` | whole ticks: every input packet the client sent during scripted scenarios, replayed through the session | `npm test` |

`npm test` runs everything (lint, typecheck, the Java engine's tests too). `npm run coverage` runs the unit layer
under c8 and fails below 100% of lines, branches and functions of `lib/bedrock` (`.c8rc.json`): each function is
covered by tests aimed at it, not only by the replays.

## Unit tests

One file per engine module, at the same path under `test/bedrock/unit/`. `helpers.ts` gives:

- `worldOf({ 'x,y,z': 'name' }, floorY, floor)`: a world of named blocks over a floor (`floorY` null: no floor), and
  `worldFrom((x, y, z) => name)` for a world from a function. The blocks are plain objects in the shape the engine
  reads; `BLOCKS` lists them (stone, slabs, fences, ladders, liquids, slowdown blocks, ...).
- `player(pos, fields)`: a PlayerState-shaped player standing at `pos`.
- `ctx(world, { modern, settings })`: the context a tick step takes (`modern: false` gives the rules of 1.26.10).

Values are asserted exactly (`strictEqual`), with the expected float32 written out (`f(1 - f(0.8))`, not `0.2`).

## Recorded client cases

`test/fixtures/bedrock/golden/<name>.json` lists calls to one engine function with the arguments the client had and
the results it produced (see the folder's README for the format). The cases come from captures of the 1.26.20.4
client, reduced to those that take distinct paths, and are written by a generator that lives with the capture
tooling, outside this repository. A failing case is a real difference from the client (or a mapping error in the
generator), not a tolerance to widen.

## Recorded sessions

`test/fixtures/bedrock/<version>/` holds scenarios recorded from the client (1.26.10, 1.26.20, 1.26.51) plus a set
written by a simulator of the client (`1.26.20-engine`). Each scenario is the input packets the client sent,
tick by tick, and the server packets it handled. The runner feeds the engine the recorded keys, rotation and packets
through a `BedrockSession`, and compares the packet the engine would send with the recorded one: position and
velocity bit for bit, the three move vectors, all 65 input flags. The few scenarios where a server packet's arrival
tick is itself visible are listed in the test with the measurement behind them.

## Refactoring safely

A change that should not change behaviour can be checked tick by tick: hash the observable state (the input packet,
position and velocity, the collision flags, the pose) after every `simulatePlayer` call of the whole suite, before
and after the change, and compare. A mocha `--require` hook that wraps `Physics().simulatePlayer` is enough; the
engine's port to TypeScript was checked that way over the 41,165 simulated ticks of the suite.

## In mineflayer

mineflayer's `test/bedrock/replay.test.js` replays whole recorded sessions through a real bot with manual ticks and
counts the ticks whose packet it reproduces exactly (see `mineflayer.md`).
