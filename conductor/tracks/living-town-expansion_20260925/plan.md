# Implementation Plan: Living Town Expansion

## Design Direction

- Reuse `createTrafficBrain`, `createVehicleMotor`, the seeded RNG, `ModelLibrary`, and the existing dynamic-obstacle seam.
- Keep ambient actors inside the existing traffic boundary; do not create a generalized entity/component framework.
- Prefer existing Car Kit models and compact primitives. Add no GLB unless visual review and measurement justify it.
- Preserve the existing mission, input-router, camera, audio, and HUD contracts.
- Treat visual/scene work as manually verified; use TDD for route, profile, collision, and controller behavior.

## Phase 1 — Baseline and content contract

- [x] **Task: Capture the pre-change render and behavior baseline**
  - [x] Record fresh-spawn, transit, settled-junction, and mission-window triangle/draw-call measurements using the existing dev render probe.
  - [x] Record the current test, coverage, typecheck, Biome, and production-build baseline.
  - [x] Store the measurements in the track-local measurement notes.
  - **Commit:** `3f8e494` — `chore(track): record living town expansion baseline`

- [x] **Task: Select the initial ambient roster**
  - [x] Choose 2–3 profiles containing both a road-wanderer profile and a creature profile.
  - [x] Prefer existing Car Kit models and low-poly primitives; do not add a GLB unless measurement and visual review justify it.
  - [x] Define stable IDs, speeds, footprints, route sides, and animation behavior for each profile.
  - [x] Confirm the roster contains 4–6 total instances.
  - **Roster decision:** Keep the three existing sedan/hatchback/van wanderers; add one `parkedSuv` road wanderer and two small creature profiles (`cat`, `rabbit`) for six total instances. The SUV uses the existing Car Kit model and fitted car extents. Creatures use low-poly primitive actors, their own fitted extents/heights, seeded routes, and gentle waddle/hop plus the motor's harmless bonk bounce. New instance IDs are `traffic-3`, `creature-cat-0`, and `creature-rabbit-0`; sides alternate `1`, `-1`, `1` across the new actors and speeds are `0.85`, `0.45`, and `0.35` world units per second respectively.

- [ ] **Task: Lock the scope boundaries**
  - [ ] Confirm no mission, input-router, persistence, HUD, or parent-panel changes are required.
  - [ ] Record the accepted collision behavior as harmless, crashable, and non-blocking.

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Review the baseline and roster against the approved specification.
  - [ ] Announce the exact automated command before running it.
  - [ ] Record the checkpoint SHA in `plan.md` after user verification.

## Phase 2 — Deterministic ambient movement and collision contracts

- [ ] **Task: Write failing tests for the ambient profile contract**
  - [ ] Add tests for profile count, stable IDs, required road-wanderer and creature categories, and finite configuration values.
  - [ ] Add tests for deterministic starts and seeded replay/divergence.
  - [ ] Add tests for valid road routes, lane placement, town bounds, and no stacked initial actors.
  - [ ] Add tests for non-solid footprints and pose/footprint parity.
  - [ ] Add tests proving the traffic system exposes only `update`, `poses`, and `footprints`.
  - [ ] Run the targeted traffic tests and confirm the new assertions fail for the expected missing behavior.

- [ ] **Task: Implement the minimal typed ambient profile and movement extension**
  - [ ] Reuse `createTrafficBrain`, `createVehicleMotor`, and the existing seeded RNG.
  - [ ] Keep profile data in the traffic boundary and avoid a generalized entity/component framework.
  - [ ] Extend the traffic roster without changing the hero vehicle or mission controllers.
  - [ ] Preserve the existing lane-bias and parked-car-clearance contracts.
  - [ ] Use smaller, fitted footprints for creature profiles.
  - [ ] Keep every actor crashable and publish its live footprint through the existing obstacle seam.

- [ ] **Task: Verify the green movement implementation**
  - [ ] Run the targeted traffic tests and confirm the new behavior passes.
  - [ ] Run collision and vehicle-motor tests that cover dynamic, non-solid obstacles.
  - [ ] Run the relevant `game.test.ts` cases to confirm traffic remains mission-independent.
  - [ ] Refactor only duplicated profile/pose plumbing while tests remain green.

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Review all changed logic files and their corresponding tests.
  - [ ] Announce and run the exact phase test command.
  - [ ] Debug failures, document results, and obtain explicit user confirmation.
  - [ ] Attach a verification Git note and record the checkpoint SHA in `plan.md`.

## Phase 3 — Scene mounting, animation, and asset integration

