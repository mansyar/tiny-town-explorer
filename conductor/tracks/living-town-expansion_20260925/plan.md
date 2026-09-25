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

- [x] **Task: Lock the scope boundaries**
  - [x] Confirm no mission, input-router, persistence, HUD, or parent-panel changes are required.
  - [x] Record the accepted collision behavior as harmless, crashable, and non-blocking.
  - **Scope boundary:** Reuse the existing traffic, collision, render-loop, and scene-mount seams. Add only ambient actor types, deterministic movement/footprint contracts, primitive scene actors, and the one-time game update/sync wiring needed for their animation. Do not change mission/input-router semantics, persistence, HUD/parent controls, dependencies, or public product behavior.
  - **Collision contract:** Every new actor publishes a live non-solid footprint; a contact uses the existing crashable bump-once-then-pass path, briefly recoils, never blocks a route, and never creates a failure state.
  - **Commit:** `898c42c` — `chore(track): define living town ambient roster`

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [x] Review the baseline and roster against the approved specification.
  - [x] Announce the exact automated command before running it.
  - [x] Record the checkpoint SHA in `plan.md` after user verification.
  - **Checkpoint:** `5f1b157` — user-approved baseline, roster, scope, and `pnpm check` result.
  - **Verification note:** `git notes show 5f1b157`

## Phase 2 — Deterministic ambient movement and collision contracts

- [x] **Task: Write failing tests for the ambient profile contract**
  - [x] Add tests for profile count, stable IDs, required road-wanderer and creature categories, and finite configuration values.
  - [x] Add tests for deterministic starts and seeded replay/divergence.
  - [x] Add tests for valid road routes, lane placement, town bounds, and no stacked initial actors.
  - [x] Add tests for non-solid footprints and pose/footprint parity.
  - [x] Add tests proving the traffic system exposes only `update`, `poses`, and `footprints`.
  - [x] Run the targeted traffic tests and confirm the new assertions fail for the expected missing behavior.
  - **Red result:** `pnpm test -- src/game/traffic/trafficSystem.test.ts src/game/vehicle/vehicleMotor.test.ts` failed only on the new six-instance roster assertions and fitted-creature capsule assertion; 51 existing assertions passed.
  - **Commit:** `20b9be0` — `test(traffic): specify ambient roster contracts`

- [x] **Task: Implement the minimal typed ambient profile and movement extension**
  - [x] Reuse `createTrafficBrain`, `createVehicleMotor`, and the existing seeded RNG.
  - [x] Keep profile data in the traffic boundary and avoid a generalized entity/component framework.
  - [x] Extend the traffic roster without changing the hero vehicle or mission controllers.
  - [x] Preserve the existing lane-bias and parked-car-clearance contracts.
  - [x] Use smaller, fitted footprints for creature profiles.
  - [x] Keep every actor crashable and publish its live footprint through the existing obstacle seam.
  - **Implementation:** Added the SUV, cat, and rabbit roster; fitted creature extents are shared by traffic footprints, motor capsules, and blob-shadow heights. Existing traffic brains, seeded starts, lane bias, and dynamic obstacle publication remain the movement path.
  - **Commit:** `cd89651` — `feat(traffic): add living town ambient actors`

- [x] **Task: Verify the green movement implementation**
  - [x] Run the targeted traffic tests and confirm the new behavior passes.
  - [x] Run collision and vehicle-motor tests that cover dynamic, non-solid obstacles.
  - [x] Run the relevant `game.test.ts` cases to confirm traffic remains mission-independent.
  - [x] Refactor only duplicated profile/pose plumbing while tests remain green.
  - **Green result:** Traffic, shadow, brain, collision, motor, and controller suites passed (185 tests); `pnpm typecheck` and `pnpm check` passed.

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [x] Review all changed logic files and their corresponding tests.
  - [x] Announce and run the exact phase test command.
  - [x] Debug failures, document results, and obtain explicit user confirmation.
  - [x] Attach a verification Git note and record the checkpoint SHA in `plan.md`.
  - **Checkpoint:** `cd89651` — user-approved Phase 2 movement and actor implementation.
  - **Verification note:** `git notes show cd89651`

## Phase 3 — Scene mounting, animation, and asset integration

