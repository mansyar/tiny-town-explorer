# Plan: Mission Framework Consolidation + Unified Completion Sparkle

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.

## Phase 1 – Characterization safety net (TDD) [checkpoint: ad610d6]

*Write the AC3/AC4/AC5 tests against **current** behavior before touching
anything — they pin today's semantics and must stay green through every later
phase.*

- [x] Task: Per-mission state matrix (AC3) `197324f`
  - [x] Write matrix tests: for each of fire / ice cream / park / puppy × each FSM state, assert marker visibility and tap-correctness (no puppy spot tappable during fire mission, no cone after serve, etc.), red first where a gap exists
  - [x] Implement only missing assertions/minimal hooks; coverage on new test helpers
- [x] Task: Mid-mission abort parity harness (FR6, AC4) `e9c4953`
  - [x] Write tests that tear down each mission in every state (armed marker, celebrating, lingering) and assert full cleanup — no orphan markers, no post-abort celebration, no sparkle-pending leakage
  - [x] Implement minimal fixes only if current behavior is under-specified; document any divergence in the task note
- [x] Task: Frozen-contract baseline (FR5, AC5) — frozen baseline: missionBusy 5 + calmGapPacer 13 + missionFocus 13 = **31 tests / 3 files**, zero diff vs branch point `0c177b2`
  - [x] Verify `missionBusy` / `calmGapPacer` / `missionFocus` suites pass **unmodified**; record their test counts as the frozen baseline (no code changes)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `ad610d6`

## Phase 2 – Generic mission FSM (TDD) [checkpoint: a71f890]

- [x] Task: FSM core module `f78bbf3`
  - [x] Write failing tests for the state machine contract: declared states, guarded transitions, tick/tap delegation, exactly-one transition per update, celebration entry fires once (red first)
  - [x] Implement the generic FSM module configured per mission
  - [x] Refactor + coverage (>80% on the new logic module) — 100% stmts/branch/funcs
- [x] Task: Abort/teardown semantics in the FSM (FR6) `f78bbf3` (abort landed in the same red-green cycle as the core; see task note)
  - [x] Write failing tests: `abort()` from any state returns to idle and emits cleanup, including mid-celebration (red first)
  - [x] Implement + coverage
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `a71f890`

## Phase 3 – Shared marker layer (TDD) [checkpoint: 04af704]

- [x] Task: Marker adapter contract `b35af45`
  - [x] Write failing tests: one adapter interface covers cone/ring, litter, puppy spot, fire target — show/hide/arm/disarm/tap-resolution driven by FSM state (red first)
  - [x] Implement the shared marker module
  - [x] Refactor + coverage (>80%) — missionMarkers.ts: 100% stmts/branch/funcs
- [x] Task: Migrate the four missions' markers onto the adapter `10be20b`
  - [x] Re-point fire, order, litter, puppy markers through the shared layer; Phase 1 matrix tests are the acceptance gate (must stay green)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `04af704`

## Phase 4 – Shared celebration/linger + unified completion sparkle (TDD) [checkpoint: 0542340]

- [x] Task: Celebration & linger as data
  - [x] Write failing tests: confetti/cheer/sun recipe per mission expressed as data; linger duration preserved per mission; celebration fires exactly once (red first)
  - [x] Implement the shared celebration module
- [x] Task: Unified completion sparkle (FR4, AC6) `0c847a1`
  - [x] Write failing tests: fires exactly once per completion; zero fires in free play or mission start; survives tap-spam and interruption during linger (red first)
  - [x] Implement the completion-site sparkle trigger (logic) + FX hook (manual-verify), paired with existing celebration audio — never sound-only
  - [x] Refactor + coverage (>80% on sparkle/celebration logic) — missionCelebration.ts: 100% stmts/branch/funcs
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `0542340`

## Phase 5 – Mission migration + deletion (mixed) [checkpoint: f71a51d]

