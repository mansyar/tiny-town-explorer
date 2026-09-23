# Plan: Light Wandering Traffic

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.
>
> Deliberate sequencing: **Phase 1 spends the budget before traffic earns
> it** — dropping two parked cars first keeps every later measurement cleanly
> attributable and returns the freed kerbs to the litter pool while the
> existing suites can still catch a mistake. Logic precedes visuals (Phases 2–4
> are pure and fully TDD; the motor's two option seams — per-car speed and a
> live obstacle supplier — land before any scene work can mask a failure). The
> visual layer (Phase 5) reuses `vehicleActor` and `parkedShadows`' sun-offset
> language unmodified. Wiring and measurement close the track (Phase 6) because
> the must-not-grow contract (NFR2) is judged against the fully-assembled
> scene.

## Phase 1 – Budget lever: six parked cars → four (TDD) [checkpoint: be8a4c7]

- [x] Task: Remove the two tightest-kerb parked cars (FR10) `be8a4c7`
  - [x] Write failing tests for the four-car contract: the map authors four
    parked cars (the two with the smallest measured wall gaps removed); the
    remaining four keep every placement contract (straight-segment, wall
    ≥0.652, kerb-top seat, spawn clearance, non-overlap); the two freed kerb
    edges rejoin the litter candidate pool and `spawnParkLitter`'s draw floor is
    still asserted (pool stays varied by seed); `declaredKerbViolations` still
    passes (red first — the data contract asserts six today)
  - [x] Remove the two `townMap.ts` rows (identified by the placement suite's
    wall-gap measurements and recorded in the commit note), and confirm the
    kerb reservation needs no rule change — only the shrunk authoring list
  - [x] Refactor + coverage (`parkedCars*.test.ts`, `kerbReservation.test.ts`,
    `kerbInvariant.test.ts`, `townMap.test.ts` green; >80% on every touched
    logic module)
  - [x] Measure the delta with the GL-counter method and `pnpm assets:measure`
    (expected ≈−4.1k triangles / ≈−10 draws), recorded for Phase 6's roll-up

  **Found and fixed (in-flight correction, Workflow Task Correction 1):** the
  task title, this plan's wording and FR10 said "the two roomiest kerbs are
  removed" — the opposite of lever one ("four cars on the four roomiest
  kerbs"). The placement suite's measured wall gaps decide the pair: the two
  tightest went — house-1's kerb (sedan@(0,2), gap 0.038) and house-3's
  (hatchback@(0,3), gap 0.071) — and the kept four stand at the largest gaps
  (0.074 / 0.081 / 0.119 / 0.147). Spec FR10 and the Flagged Assumption were
  corrected in `afcc114`.
  **Measured (input to Phase 6's roll-up):** `pnpm assets:measure` — sedan.glb
  2,032 tris and hatchback-sports.glb 2,088 tris per instance (4 draw calls
  each) + 2 blob quads = **4,124 triangles and 8 draws removed**. GL-counter
  hook at the dev server (30 steady frames): 51,130 → **47,064 tris** and
  171 → **163 draws** (−4,066 / −8; the 58-triangle gap between the model
  sum and the frame count is the same kind of session quirk the parked-cars
  pass recorded as +12,820 measured vs +12,808 predicted). The scene is under
  the ~50k heuristic again, with ≈4.1k headroom for the two movers. 715
  tests / 57 files green (712 baseline − 1 superseded six-count test + 4 new).
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `be8a4c7`

## Phase 2 – Per-car motor options and the wandering brain (TDD) [checkpoint: c0d59b0]

- [x] Task: Per-instance speed and turn rate (FR2) `1283b09`
  - [x] Write failing tests: `createVehicleMotor` accepts `speed`/`turnRate` in
    `VehicleMotorOptions`, defaults exactly to today's `DRIVE_SPEED` 1.6 /
    `TURN_RATE` 4.5 (the existing suite must pass untouched as the
    default-behaviour proof); a motor at 0.9 covers ground at 0.9 per second
    under the same frame-driven harness (red first)
  - [x] Implement the two options in `vehicleMotor.ts`, constants becoming
    defaults rather than module globals
  - [x] Refactor + coverage (`vehicleMotor.test.ts` stays the densest suite in
    the repo; residue ≥94% branches as today)

  **Done:** 2 red tests (1.6 covered instead of 0.9; 0.225 rad turned instead
  of 0.1) then green in `1283b09`; the untouched 36-test suite is the
  default-behaviour proof. 717 tests / 57 files; `vehicleMotor.ts` 100%
  stmts / 95% branch (above the ≥94% bar).
- [x] Task: Seeded endless route brain (FR2) `c0d59b0`
  - [x] Write failing tests for `trafficBrain`: from a start tile it targets a
    random *other* road tile via `roadRoute`, hands over waypoints, and picks a
    fresh destination the moment one is reached — never stationary across a
    scripted session; same seed ⇒ identical target sequence; different seeds
    diverge; the injected RNG is the only randomness (10+ tests, red first)
  - [x] Implement `trafficBrain.ts` as pure logic over `pathfinder`'s API — no
    three.js, no wall clock, frame-driven `update(delta)` like every other
    logic module
  - [x] Refactor + coverage (≥80%, ideally 100% statements on
    `trafficBrain.ts`)

  **Done:** 11 red tests (module missing) then green in `c0d59b0`.
  **Found and fixed (refactor step):** Biome's complexity gate flagged `take()`
  at 22 > 15 — the leg enumeration moved out as `reachableLegs()`.
  728 tests / 58 files; `trafficBrain.ts` 100% statements/branch/funcs/lines.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `c0d59b0`

## Phase 3 – Lane discipline and dynamic collision feed (TDD) [checkpoint: e2ef6e5]

- [x] Task: Fixed lateral bias and the pass-clearance contract (FR3) `c8c546d`
  - [x] Write failing tests: each car holds its authored lateral bias (opposite
    pair); sampling every straight road tile, a head-on pass and an overtake
    between the two fitted footprints never overlap — the bias derived from the
    widest fitted model (sedan half-width 0.162 at 0.55 fit) plus a named
    clearance constant; on curves the bias follows the tangent so a car never
    clips a kerb top by more than a measured slack (red first)
  - [x] Implement bias application in the brain's waypoint handoff (offset
    perpendicular to the leg), with `TRAFFIC_LATERAL_BIAS` and
    `TRAFFIC_PASS_CLEARANCE` as named, measured constants
  - [x] Refactor + coverage

  **Done:** 7 FR3 red tests (constants undefined, no lane points) plus 3 FR2
  contracts evolved from road centres to lane points; green in `c8c546d`.
  735 tests / 58 files; `trafficBrain.ts` 94.7% stmts / 91.4% branch (residue =
  index guards under `noUncheckedIndexedAccess`). Lane contract: bias 0.177 =
  widest fitted half-width 0.1618 + half of pass clearance 0.03; kerb slack
  0.04 pins the 0.0388 reach past the kerb band's inner edge.
