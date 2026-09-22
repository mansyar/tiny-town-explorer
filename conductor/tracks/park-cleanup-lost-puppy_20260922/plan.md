# Plan: Park Clean-Up & Lost Puppy Missions

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.

## Phase 1 – Shared foundation: registry seam + four-mission rotation (TDD)

- [x] Task: Mission registry seam (FR13) `ec9f115`
  - [x] Write failing tests for the registry contract: a mission contributes tick/tap/focus; exactly one mission is active at a time; the pass order is stable; a mission with nothing to do contributes nothing (12 tests in `missionRegistry.test.ts`, red first)
  - [x] Implement the registry and move the fire and ice-cream missions behind it — their existing suites stayed green and untouched (445/445 pass)
  - [x] Refactor + coverage (100% on `missionRegistry.ts`, >80% target)
- [x] Task: Four-mission rotation (FR11) `fdb3a13`
  - [x] Write failing tests: the next mission is never the one that just ran; the calm gap stays 60–90 s; any active mission pauses every pacer; the draw is uniform across the other three (12 tests in `missionRotation.test.ts` + `pickHouse` blocks in the three pacer suites, red first)
  - [x] Implement the rotation chooser over the shared calm-gap pacer and busy gate (`missionRotation.ts` + `pickHouse()` passthroughs + `tickPacers` rewired in `main.ts`; 476/476 pass)
  - [x] Refactor + coverage (100% on `missionRotation.ts`, 94% branch on `calmGapPacer.ts`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: `fdb3a13`]

## Phase 2 – Clean Up the Park mission logic (TDD)

- [x] Task: Litter field + spawn placement (FR1) `044c509`
  - [x] Write failing tests: 8 pieces (5 park, 3 kerbside on road-bordering lots), every piece on a reachable non-road tile, placement deterministic under a seeded random (7 tests in `parkLitter.test.ts`, red first)
  - [x] Implement `parkLitter.ts` over the town grid's existing `collectTiles` (via `parkTiles`; kerb draw without replacement from ring-road lots)
  - [x] Refactor + coverage (97% stmts, 83% branch, 100% lines on `parkLitter.ts`)
- [x] Task: Pickup and sweep rules (FR3, FR4, FR5) `f8477d4`
  - [x] Write failing tests: drive-over collects at 0.6 and not at 0.61; one gulp per piece; the ≥150 ms gulp rate-limit; the ability sweeps every piece within 1.5 with one gulp for the group at a 0.5 s cadence; completion fires exactly once, on the last piece (13 tests in `parkPickup.test.ts`, red first)
  - [x] Implement `parkPickup.ts` as pure rules (internal clock; nearest piece per 150 ms window; sweep 1.5/500 ms; collected-id set so stale lists never double-collect; 484/484 pass)
  - [x] Refactor + coverage (100% stmts/branch/funcs/lines on `parkPickup.ts`)
- [x] Task: Park mission FSM + respond tap (FR2, FR5) `91d20d2`
  - [x] Write failing tests: `spawned → responding → collecting → complete → idle`; a tap on a piece responds once (morph + drive); neither a second tap nor driving away ever cancels; the linger is ~2.5 s (9 tests in `parkMission.test.ts`, red first)
  - [x] Implement `parkMission.ts` and `resolveParkTap` (FSM mirrors fire/ice-cream; `resolveParkTap` beside `resolveOrderTap`; 493/493 pass)
  - [x] Refactor + coverage (100% stmts/branch/funcs/lines on `parkMission.ts`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: `91d20d2`]

## Phase 3 – Lost Puppy mission logic + helper hand (TDD)

- [x] Task: Hiding spots + owner house (FR6, FR10) `6b16bd1`
  - [x] Write failing tests: 3+ authored spots, each a reachable non-road tile; the owner house is a house ≥2 tiles from the spot; a spot is never chosen twice running (10 tests in `puppySpots.test.ts`, red first)
  - [x] Implement `puppySpots.ts` (four authored spots; never-twice draw; `chooseOwnerHouse` reuses `MIN_HOUSE_DISTANCE` with zero-failure fallback; 500/500 pass)
  - [x] Refactor + coverage (100% stmts/branch/funcs/lines on `puppySpots.ts` after removing type-only dead branches)
