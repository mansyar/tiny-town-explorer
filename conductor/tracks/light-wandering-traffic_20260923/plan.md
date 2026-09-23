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

## Phase 2 – Per-car motor options and the wandering brain (TDD)

- [ ] Task: Per-instance speed and turn rate (FR2)
  - [ ] Write failing tests: `createVehicleMotor` accepts `speed`/`turnRate` in
    `VehicleMotorOptions`, defaults exactly to today's `DRIVE_SPEED` 1.6 /
    `TURN_RATE` 4.5 (the existing suite must pass untouched as the
    default-behaviour proof); a motor at 0.9 covers ground at 0.9 per second
    under the same frame-driven harness (red first)
  - [ ] Implement the two options in `vehicleMotor.ts`, constants becoming
    defaults rather than module globals
  - [ ] Refactor + coverage (`vehicleMotor.test.ts` stays the densest suite in
    the repo; residue ≥94% branches as today)
- [ ] Task: Seeded endless route brain (FR2)
  - [ ] Write failing tests for `trafficBrain`: from a start tile it targets a
    random *other* road tile via `roadRoute`, hands over waypoints, and picks a
    fresh destination the moment one is reached — never stationary across a
    scripted session; same seed ⇒ identical target sequence; different seeds
    diverge; the injected RNG is the only randomness (10+ tests, red first)
  - [ ] Implement `trafficBrain.ts` as pure logic over `pathfinder`'s API — no
    three.js, no wall clock, frame-driven `update(delta)` like every other
    logic module
  - [ ] Refactor + coverage (≥80%, ideally 100% statements on
    `trafficBrain.ts`)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 – Lane discipline and dynamic collision feed (TDD)

- [ ] Task: Fixed lateral bias and the pass-clearance contract (FR3)
  - [ ] Write failing tests: each car holds its authored lateral bias (opposite
    pair); sampling every straight road tile, a head-on pass and an overtake
    between the two fitted footprints never overlap — the bias derived from the
    widest fitted model (sedan half-width 0.162 at 0.55 fit) plus a named
    clearance constant; on curves the bias follows the tangent so a car never
    clips a kerb top by more than a measured slack (red first)
  - [ ] Implement bias application in the brain's waypoint handoff (offset
    perpendicular to the leg), with `TRAFFIC_LATERAL_BIAS` and
    `TRAFFIC_PASS_CLEARANCE` as named, measured constants
  - [ ] Refactor + coverage
- [ ] Task: Live obstacle supplier in the motor (FR5)
  - [ ] Write failing tests: `createVehicleMotor` accepts
    `dynamicObstacles?: () => Obstacle[]`; a moving box entering the sweep is
    reported as a crashable impact that same frame; bump-once-then-pass
    (`passed` ids) applies to dynamic obstacles exactly as to props and resets
    per `setPath`; with no supplier the motor behaves byte-for-byte as today
    (red first)
  - [ ] Implement the supplier option and fold its output into the existing
    sweep, keeping ids stable per mover (`traffic-0`, `traffic-1`)
  - [ ] Refactor + coverage (`vehicleMotor.test.ts`, `collision.test.ts`)
- [ ] Task: The one collision language, mover to mover (FR4)
  - [ ] Write failing tests: kid→mover bonks, squishes and resumes with the
    route cursor advancing and the mover's route untouched; mover→mover at a
    junction squashes (both report impact) and both carry on; no dynamic
    obstacle is ever `solid`; nothing in the feed can abandon a leg or strand a
    car (red first)
  - [ ] Implement nothing beyond the feed — prove the semantics hold from
    Phase 2–3 pieces (add only what a red test proves missing)
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Traffic system and input parity (TDD)

- [ ] Task: Self-contained `trafficSystem` (FR9)
  - [ ] Write failing tests for the module's contract:
    `createTrafficSystem({ grid, seed, obstacles })` owns its two motors and
    brains; `update(delta)` advances both; `footprints()` publishes both live
    boxes with stable ids; it exposes **nothing else** — no camera target, no
    engine rate, no tap handler (asserted as absent surface); a scripted
    session of N frames is deterministic (red first)
  - [ ] Implement `trafficSystem.ts` composing `trafficBrain` + `vehicleMotor`
    (this is the `setPath` comment's anticipated "second car")
  - [ ] Refactor + coverage (≥80%)
- [ ] Task: Input parity regression (FR6)
  - [ ] Write failing tests: movers publish no prop identity — the router's
    0.45 snap never selects one; a tap on a mover's screen position resolves to
    the finger's ground point; movers never appear as mission targets in
    `answerMissions` or `missionFocus` inputs (red first — pinning tests
    against a future mistake)
  - [ ] Implement nothing unless red proves a gap (movers are not town props,
    so this should hold by construction — the tests are the guard)
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 – Actors, fit and following blob shadows (manual-verify, exempt from TDD)

- [ ] Task: Mount the two movers (FR1, FR2)
  - [ ] Mount sedan and hatchback-sports through `vehicleActor` at the parked
    cars' 0.55 fit, `MODEL_FACING_YAW`-aligned to the route heading, seat on
    the road surface, `castsShadow: false`; measure each fitted model with
    `pnpm assets:measure` and record the per-model triangles (the spec's
    ≈−3.9k assumption gets its real number here)
  - [ ] Manual steps recorded in the commit note: `pnpm dev`, watch two cars
    trundle and turn smoothly at corners
- [ ] Task: Following merged blob shadow (FR8)
  - [ ] Build both blobs as **one dynamic mesh** in `trafficShadows.ts` —
    per-car sun-aligned offset/stretched quads exactly in `parkedShadows`'
    language (offset sign asserted as `dot(offset, sun.xz) < 0`), translated
    with their car per frame, 1 draw call, absent from collision, taps and the
    shadow-map pass (13-style tests in `trafficShadows.test.ts`, same shape as
    `parkedShadows.test.ts`; note: blob translation is visual glue — the
    geometry contract is still tested)
  - [ ] Manual verification recorded: blobs fall to the same side as the
    houses' real shadows while the cars move
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

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
