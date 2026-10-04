# Binary fixture archives

Java recordings live in `test/fixtures/java/<version>.pfix`. Shared immutable world
revisions live in `test/fixtures/worlds/<sha256>.pfix`. A fixture's `worldHash` and
`area` select its exact world snapshot; game-version-specific block interpretation
still happens in the replay harness. Raw recording sessions are kept outside Git.

## Tools

Run commands from the repository root:

```sh
npm run fixtures -- import-session /recordings/1.21.10/session.bin --conflict replace
npm run fixtures -- merge /other/fixtures/java/1.21.10.pfix --conflict error
npm run fixtures -- verify
npm run fixtures -- list test/fixtures/java/1.21.10.pfix
npm run fixtures -- inspect test/fixtures/java/1.21.10.pfix
npm run fixtures -- inspect test/fixtures/java/1.21.10.pfix --name j_opposite_keys
npm run fixtures -- diff /before/1.21.10.pfix /after/1.21.10.pfix
npm run fixtures -- migrate --legacy /legacy/java --root /new/fixtures
```

The supplied sessions are now under `D:\projects\mc-zuri\mc-data2\java\data\sessions`.
Import that entire directory using its `index.json`; declared session hashes and
Minecraft versions are checked against the actual streams:

```powershell
npm run fixtures -- import-session 'D:\projects\mc-zuri\mc-data2\java\data\sessions' --conflict replace
```

`import-session` and `merge` accept multiple files. Adding fixtures uses the same
commands; unrelated existing entries remain. `--conflict` is `error` (default),
`keep`, or `replace`; identical entries are no-ops. `--root` selects the output
fixture root. Merge finds worlds beside the input `java` directory, or in
`--worlds <directory>`. `diff` reports added, removed and semantically changed
entries. `inspect` prints manifests and byte locations, without decoding all ticks.

Migration refuses to overwrite an existing version archive, converts all existing
scenario files, and compares every decoded fixture with its JSON source before
publication. It does not delete sources. Session import validates the entire
PHYSREC2 stream, including checksums, sequence, census and completion footer,
before extracting successful catalog cases in a second streaming pass. The first
successful run of a repeated case wins. A case must include its recorded world.
Provenance includes the source SHA-256, session ID and event range. Packet bytes
remain bytes; serializers are used for replay comparisons, not to rewrite evidence.

The writer spools entries on disk and publishes each version through a verified
temporary file in the destination directory. Worlds publish first, so a failed
import may leave an unreferenced immutable world but cannot publish dangling
references. Different version files in a multi-file import commit independently.
Do not run two writers for the same version concurrently. Unchanged entries are
copied without recompressing. Scratch `.pfix-*` directories are ignored by Git;
an interrupted process may leave one for manual cleanup.

The fixture store exposes `versions()`, `manifest(version)`, `names(version)`,
`fixture(version, name)`, `area(fixture)`, and `close()`. `fixture()` returns null
for an absent name. Archive handles expose `list`, `has`, `read`, and `close`.
Callers must close handles. The harness closes its cache when the process exits.
`PHYSREC_FIXTURE_ARCHIVE` selects one version archive in the usual `java/` layout;
`PHYSREC_FIXTURE_DIR` retains legacy-directory support. Set only one override.

## Container version 1

All integers in headers and indexes are unsigned and big endian. There is a
40-byte header, a binary index, then independently encoded entries. No JSON is
stored in either section. Minecraft versions do not change this container format.

| Header offset | Size | Field |
| --- | ---: | --- |
| 0 | 8 | ASCII `PHYSFIX` followed by NUL |
| 8 | 2 | Container version: 1 |
| 10 | 2 | Kind: 1 fixtures, 2 world |
| 12 | 4 | Entry count |
| 16 | 8 | Index byte length |
| 24 | 4 | CRC32 of index bytes |
| 28 | 4 | CRC32 of header bytes 0–27 |
| 32 | 8 | Reserved, zero |

Each index record has a 40-byte fixed prefix followed by its UTF-8 name:

| Entry offset | Size | Field |
| --- | ---: | --- |
| 0 | 2 | Name byte length |
| 2 | 2 | Payload schema: 1 |
| 4 | 1 | Codec: 0 uncompressed, 1 raw DEFLATE |
| 5 | 3 | Reserved, zero |
| 8 | 8 | Absolute data offset |
| 16 | 8 | Stored byte length |
| 24 | 8 | Decoded byte length |
| 32 | 4 | CRC32 of decoded bytes |
| 36 | 4 | Reserved, zero |
| 40 | variable | UTF-8 name, no NUL |