- [x] **Task: Mount road and creature actors through the existing scene seam**
  - [x] Extend `trafficActors.ts` to draw the selected car and creature profiles.
  - [x] Reuse `ModelLibrary` for GLB-backed actors.
  - [x] Build creature visuals from compact, reusable primitives where possible.
  - [x] Keep actor scene nodes free of real shadow-map casting when using blob shadows.
  - [x] Sync position, heading, and profile-specific animation every frame.
  - **Implementation:** Cars continue through the existing model-library path; cat and rabbit bodies use low-poly primitives, waddle/hop with their live pose, and the existing blob-shadow mesh supplies grounding.
  - **Commit:** `cd89651` — `feat(traffic): add living town ambient actors`

- [x] **Task: Add only the required asset registrations**
  - [x] If an existing model is reused, avoid new registry imports.
  - [x] If a new GLB is genuinely required, add its `?url` registry entry, model-library coverage, and PWA precache verification.
  - [x] Measure asset size and triangle contribution before accepting it.
  - **Asset decision:** No new GLB or registry entry. The SUV reuses the existing model; creatures are primitive-built. Scene contribution will be measured against the track baseline in Phase 5.

- [x] **Task: Update controller wiring and lifecycle ownership**
  - [x] Mount the expanded traffic actor set through the existing game/controller path.
  - [x] Confirm update order remains compatible with the active vehicle, missions, and camera.
  - [x] Confirm teardown/disposal behavior covers all new scene nodes and resources.
  - **Lifecycle decision:** Traffic continues to update before actor sync; primitive nodes use the existing scene ownership/disposal path and introduce no new ownership surface.

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [x] Manually inspect actor scale, seating, facing, animation, shadows, and visual calmness.
  - [x] Verify no new visible text, audio requirement, or blocking interaction was introduced.
  - [x] Announce and run the exact automated test/build checks for this phase.
  - [x] Obtain explicit user confirmation and record the verification checkpoint.
  - **Manual result:** Headless browser verification at DPR 1 showed no page errors or console errors. The cat and rabbit were visibly readable, grounded, calm, and free of clipping in focused crops; the SUV was readable on the road with no building intersection. The dev probe reported 342 meshes (25 more than the 317-mesh baseline), zero frustum-culling overrides, and a live average of 49,452 triangles / 177.24 calls over 3,458 samples at 1500×1050.
  - **Automated result:** The first invocation used the POSIX spelling `CI=true` and failed before tests on PowerShell; rerunning with `$env:CI='true'` exposed one stale input-parity ID assertion. After widening that test to the documented traffic/creature ID contract, the corrected gate passed: 67 test files / 866 tests, `pnpm typecheck`, `pnpm check` (156 files), and `pnpm build` (49 precache entries, 4,242.72 KiB). The existing Vite >500 kB chunk warning remains.
  - **Checkpoint:** `5532618` — user-approved Phase 3 scene mounting and integration; the earlier scene implementation is in `cd89651`.
  - **Verification note:** `git notes show 5532618`

## Phase 4 — Harmless interaction and mission coexistence

- [x] **Task: Add integration tests for child interaction**
  - [x] Test that the hero vehicle can bump each new actor category and continue moving.
  - [x] Test that an actor never publishes a solid obstacle.
  - [x] Test that traffic updates do not mutate mission state, route commitments, or helper pacing.
  - [x] Test that all actors remain active during free play and during each mission without blocking the active route.
  - **Test result:** `game.test.ts` now covers SUV/cat/rabbit bump-and-pass behavior, non-solid live footprints, all four mission contexts plus free play, audio/visual bonk feedback, and traffic isolation from mission, route, and helper state.

- [x] **Task: Verify feedback behavior**
  - [x] Reuse the existing bonk/feedback language for creature contact.
  - [x] Confirm any sound cue has a simultaneous visual response.
  - [x] Confirm actors do not become snap targets, mission targets, or required interactions.
  - **Feedback result:** The motor's existing bounce is asserted at contact, `game.ts` emits the existing `bonk` cue, and the input-parity suite confirms all six IDs remain non-snappable and outside the mission ID set.