- [x] Task: Live obstacle supplier in the motor (FR5) `de452d4`
  - [x] Write failing tests: `createVehicleMotor` accepts
    `dynamicObstacles?: () => Obstacle[]`; a moving box entering the sweep is
    reported as a crashable impact that same frame; bump-once-then-pass
    (`passed` ids) applies to dynamic obstacles exactly as to props and resets
    per `setPath`; with no supplier the motor behaves byte-for-byte as today
    (red first)
  - [x] Implement the supplier option and fold its output into the existing
    sweep, keeping ids stable per mover (`traffic-0`, `traffic-1`)
  - [x] Refactor + coverage (`vehicleMotor.test.ts`, `collision.test.ts`)

  **Done:** 4 FR5 red tests (the feed was never swept — the
  `obstacles.length === 0` fast path skipped it) then green in `de452d4`.
  739 tests / 58 files; `vehicleMotor.ts` 100% stmts / 95.5% branch. One feed
  read per sweep; no-supplier parity pinned by test; the walker test pins
  re-read-every-frame against snapshot implementations.
- [x] Task: The one collision language, mover to mover (FR4) `e2ef6e5`
  - [x] Write failing tests: kid→mover bonks, squishes and resumes with the
    route cursor advancing and the mover's route untouched; mover→mover at a
    junction squashes (both report impact) and both carry on; no dynamic
    obstacle is ever `solid`; nothing in the feed can abandon a leg or strand a
    car (red first)
  - [x] Implement nothing beyond the feed — prove the semantics hold from
    Phase 2–3 pieces (add only what a red test proves missing)
  - [x] Refactor + coverage

  **Done:** 3 FR4 red tests — 2 were arrival-assertion slips (the motor parks
  within `ARRIVAL_RADIUS`, not on the point), 1 genuine (a misflagged `solid`
  feed entry stranded the car 1.63 short). Minimal fix: `asCrashable()` forces
  feed entries crashable — the feed cannot change the language. Green in
  `e2ef6e5`. 742 tests / 58 files.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `e2ef6e5`