Names are unique and sorted by JavaScript string order. Writers emit contiguous
payloads in index order; readers also permit gaps, but reject overlaps and trailing
data. Offsets above 4 GiB are supported up to JavaScript's safe integer range.
Indexes are limited to 64 MiB and individual decoded/stored entries to 256 MiB.
Each read validates decoded length and checksum; decompression has an output limit.
Unknown format versions, schemas, flags, codecs and malformed UTF-8 are rejected.

Payloads use the definite-length CBOR subset in `lib/session-format.js`, with
recursively sorted object keys and original array ordering. Floating-point values
use binary64; negative zero remains negative zero. Byte buffers use CBOR byte
strings. Optional undefined object properties are omitted. Deflation uses level 6
and is selected only when smaller than the uncompressed payload. Output is
deterministic within a given Node/zlib toolchain.

The reserved `@manifest` entry in a fixture archive contains the version and case
catalog. Other names are fixture names. A world manifest contains ordered
`areaNames` and any other world metadata; other entries are named areas. A world
filename hashes the canonical CBOR of the reconstructed world object, excluding
only its top-level `version` label. Exact array ordering and block-state strings
participate in that hash. Case-local snapshots can form a one-area revision.

Run `npm run test:fixtures` for format, corruption, import, merge, signed-zero,
packet-buffer, failure-recovery and large-offset checks. Physics regressions and
known-failure assertions remain in the normal test suite.

## Migration results — 2026-10-02

| Corpus | Versions | Fixture/world files | Fixtures | Bytes |
| --- | ---: | ---: | ---: | ---: |
| Original JSON and retained sessions | 30 | 31,785 | 23,447 | 1,554,131,898 |
| Storage-only binary conversion | 30 | 43 | 23,447 | 75,019,035 |
| After importing all nine sessions | 31 | 96 | 24,484 | 81,934,511 |

After the initial nine imports, the corpus had 31 version archives and 65 world revisions: 13 complete
legacy world sets plus 52 shared case snapshots from the raw sessions. Imports
added 1,037 fixtures and replaced 8,275. Three unsuccessful catalog cases were
skipped; existing fixtures absent from successful imports were retained.

Every storage-only fixture was compared against its original decoded data. Replay
and packet results matched for 72 representative version/case combinations. All
9,312 imported fixtures and their exact worlds also matched the independent
`binary-fixtures` exports beside the source recordings. All source SHA-256 values
matched the sessions directory manifest, and every archive passed verification.

Validation:

- 11 archive/session-format checks passed, including corruption, large offsets,
  signed zero, packet buffers, merge policies and failed publication.
- The non-replay suite passed: 548 Mocha tests, plus its Node test checks. The
  Bedrock unit command separately passed all 485 tests.
- Type checking and lint of the changed code and generated Java tests passed.
  Full repository lint still reports existing formatting errors in
  `landing-signed-zero`, `powder-snow-climb-timing`, and `water-entry-timing` tests.
- The regenerated Java suite contains 1,035 scenarios across 31 versions in 59
  test files. With a 90-second limit per file, 58 files completed: 25,977 passed,
  2,982 failed, and 524 skipped; `t2-combos/landing.test.js` timed out. No storage,
  checksum, missing-fixture or world-reference failures were observed.
- The original replay baseline already failed: 16,603 passed, 2,191 failed,
  508 skipped, and four file timeouts. These totals are not directly comparable:
  the new run includes another game version, changed recordings, and three more
  completed files. Physics and packet expectations were not weakened to hide
  failures.

Indicative local measurements: initial Git status took 79–101 ms. An isolated
temporary repository representing the adopted binary layout took 45–59 ms. A
fresh-process archive open plus one fixture read took a median 18.4 ms, compared
with 1.9 ms for one JSON read; subsequent archive reads with the index cached took
a median 1.6 ms. The OS cache was not cleared and other work was running, so these
are observations rather than performance guarantees. The actual staging area was
not used for the isolated benchmark.

The original fixture directories, including retained logs, were moved to
`C:\Users\Sandbox\AppData\Local\Temp\pfix-legacy-before-migration-20261002`.
Detailed per-file replay results are in the sibling `pfix-validation` directory
as `legacy-results.json` and `archive-results.json`. The recorder's external
`tools/export.mjs` and `tools/gen-tests.mjs` were updated to use the archive API.

### Additional sessions: 1.21.6, 1.21.5, 1.21.3 and 1.21.2