- [x] **Task: Run the full logic regression suite**
  - [x] Announce the exact command: `CI=true pnpm test` (PowerShell: `$env:CI='true'; pnpm test`).
  - [x] Run the complete test suite and investigate any regressions.
  - [x] Run coverage for the new/changed logic modules and confirm the project’s >80% target.
  - **Regression result:** 67 test files and 869 tests passed. Coverage is 88.69% statements / 85.95% branches / 92.02% functions / 88.49% lines overall. Changed logic remains above 80%: `trafficSystem.ts` 98.48% statements, `trafficBrain.ts` 94.54%, `trafficShadows.ts` 97.67%, and `vehicleMotor.ts` 100%; `trafficActors.ts` is scene-only visual code and remains covered by the manual visual gate.

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [x] Perform a manual free-play and mission coexistence pass.
  - [x] Obtain explicit user confirmation.
  - [x] Attach the verification report as a Git note and record the checkpoint SHA.
  - **Manual result:** A real headless browser pass at 1500×1050/DPR 1 exercised free play plus fire, ice-cream, park, and puppy contexts. Each pass kept all six ambient IDs present, produced one harmless cat bonk, reached the route destination without remaining blocked, and reported no page or console errors. Temporary dev inspection wiring was removed after the pass.
  - **Checkpoint:** `661eee4` — user-approved Phase 4 interaction, feedback, coexistence, regression, coverage, and browser results.
  - **Verification note:** `git notes show 661eee4`

## Phase 5 — Render, offline, and device verification

- [x] **Task: Measure the expansion against the baseline**
  - [x] Re-run fresh-spawn, transit, junction, and mission-window measurements with equivalent viewport/DPR settings.
  - [x] Record absolute and relative triangle/draw-call deltas.
  - [x] If the representative budget is exceeded, reduce instances or optimize the chosen visuals before completion. **Decision:** the first pass cost +25 draw calls in the worst window (342 meshes), so creature primitives are now merged per material with `mergeGeometries` — same picture, same triangle count, 329 meshes, worst window +12 calls. The mission window peaks 1.7% over the ~50,000 guide and the trade-off is recorded in `measurements.md`; the roster was kept because the specification requires both road wanderers and creatures.
  - **Baseline correction:** the recorded pre-change windows were captured with a stationary-camera route, so the same capture script was also run against `54f4901` in a throwaway detached worktree for a like-for-like comparison. The fresh-spawn representative window is unchanged at 50,553 triangles / 180 calls (baseline 50,541 / 180).

- [x] **Task: Run project quality gates**
  - [x] Run `pnpm check`. — 156 files, no fixes.
  - [x] Run `pnpm typecheck`. — `tsc --noEmit` passed.
  - [x] Run `CI=true pnpm test`. — 67 files, 869 tests passed.
  - [x] Run the coverage command and review the changed-module result. — 89.64% statements, 85.95% branches overall; `trafficSystem.ts` 98.48%, `trafficBrain.ts` 94.54%, `vehicleMotor.ts` 100%. `trafficActors.ts` is scene-mounting code verified by hand, not by coverage.
  - [x] Run `pnpm build` and verify the PWA precache contains every required asset. — 112 modules; 49 precache entries, 4,246.61 KiB; the SUV model was already registered, so no new asset entered the precache and only the known chunk-size warning remains.

- [~] **Task: Perform browser and target-device verification**
  - [x] Verify ambient movement, harmless bonks, mission coexistence, and no route blockage. — Playwright pass at 1500×1050: all six actors moved, the hero took one bonk and still finished its route, no page or console errors, and a fire mission ran alongside traffic.
  - [x] Verify portrait and landscape camera behavior. — 750×1050 and 1050×750: the vertical extent stays 5.294 world units in both, the camera aspect tracks the canvas in both, the car stays framed, controls do not overlap play space, and no text appears.
  - [x] Verify offline reopen after the production build. — `pnpm preview` at 127.0.0.1:4173, 46 cached entries (30 GLB, 9 audio), then a full offline reload served by the service worker booted the town from cache with a 1500×1050 canvas, no page or console errors, and no visible text.
  - [x] Verify the iPad 9th-generation floor device where available. — The user ran the production build on the floor device over the LAN preview (`http://192.168.0.114:4173/`) and reported a pass on all five checks: frame smoothness, cat and rabbit visible on the roads alongside the SUV, harmless bonk that lets the car continue, fire mission coexistence, and portrait/landscape framing.
  - [x] Confirm frame rate remains at the established 60fps target. — Headless Chromium reports 4.14 ms average and 4.3 ms p95 per frame at 1500×1050 DPR 1 (uncapped `requestAnimationFrame`, so this is per-frame cost, not display rate) both settled and during a mission, and the user confirmed the iPad 9th-generation floor device stayed smooth with the expanded roster.

- [~] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [x] Present the complete automated and manual verification results.
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
