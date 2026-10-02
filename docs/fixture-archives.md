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