The four subsequent sessions from the same directory added 1,036 fixtures and
replaced 3,103. All 4,139 successful recordings passed session integrity and
manifest SHA-256 checks, and their decoded fixtures and worlds matched the
independent source exports. The flaky `v_camel_sprint` recording for 1.21.3 was
skipped, preserving its previous fixture.

| Version | Imported successful cases | New fixtures | Replaced fixtures |
| --- | ---: | ---: | ---: |
| 1.21.6 | 1,035 | 0 | 1,035 |
| 1.21.5 | 1,035 | 0 | 1,035 |
| 1.21.3 | 1,034 | 1 | 1,033 |
| 1.21.2 | 1,035 | 1,035 | 0 |

The resulting corpus contains 25,520 fixtures across 32 version archives and 65
shared world files, totaling 86,887,768 bytes. Regeneration added 1,036
scenario/version combinations: all 1,035 scenarios for 1.21.2 and
`v_raft_forward` for 1.21.3. No existing version coverage was removed. Every
successful imported case has generated JS coverage for its version. Generated
test lint and whitespace checks passed.

Immediately after import, replay checks completed for each selected archive without
timeouts or storage errors. Physics/packet assertions failed: 49 for 1.21.6, 285 for 1.21.5,
294 for 1.21.3, and 294 for 1.21.2. Across these runs, 30,739 checks passed and
922 failed; checks for unselected versions were skipped. Detailed results and
pre-import archive backups are in
`C:\Users\Sandbox\AppData\Local\Temp\pfix-add-four-Cxi2M4`.

### Completed parity fixes - 2026-10-03

The final combined Java replay results across all 59 files and 32 versions are
31,636 passing, zero failing, and 322 pending. This combines the complete per-file
run with the final vehicle-file rerun after publishing three replacement captures.
The non-replay suite also passed (548 Mocha tests plus the Node test checks), as
did lint and type checking. Exact Java math was enabled with
`PRISMARINE_JAVA_HOME=C:\Program Files\Java\jdk-21.0.11` and the built N-API/JNI
addon; these results do not claim identical parity with the JavaScript math fallback.

Packet checks now run for every eligible version in a group, even when another
version lacks its initial network checkpoint. This adds 202 passing checks. The
remaining 322 pending checks have no eligible capture with that checkpoint;
their movement replays still run.

Three old horse recordings lacked animation/rearing inputs needed for exact
replay. The 1.18 and 1.19.2 recorder adapters now capture initial animation state
and spontaneous client rearing events. Fresh native captures with two successful
verification passes replaced only `v_horse_running_jump` and
`v_horse_step_up_block` for 1.18, and `v_horse_step_up_block` for 1.19.2. Scenario
steps were unchanged, and all other fixture payloads were checked for equality.
The published captures had no spontaneous rearing event; separate regressions
exercise that input, and an unpublished native recording with initial rearing
also replayed exactly. Original archives and source recordings are retained under
`D:\minecraft\java\physics-data-generator\build\rearing-capture-1790975419202`.

Regeneration retains all 1,035 scenarios and 25,520 scenario/version combinations.
Its grouping and generated milestone counts changed with the replacement captures;
no scenario/version coverage was removed. The generator writes changed files
atomically and preserves handwritten files. Detailed final results are in
`C:\Users\Sandbox\AppData\Local\Temp\pfix-validation\final-combined-results.json`.

### Expanded sessions and recorder audit - 2026-10-03

The next import processed 18 full sessions from
`D:\projects\mc-zuri\mc-data2\java\data\sessions`: 1.16.5, 1.17, 1.17.1,
1.18, 1.18.1, 1.18.2, 1.19, 1.19.1, 1.19.2, 1.20, 1.20.1, 1.20.2,
1.20.3, 1.20.4, 1.20.5, 1.20.6, 1.21 and 1.21.1.
It imported 17,882 successful cases: 11,731 added and 6,151 replaced.
The 748 flaky or unsupported cases were skipped; 48 pre-existing fixtures for
excluded or absent cases were retained unchanged. Every original fixture name
remains. All imported payloads and worlds matched the independent source exports.
Generated coverage contains exactly 37,251 scenario/version combinations across
42 versions, 1,035 scenario names and 59 test files, with no missing or duplicate
combinations. The archive's `physics-fixture-import-20261003.json` records this
import; its packet-validation fields describe the status before revalidation.