## Phase 4 – Traffic system and input parity (TDD) [checkpoint: 21832b2]

- [x] Task: Self-contained `trafficSystem` (FR9) `af1cfde`
  - [x] Write failing tests for the module's contract:
    `createTrafficSystem({ grid, seed, obstacles })` owns its two motors and
    brains; `update(delta)` advances both; `footprints()` publishes both live
    boxes with stable ids; it exposes **nothing else** — no camera target, no
    engine rate, no tap handler (asserted as absent surface); a scripted
    session of N frames is deterministic (red first)
  - [x] Implement `trafficSystem.ts` composing `trafficBrain` + `vehicleMotor`
    (this is the `setPath` comment's anticipated "second car")
  - [x] Refactor + coverage (≥80%)

  **Done:** 6 FR9 red tests (module missing) then green in `af1cfde`. 748 tests /
  59 files; `trafficSystem.ts` 100% statements (branch residue =
  `noUncheckedIndexedAccess` fallbacks). The absent-surface keys assertion pins
  FR9: `footprints` + `update`, and nothing else. Each motor's sweep radius is
  its own fitted half-width, so capsule-vs-box sweeps honour
  `TRAFFIC_PASS_CLEARANCE` exactly.
- [x] Task: Input parity regression (FR6) `21832b2`
  - [x] Write failing tests: movers publish no prop identity — the router's
    0.45 snap never selects one; a tap on a mover's screen position resolves to
    the finger's ground point; movers never appear as mission targets in
    `answerMissions` or `missionFocus` inputs (red first — pinning tests
    against a future mistake)
  - [x] Implement nothing unless red proves a gap (movers are not town props,
    so this should hold by construction — the tests are the guard)
  - [x] Refactor + coverage

  **Done:** 3 FR6 guard tests in `inputParity.test.ts` — no prop identity (the
  0.45 tap-snap can never select one), a tap on a mover resolves to the
  finger's ground point through the real router, and a mover id is never a
  MissionId. One red on the first run was an authoring slip (the expected key
  array was unsorted), not a gap: footprints already publish exactly
  {id, shape, solid}. Nothing implemented, as anticipated. 751 tests / 60 files.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `21832b2`

## Phase 5 – Actors, fit and following blob shadows (manual-verify, exempt from TDD) [checkpoint: 04164c6]

- [x] Task: Mount the two movers (FR1, FR2) `7f1b835`
  - [x] Mount sedan and hatchback-sports through `vehicleActor` at the parked
    cars' 0.55 fit, `MODEL_FACING_YAW`-aligned to the route heading, seat on
    the road surface, `castsShadow: false`; measure each fitted model with
    `pnpm assets:measure` and record the per-model triangles (the spec's
    ≈−3.9k assumption gets its real number here)
  - [x] Manual steps recorded in the commit note: `pnpm dev`, watch two cars
    trundle and turn smoothly at corners

  **Done:** `trafficActors.ts` mounts both through `vehicleActor` on read-only
  pose mirrors (`trafficSystem.poses()`), `fitLength: PARKED_CAR_FIT` (0.55),
  `castsShadow: false`. **In-flight correction to the sub-task's wording:**
  Car Kit art is authored facing +z (kit-mount-measurements.md), so the movers
  mount at the fleet's `FLEET_FACING_YAW` (0) — `MODEL_FACING_YAW`'s π would
  drive them cab-last, invisible on a parked car but glaring on a mover.
  `vehicleActor`'s motor parameter is narrowed to the `VehiclePose` it always
  actually read, so the motors stay sealed (FR9). Measured per model (the
  spec's ≈−3.9k assumption gets its real number): sedan.glb 2,032 tris,
  hatchback-sports.glb 2,088 tris → **4,120 model triangles** — the 0.55 fit is
  a transform, so the kit count is the count. 752 tests / 60 files. The plan's
  manual steps are recorded in the commit note as written; they run at Phase
  6's wiring, when the cars can actually trundle.
- [x] Task: Following merged blob shadow (FR8) `04164c6`
  - [x] Build both blobs as **one dynamic mesh** in `trafficShadows.ts` —
    per-car sun-aligned offset/stretched quads exactly in `parkedShadows`'
    language (offset sign asserted as `dot(offset, sun.xz) < 0`), translated
    with their car per frame, 1 draw call, absent from collision, taps and the
    shadow-map pass (13-style tests in `trafficShadows.test.ts`, same shape as
    `parkedShadows.test.ts`; note: blob translation is visual glue — the
    geometry contract is still tested)
  - [x] Manual verification recorded: blobs fall to the same side as the
    houses' real shadows while the cars move

  **Done:** `trafficShadows.ts` with pure `trafficShadowQuads` (live footprints
  + per-kind sun offsets) and `mountTrafficShadows` — one merged
  `BufferGeometry` whose vertices `sync()` rewrites every frame, one draw call.
  14 geometry-contract tests in `parkedShadows.test.ts`'s shape. Two red tests
  on the first run were float32 precision slips in the assertions (vertex
  positions are float32; the containment margin sums in two orders), not
  product gaps. 766 tests / 61 files. The manual verification is recorded in
  the commit note as written; it runs at Phase 6's wiring.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `04164c6`

## Phase 6 – Wiring, measurements, docs and device pass (mixed)

- [ ] Task: Scene wiring and hero isolation (FR7, FR9)
  - [ ] Wire `trafficSystem` into `main.ts`: one `update` call in `advance()`,
    `footprints()` folded into the kid's motor supplier alongside
    `collectObstacles`, the blob mesh joining `town.group`; assert (by the
    Phase 4 surface) the camera target, `audio.setEngine`, `swapVehicle` and
    the bonk counter still read only the kid's motor; **movers stay silent** —
    no audio node is created for them
  - [ ] Manual drive-through by the track owner: head-on bonk with a mover, a
    junction crossing of two movers, a tap onto a mover's position — all three
    resolve as gentle comedy (agent-driven taps cannot pass the router's
    newest-command filter, so this pass is the owner's)
- [ ] Task: Full gates + measurements + docs (NFR2, NFR4, AC5)
  - [ ] Run `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` and coverage —
    >80% on every logic module touched
  - [ ] Measure the assembled scene (4 parked + 2 movers + 1 blob mesh) with
    the GL-counter method; confirm precache entries/KiB unchanged (zero new
    bytes); record all of it in `tech-stack.md` with the honest budget note —
    **must not exceed 51,130 / 171**; if over, pull the FR10 escape and drop
    to two parked cars before declaring done
  - [ ] `product.md` moves light wandering traffic to the shipped line;
    `docs/playtest.md` gains the traffic section
- [ ] Task: Device pass (AC1–AC4, AC6, AC8)
  - [ ] iPad sitting: town reads alive at play distance, bonks feel funny not
    scary, all four missions complete with traffic driving, fps unchanged
    within noise, works offline; verdicts recorded in `docs/playtest.md`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