- [x] Task: Siren latch, pickup and homecoming (FR7, FR8, FR9, FR10) `ea10089`
  - [x] Write failing tests: no marker and no delivery before the siren; the siren latches "answered" exactly once and blooms the paw; pickup inside 0.6 and not at 0.61; the heart exists only while carrying; delivery needs the house tap inside 1.9; one marker at every state (8 red-first FSM tests in `puppyMission.test.ts`; marker visibility is state-derived and verified in Phase 5 wiring)
  - [x] Implement `puppyMission.ts` and its gates (FSM + `resolvePuppyTap`; `PICKUP_RADIUS` exported from `parkPickup.ts` for reuse; 508/508 pass)
  - [x] Refactor + coverage (100% stmts/branch/funcs/lines on `puppyMission.ts`)
- [x] Task: Helper hand across four missions (FR12) `7a974c4`
  - [x] Write failing tests: `missionFocus` resolves exactly one destination for four missions — litter while the park asks, the siren button before the puppy is answered, the paw spot after, the owner house while carrying (6 new red-first tests, 13 total in `missionFocus.test.ts`)
  - [x] Implement the four-way focus + the siren-button target (priority chain fire → order → park → puppy; `target: 'siren'` marker for the HUD button; `parkAwaitsKid` exported from `parkMission.ts`; 514/514 pass)
  - [x] Refactor + coverage (100% stmts/branch/funcs/lines on `missionFocus.ts` and `parkMission.ts`)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Art and audio assets (manual-verify, exempt from TDD)

- [ ] Task: Litter meshes + park dumpster mount (FR1)
  - [ ] Build the tied-bag and crumpled-paper primitives, mount the vendored `dumpster.glb` through the existing registry/pack path (its tests may need the new entry), and record the manual steps — readable at 48px, bounces, sits flush on the ground
- [ ] Task: The puppy mesh (FR14)
  - [ ] Build the pup from primitives in the props' lit material family, ≤4 shared materials, ~200–300 triangles; record the manual steps — reads as a puppy at play distance, hops aboard, runs to the door
- [ ] Task: Source and transcode the CC0 bark (FR15)
  - [ ] Licence-check a CC0 bark source, transcode to mono 44.1 kHz MP3 with loudness normalisation, place it in `src/assets/audio/` with provenance beside it, register it in the audio registry, and measure the byte delta for the precache note
- [ ] Task: Sweep FX + celebration wiring (reuse-verified, no new code)
  - [ ] Confirm reuse: the `gulp` burst on a sweep, a `poof` per collected piece, `confetti` + `cheer` + `sunFx` on both completions; record the manual steps
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 – Wiring (mixed: logic TDD, glue manual)

- [ ] Task: `main.ts` integration through the registry (FR1–FR10)
  - [ ] Write failing tests for the wiring decisions only, implement, then manual-verify spawn → respond → collect → celebrate and spawn → whine → siren → pickup → deliver
- [ ] Task: HUD police-button pulse hint (FR6)
  - [ ] Implement the pulse and its clear on answer; manual-verify it reads as an invitation and never competes with the ability button
- [ ] Task: Input routing (FR2, FR7, FR10)
  - [ ] Write tests for the routing decisions (tap a piece = respond; tap the owner house = deliver only while carrying and in range; the ability press latches the siren once; newest-wins preserved), implement, then manual-verify on touch
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6 – Verification + docs

- [ ] Task: Full gates (NFR2, NFR4)
  - [ ] `pnpm check`, `pnpm typecheck`, `CI=true pnpm test`, coverage >80% on logic; measure the new triangle and precache deltas
- [ ] Task: Device pass (AC11)
  - [ ] Desktop drive of both missions in the real render loop, then the iPad sitting — bark, gulp and cheer audible, and again with sound off
- [ ] Task: Update `docs/playtest.md` with AC1–AC11 results
- [ ] Task: Update `tech-stack.md` — the puppy/litter/dumpster triangle delta and the bark clip with its provenance
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## History

- 2026-09-22 – Track created from an approved spec and plan. Both remaining
  roadmap missions were deliberately bundled into one track (the user's choice),
  which is why Phase 1 lands the shared seam before either mission body exists.