The expanded Java replay suite has **36,876 passing, 1,337 failing and 212 pending**
checks with the JNI Java math addon enabled. The earlier zero-failure result above
applies to the smaller corpus. No assertion tolerances or case exclusions were
changed to accommodate the new failures. Detailed per-file results are retained
in `C:\Users\Sandbox\AppData\Local\Temp\pfix-validation\new-session-import-results.json`.

All seven sessions that previously failed packet decoding now pass whole-file
validation: 5,024,485 packets round-trip byte-for-byte. Corrections in the external
Minecraft data source cover namespaced vibration destinations, the 1.20.3/1.20.4
particle registry and payloads, and the direct explosion sound event. Native
packet bytes and session hashes are unchanged. The archive contains
`recorder-schema-revalidation-20261003.json` and individual validation receipts;
the manifest points to these receipts and preserves previous failure reports.
`test/session-schema-regressions.test.js` exercises the affected native packets.

The recorder audit inspected all 39 flaky case/version pairs from the original
31-session catalog. Confirmed fixes capture exact initial player bounds on
1.16.5, capture horse rearing inputs on the older adapters, wait for mounted
velocity to settle, and recognize captured piston block-event timing at the
first differing tick. Recorder build outputs are also copied into each new
recording so a concurrent build cannot replace a JAR while Minecraft loads it.
Fresh recordings passed three-run native verification for 14 selected cases,
and every packet replay check passed. Six trajectories replayed exactly; eight
1.16.5 sneak trajectories still have floating-point differences at zero tolerance.
These diagnostic captures have not replaced the imported full-session fixtures.

Camel initial-state differences, the 1.20.5 boat-off-ledge initial-state difference,
and some horse-dismount/entity-push variations remain unresolved and excluded.
Original failed catalogs were not relabeled successful. The archive's
`failed-case-details-20261003.json` preserves the first differing values;
`recorder-failure-audit-20261003.json` links the fixes, fresh captures and remaining
limitations.

### Physics corrections for the expanded corpus - 2026-10-03

The engine now enables the 1.18.2 sprint-air float sum, collision epsilon and
double-precision elytra cosine at their actual release boundary. The outgoing
movement-packet threshold also changes in 1.18.2. Jump boost still adds in float
on 1.17; double addition starts in 1.17.1. These boundaries were checked against
the exact mapped native JARs, with source branches in
`D:\projects\mc-zuri\mc-data\extracted_minecraft_data` used for context.

Player pose changes on 1.14-1.16.5 preserve the lower bounding-box corner instead
of rebuilding around its center. Incoming pose metadata refreshes dimensions
even when it repeats the current pose. This fixes the tiny sneak/pose trajectory
differences without introducing a tolerance. The engine also handles the local
dismount used in 1.16.x; the packet builder retains the boat's paddle packet before
the player's ordinary movement. A delayed finish-using-item notification no
longer consumes food again after item use has ended.

The engine accepts `fireworkRocketsBeforePlayer` alongside `fireworkRockets`, and
`tickBeforePlayer` on surrounding entities. These inputs place rocket boosts and
entity pushes on the correct side of the player's tick. On 1.16.5 the native
client uses hash-map iteration, so entity IDs and insertion history can change
that order. The recorder observes the actual traversal before entity ticking and
stores it as `entityTickOrder`; it separately counts attached rockets that tick
before the player. The replay reads those inputs rather than deriving order from
the expected player trajectory. Other versions retain their existing default
ordering when these optional inputs are absent.

Nine fixtures lacked inputs necessary for exact replay and were replaced with
fresh native captures of the same scenarios and steps:

| Version | Replaced fixtures |
| --- | --- |
| 1.16.5 | `f_elytra_rocket_level`, `f_elytra_rocket_straight_down`, `f_elytra_wall_hit_rocket`, `n_walk_through_cow` |
| 1.17 | `v_horse_back_strafe` |
| 1.18 | `v_horse_dismount`, `v_horse_turn` |
| 1.19.1 | `v_horse_step_up_block`, `v_horse_walk` |

Horse captures now include spontaneous rearing inputs and initial animation state;
the 1.19.1 adapter gained the same instrumentation as 1.19.2. All 25 retained native
runs replay exactly, including both rocket orders, with no server/client packet
differences. Eight cases ran three times; the cow scenario keeps its existing
single-run catalog policy. Captures and their immutable recorder runtimes are in
`D:\minecraft\java\physics-data-generator\recordings\physics-parity-20261003`.
The four original version archives are backed up in
`C:\Users\Sandbox\AppData\Local\Temp\pfix-physics-20261003\before\java`.
Every other fixture in those archives was checked for exact payload equality.