- [x] Task: Move all four missions onto the framework (AC7) `eef84ae`
  - [x] Convert fire, ice cream, park, puppy FSM/marker/celebration code to configuration + adapters; delete bespoke transition code; full suite green after each mission — all four now declare stages + linger and let `missionFsm` own transitions; `completeElapsed`/`let state`/`toIdle` survive only inside the framework. In-flight refinement: the framework gained `onIdle` (the linger's return to idle) so each mission drops its own side data there; 5 new FSM tests, red first. Suite green after each mission (fire → ice cream → park → puppy): 48 files / 603 tests.
- [x] Task: Puppy visibility correction (TDD + scene) — FR7, AC8 (found in the Phase 5 gate) `f71a51d`
  - [x] Write failing tests: every authored hiding spot stands clear of every house footprint, and a legal car position exists within the drive-over radius of it (the Phase 5 walkthrough showed `spot-garden` unreachable behind `house-4` and `spot-verge` inside `house-5`'s wall), plus the paw marker's over-occluder draw settings (red first — 5 failures)
  - [x] Re-author the two lot spots onto kerbside ground the car can actually reach (`spot-garden` on house-4's east kerb, `spot-verge` on house-5's south verge); keep the two park hides, where hiding is honest
  - [x] Render the paw marker over town geometry so the signpost survives the pup hiding behind a house, tree or dumpster — `depthTest: false`, `depthWrite: false`, drawn after the scene; the heart keeps normal depth testing because it floats above the roofline
  - [x] Gates: `pnpm check` + `pnpm typecheck` + `CI=true pnpm test` → 50 files / 617 tests green
- [x] Task: `main.ts` wiring (manual-verify) `f71a51d` (no code change — the migration left `main.ts`'s mission surface byte-identical, so this task verifies rather than edits)
  - [x] Confirm registry/tick/tap paths unchanged externally; manual walkthrough spawn → respond → celebrate → sparkle for each mission — statically confirmed: all four mission public APIs identical and the registry/tick/tap paths untouched (`git diff` on `main.ts` shows only the dev `?calmGap` override). Played through by the track owner via `?calmGap=2`: four missions spawn → respond → celebrate → sparkle once at their own sites, nothing in free play, no orphan markers at idle. The walkthrough also surfaced FR7 (the puppy correction above), which was fixed and re-verified before this checkpoint.
  - [x] Verification affordance (in-flight refinement, `0b46ad4`): dev-only `?calmGap=<seconds>` shortens the town's calm gap so the four-mission walkthrough does not spend minutes waiting. Shorten-only (capped at the shipped maximum), DEV-gated, absent from the production bundle (verified by build + grep of `dist/`); busy pause and never-twice rule untouched.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `f71a51d`
  - [x] Scope read with `git diff --name-only 0542340 HEAD`; every changed code file has a test file. Command: `CI=true pnpm test` → 50 files / 617 tests pass. Manual plan presented (four-mission walkthrough at `?calmGap=2`, exactly one sparkle per completion and none in free play, every puppy spot reachable, paw print visible over occluders); user confirmed ✓. Report attached as a git note on `f71a51d`.

## Phase 6 – Verification + docs

- [x] Task: Full gates (AC1, AC2, NFR1–NFR3) `2c8e3aa`
  - [x] `pnpm check` (118 files clean), `pnpm typecheck` (clean), `CI=true pnpm test` → **50 files / 617 tests** pass; coverage >80% on logic modules — missionFsm/parkMission/puppyMission/parkPickup/orderFlow/missionMarkers/missionCelebration/devCalmGap/fireFx 100%, missionManager 97.14%, puppySpots 97.67%, puppyMarker 98.46%, iceCreamMission 95.45%, `game/mission` 87.03% including the workflow-exempt scene builders (parkLitterFx and puppyFx at 0%, as designed)
  - [x] Re-measured the scene budget for the sparkle delta by the v1 method (real render loop, `renderer.info` between frames, shadow pass included, pixel ratio 1.5): **37,802 triangles / 133 draw calls / 148 meshes** against the 37,904 / 134 / 106 baseline. The sparkle rides the existing burst pool, so the four-mission scene lands at or below the v1 figures — NFR3 holds with no ratchet. Probe removed and the entry file restored byte for byte (`git diff` on `main.ts` empty)
- [x] Task: Four-mission desktop playthrough (AC1) `f71a51d`
  - [x] Drive all four missions end to end: no unintended visible change; the sparkle pops exactly once at each mission's own completion site (revised from the town hall, which the town does not have), absent in free play. Run by the track owner against the dev server during the Phase 5 gate; the framework's own evidence is that every mission's public API and `main.ts`'s registry/tick/tap paths are unchanged, with the Phase 1 matrix, abort-parity and frozen-contract suites as the gate. Independently confirmed here that the built scene boots and renders the four-mission town at the measured cost
- [x] Task: Update `docs/playtest.md` and `tech-stack.md` with AC results and any measured deltas `2c8e3aa`
  - [x] `docs/playtest.md` gained the track's AC1–AC8 table, the re-measured budget table (with the mesh-count caveat), how the pass was driven (dev `?calmGap`, temporary probe, byte-for-byte restore), and the puppy correction as the issue the pass turned up; `tech-stack.md` carries the re-measured figures, the consolidation note, and the current test/precache counts
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## History

- 2026-09-22 – Phase 5 gate found a defect in shipped lost-puppy work: two of
  the four authored hiding spots sat inside a house's 0.86-tile footprint
  (`spot-garden` in `house-4`, `spot-verge` in `house-5`), and the paw marker —
  the mission's only ground-level marker — was occludable by the very props the
  pup hides behind. `spot-garden` is worse than cosmetic: hemmed by adjacent
  houses whose gaps are narrower than the car, it leaves the pup unreachable,
  and an unfinishable errand holds the town's busy gate shut for the rest of
  the session. Fixed under FR7/AC8 by amending this track's spec (the
  out-of-scope entry for marker visuals now carries an explicit exception,
  approved by the track owner) rather than opening a separate track.
- 2026-09-22 – Phase 5 in flight. The migration left `main.ts` untouched (all
  four mission public APIs identical), so the phase's human gate is a
  four-mission playthrough — and the town's 60–90s calm gap turned that gate
  into minutes of waiting. A dev-only `?calmGap=<seconds>` override was added
  under the manual-verify task per workflow.md "In-Flight Refinements": it
  changes no shipped behavior and is dropped from production builds.
- 2026-09-22 – Track created from an approved spec. Phase 1 deliberately
  writes characterization tests *before* refactor work so the consolidation
  has a behavior-pinning safety net (the review-lesson pattern already in
  README: "faults lived in wiring").