- [ ] **Task: Mount road and creature actors through the existing scene seam**
  - [ ] Extend `trafficActors.ts` to draw the selected car and creature profiles.
  - [ ] Reuse `ModelLibrary` for GLB-backed actors.
  - [ ] Build creature visuals from compact, reusable primitives where possible.
  - [ ] Keep actor scene nodes free of real shadow-map casting when using blob shadows.
  - [ ] Sync position, heading, and profile-specific animation every frame.

- [ ] **Task: Add only the required asset registrations**
  - [ ] If an existing model is reused, avoid new registry imports.
  - [ ] If a new GLB is genuinely required, add its `?url` registry entry, model-library coverage, and PWA precache verification.
  - [ ] Measure asset size and triangle contribution before accepting it.

- [ ] **Task: Update controller wiring and lifecycle ownership**
  - [ ] Mount the expanded traffic actor set through the existing game/controller path.
  - [ ] Confirm update order remains compatible with the active vehicle, missions, and camera.
  - [ ] Confirm teardown/disposal behavior covers all new scene nodes and resources.

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Manually inspect actor scale, seating, facing, animation, shadows, and visual calmness.
  - [ ] Verify no new visible text, audio requirement, or blocking interaction was introduced.
  - [ ] Announce and run the exact automated test/build checks for this phase.
  - [ ] Obtain explicit user confirmation and record the verification checkpoint.

## Phase 4 — Harmless interaction and mission coexistence

- [ ] **Task: Add integration tests for child interaction**
  - [ ] Test that the hero vehicle can bump each new actor category and continue moving.
  - [ ] Test that an actor never publishes a solid obstacle.
  - [ ] Test that traffic updates do not mutate mission state, route commitments, or helper pacing.
  - [ ] Test that all actors remain active during free play and during each mission without blocking the active route.

- [ ] **Task: Verify feedback behavior**
  - [ ] Reuse the existing bonk/feedback language for creature contact.
  - [ ] Confirm any sound cue has a simultaneous visual response.
  - [ ] Confirm actors do not become snap targets, mission targets, or required interactions.

- [ ] **Task: Run the full logic regression suite**
  - [ ] Announce the exact command: `CI=true pnpm test`.
  - [ ] Run the complete test suite and investigate any regressions.
  - [ ] Run coverage for the new/changed logic modules and confirm the project’s >80% target.

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Perform a manual free-play and mission coexistence pass.
  - [ ] Obtain explicit user confirmation.
  - [ ] Attach the verification report as a Git note and record the checkpoint SHA.

## Phase 5 — Render, offline, and device verification

- [ ] **Task: Measure the expansion against the baseline**
  - [ ] Re-run fresh-spawn, transit, junction, and mission-window measurements with equivalent viewport/DPR settings.
  - [ ] Record absolute and relative triangle/draw-call deltas.
  - [ ] If the representative budget is exceeded, reduce instances or optimize the chosen visuals before completion.

- [ ] **Task: Run project quality gates**
  - [ ] Run `pnpm check`.
  - [ ] Run `pnpm typecheck`.
  - [ ] Run `CI=true pnpm test`.
  - [ ] Run the coverage command and review the changed-module result.
  - [ ] Run `pnpm build` and verify the PWA precache contains every required asset.

- [ ] **Task: Perform browser and target-device verification**
  - [ ] Verify ambient movement, harmless bonks, mission coexistence, and no route blockage.
  - [ ] Verify portrait and landscape camera behavior.
  - [ ] Verify offline reopen after the production build.
  - [ ] Verify the iPad 9th-generation floor device where available.
  - [ ] Confirm frame rate remains at the established 60fps target.

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Present the complete automated and manual verification results.
  - [ ] Obtain explicit user confirmation.
  - [ ] Attach the final verification note and record the checkpoint SHA.

## Phase 6 — Review, documentation, and closeout

- [ ] **Task: Review the completed track**
  - [ ] Review the implementation against `spec.md`, `plan.md`, product guidelines, and the workflow.
  - [ ] Check scope discipline, test coverage, asset provenance, performance, and offline behavior.
  - [ ] Append any required review fixes to the plan.

- [ ] **Task: Update project documentation where needed**
  - [ ] Update `tech-stack.md` only if a real technology, dependency, or rendering-contract change occurred.
  - [ ] Update README or asset provenance only when the shipped content changed those facts.

- [ ] **Task: Run final review and quality gates**
  - [ ] Re-run only the checks affected by review fixes.
  - [ ] Confirm the final test/build/device results and working-tree scope.

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Obtain final user confirmation.
  - [ ] Attach the review verification note and record the final checkpoint SHA.
  - [ ] Mark the track ready for implementation completion/archival according to the Conductor workflow.