Coverage remains 1,035 scenarios and 37,251 fixture/version combinations across
42 versions and 59 files. A separate audit of the generated test definitions found
no missing or duplicate combinations. Scenario steps and assertion tolerances
were unchanged; no known failures were added.

Final validation: **38,174 passing, zero failing and 212 pending Java checks**
across all 59 files and 42 fixture versions. This combines the complete suite run
with the complete item-use-file rerun after its final packet-state initialization
fix. All 548 non-replay Mocha tests, 73 Node regression tests and two recorder
regressions passed, along with lint, type checking and whitespace checks.
JNI Java math was enabled with
`PRISMARINE_JAVA_HOME=C:\Program Files\Java\jdk-21.0.11`.
The 212 pending checks lack an eligible recorded network checkpoint; their
movement trajectories still run. No new pending checks were introduced.

The sessions archive contains `physics-parity-verification-20261003.json` with
coverage, archive hashes, loaded data revisions and replacement-capture receipts,
plus `physics-all-version-results-20261003.json` with per-file test results.

### Additional recordings - 2026-10-04

Imported ten newly archived full sessions from
`D:\projects\mc-zuri\mc-data2\java\data\sessions`: 1.8.8, 1.9.4, 1.10.2,
1.11.2, 1.12.2, 1.13.2, 1.14.4, 1.15.2, 1.19.3 and 1.19.4. Each source was
checked against the archive index's version and SHA-256 and required a complete
footer. All ten source packet validations passed.

The import accepted **8,208 successful cases**: **4,358 added combinations** and
3,850 replacements. It excluded 2,142 failed, flaky or unsupported case entries,
and retained 106 existing fixtures without a successful new replacement. The
previous nine repaired fixtures in other versions were preserved. Coverage is
now **1,035 scenarios, 41,609 fixture/version combinations, 46 versions and 59
generated test files**, with no missing or duplicate combinations.

Native source and exact mapped JAR checks identified these physics corrections:

- 1.14 input slows for either the new sneak key or the crouching state computed
  before reading that key, including a forced crouch under a ceiling.
- Farmland and soul sand gain their unconditional suffocation rule in 1.16;
  applying it earlier incorrectly pushes players out while landing on them.
- 1.15 permits local elytra deployment with levitation. The levitation check
  starts in 1.16.
- Passenger sprint restrictions start in 1.19.4. The experimental bamboo raft's
  seat offset is 0.3 in 1.19.3/1.19.4, changing to 0.25 in 1.20.
- Boats are excluded from living-entity pushes even when an older registry
  classifies them as `mob`; this prevents a second collision impulse.
- Replay accumulates surrounding-entity pushes in recorded traversal order,
  preserving Java double rounding when several mobs push in one tick.

The recorder now captures horse rearing on 1.13.2 and entity traversal/rocket
timing on 1.14.4 and 1.15.2. Repeat comparison normalizes recorded entity IDs and
recognizes changes in traversal order at the first differing tick. Regression
checks reject differences explained only by renamed IDs or a later order change.

Twelve fixtures were replaced with successful instrumented captures of the same
steps, setup and world: one horse case on 1.13.2, seven rocket/entity/dismount
cases on 1.14.4, and four rocket/entity/dismount cases on 1.15.2. Every other
fixture in those archives was verified unchanged. Captures are under
`D:\minecraft\java\physics-data-generator\recordings\physics-parity-20261004`
and `physics-parity-20261004-order`. Earlier failed capture attempts remain
excluded. Backups and import/coverage receipts are in
`C:\Users\Sandbox\AppData\Local\Temp\pfix-physics-20261004`.

Final validation: **41,296 passing, zero failing and 270 pending Java checks**
in a complete run of all 59 generated files, using the N-API/JNI Java 21 math
backend. All 548 non-replay Mocha tests, 76 Node regressions, two recorder
regressions, archive integrity checks, lint and type checking passed. All 31
retained runs of the successful repair captures replay exactly.

The 270 pending checks belong exclusively to retained 1.7.10, 1.15 and 1.16
captures without network state. Their movement tests execute and pass. Refreshing
the other versions split some previously shared groups, exposing more of these
packet-only pending checks; no skip rules, known failures or tolerances were
added. Every successfully imported recording is covered by generated tests.

Full results, archive hashes, data revisions, import counts and capture receipts
are saved as `physics-all-version-results-20261004.json` and
`physics-parity-verification-20261004.json` in the sessions archive.
