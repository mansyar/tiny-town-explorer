# Implementation Plan: Async Intent Arbitration

## Phase 1 — Reproduce and pin the race (TDD)

- [x] **Task: Add deterministic deferred async test controls**
  - [x] Extend the existing `game.test.ts` mocks with controllable `createVehicleActor` promises and a controllable mission-tap boundary.
  - [x] Reset deferred mocks and call counts between tests so one race test cannot contaminate another.
  - [x] Keep all controls test-only; do not add runtime configuration or production hooks.
  - [x] **Commit:** `test(game): add async intent race harness`

- [x] **Task: Write red tests for stale destination commits**
  - [x] Hold a mission/vehicle promise, issue destination A, then destination B, and assert that only B calls `motor.setPath` after resolution.
  - [x] Assert that both taps retain their immediate ring/audio feedback.
  - [x] Assert that an unreachable/stale route is not committed after a newer tap supersedes it.
  - [x] **Commit:** include the red regression tests in the test commit.

- [x] **Task: Write red tests for atomic mission claims**
  - [x] Fire mission: hold the required fire-truck actor, issue a newer destination, and assert the mission claim survives while the newer destination is eventually applied.
  - [x] Ice-cream and park paths: assert their required morphs are not undone by a later tap.
  - [x] Failed mission morph: assert the old actor remains and no route is committed until a later retry can mount the required vehicle.
  - [x] **Commit:** include the atomic-mission red tests in the test commit.

- [x] **Task: Write red tests for serialized vehicle selection**
  - [x] Select A then B while actor creation is delayed; assert final fleet ID, HUD active ID, and mounted actor are all B.
  - [x] Assert only one swap is in flight at a time.
  - [x] Assert no superseded actor remains mounted in the scene.
  - [x] Add a mixed mission-required/HUD-selection case to lock the agreed precedence.
  - [x] **Commit:** include the vehicle-selection red tests in the test commit.

- [x] **Task: Write red tests for rollback and helper parity**
  - [x] Reject a replacement actor and assert the previous actor, active ID, and HUD state remain intact; assert a later request succeeds.
  - [x] Assert helper-hand demo input uses the same latest-intent rules and cannot overwrite a newer child tap.
  - [x] **Commit:** include the rollback/helper red tests in the test commit.

- [x] **Task: Run and record the red baseline**
  - [x] Run `CI=true pnpm test -- src/game/game.test.ts` and confirm each new test fails for the expected missing arbitration behavior, not because of a broken fixture.
  - [x] Record the failing test names and any fixture corrections in the phase checkpoint.
  - [x] **Commit:** `test(game): characterize async intent races`

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [x] Identify the changed test files and run the exact targeted test command.
  - [x] Present the red-baseline results and stop if a test is failing for an unrelated reason.

### Phase 1 red baseline (2026-09-25)

- Command: `CI=true pnpm test -- src/game/game.test.ts` (PowerShell: `$env:CI='true'; pnpm test -- src/game/game.test.ts`)
- Result: **59 tests, 50 passing; 9 intentional red regressions**. The failures are limited to the new arbitration tests: two stale destination commits, fire/ice-cream/park atomic morph precedence, failed-morph rejection/rollback, concurrent HUD selections (including mission precedence), and helper-demo route overwrite.
- Fixture corrections made before recording the baseline: park litter is sampled only after `startPark()`; the helper test starts from police so the fire morph is genuinely deferred; actor call counts are cleared after boot.
- Supporting gates: `pnpm check` and `pnpm typecheck` pass. No unrelated fixture or existing-suite failure remains.
- Checkpoint approval: the user approved proceeding from the recorded red baseline to Phase 2.

## Phase 2 — Implement controller-level arbitration (TDD green)

- [x] **Task: Add controller-owned intent generations**
  - [x] Add monotonic destination and vehicle request generations inside `createGame` or a small controller-local helper.
  - [x] Store only the latest pending destination/request; do not build a general-purpose event bus or queue every historical intent.
  - [x] Keep `inputRouter` synchronous and unchanged unless a red test proves it is the required authority.
  - [x] Document ownership, commit points, and the fact that mission claims are not cancelled.

- [x] **Task: Gate `tapAt` route commitment**
  - [x] Preserve immediate ring/audio feedback before any async work.
  - [x] Capture the tap generation, await mission handling and the relevant vehicle-swap settling point, then recompute/commit the route only if the generation is still current.
  - [x] Ensure a newer destination replaces the pending route and an older resumed tap cannot call `setPath`.
  - [x] Do not set a route for a failed mission-required morph.

- [x] **Task: Serialize and commit vehicle swaps**
  - [x] Replace concurrent `swapVehicle()` completion paths with a serialized request/commit flow.
  - [x] Build the replacement actor before removing the current actor.
  - [x] Commit fleet active ID, serve/ability HUD state, `world.actor`, and scene node only after the replacement is ready.
  - [x] Keep the existing direct rule-handle/test seam where practical; normal UI/mission paths must use the serialized flow.

- [x] **Task: Implement latest-selection and rollback policy**
  - [x] Keep the current mission-required morph atomic, then apply the newest explicit HUD selection.
  - [x] Contain actor-load failure at the controller seam: retain the last known-good actor, clear only the failed pending request, and settle without leaving an unhandled broken world.
  - [x] Allow a later request to retry through the model library.
  - [x] Remove or dispose any superseded actor so scene residue is impossible.

- [x] **Task: Route every async entry point through arbitration**
  - [x] Update fire, ice-cream, park, helper/siren, and public `selectVehicle()` paths to use the same request/commit policy.
  - [x] Keep mission FSM transitions and response timing unchanged.
  - [x] Add/update controller JSDoc for the new async ordering and failure contract.
  - [x] Do not add UI, text, assets, or new dependencies.

- [x] **Task: Make targeted tests green**
  - [x] Run `CI=true pnpm test -- src/game/game.test.ts`.
  - [x] Run targeted coverage for touched controller logic and confirm the project’s >80% logic threshold.
  - [x] Refactor only to remove duplication exposed by the green tests; do not broaden scope.
  - [ ] **Commit:** `fix(game): arbitrate async vehicle and route intent`

- [~] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [x] Identify all changed production/test files and their corresponding tests.
  - [x] Run the exact targeted test and quality commands.
  - [ ] Present the results, commit SHA, and detailed verification report; wait for explicit checkpoint confirmation.

### Phase 2 implementation record (2026-09-25)

- Controller state now owns destination generations, serialized vehicle requests, latest-selection generations, and a mission morph-failure context.
- Fire, ice-cream, park, helper/siren, and HUD selection paths share the queue; direct `swapVehicle()` remains serialized for the rule-handle seam.
- Actor replacement builds first, removes/adds exactly at commit, commits fleet/HUD state only after readiness, and retains the last known-good actor on load or commit failure.
- Immediate tap ring/audio remains synchronous; stale or failed mission morphs never call `setPath`.
- Automated results: `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` (**862 tests across 67 files**), `pnpm test:coverage` (overall 91.3% statements / 87.7% branches; `game.ts` 93.24% / 84.36%), and `pnpm build` all pass. The known Vite chunk-size warning remains unchanged and out of scope.
- Remaining checkpoint action: commit the implementation and plan update, attach the detailed Git note, then obtain explicit checkpoint confirmation before integration/device verification.

## Phase 3 — Integration and regression verification

- [ ] **Task: Run the full automated gates**
  - [ ] Run `pnpm check`.
  - [ ] Run `pnpm typecheck`.
  - [ ] Run `CI=true pnpm test`.
  - [ ] Run `CI=true pnpm test:coverage`.
  - [ ] Run `pnpm build`.
  - [ ] **Commit:** `chore(conductor): record async arbitration quality gates`

- [ ] **Task: Perform browser interaction verification**
  - [ ] Run the development server with `?calmGap=2` so each mission can be exercised quickly.
  - [ ] Verify rapid destination taps, rapid vehicle-button changes, mixed mission/HUD selection, helper-hand input, and actor-load retry behavior.
  - [ ] Confirm no console errors, stuck routes, empty scene, mismatched active vehicle, or orphan actors.
  - [ ] Confirm the existing four missions and visible feedback remain unchanged.

- [ ] **Task: Perform target-device verification**
  - [ ] Repeat rapid tap/vehicle-selection scenarios on the iPad floor device at the documented render budget.
  - [ ] Confirm touch input remains forgiving, feedback remains immediate, and the car never appears to stop against an invisible lock.
  - [ ] If the iPad is unavailable, stop and report the blocker instead of marking the checkpoint complete.

- [ ] **Task: Update verification records**
  - [ ] Append the new automated/manual results to the track plan checkpoint.
  - [ ] Update `docs/playtest.md` only if the interaction verification adds a meaningful new record; do not rewrite historical track sections.
  - [ ] Record exact commands, device, commit SHA, and unresolved limitations.
  - [ ] **Commit:** `chore(conductor): document async arbitration verification`

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Present the complete verification report and await explicit user confirmation.
  - [ ] Obtain a detailed Git note and checkpoint SHA before proceeding.

## Phase 4 — Review handoff and closeout

- [ ] **Task: Conduct the principal-engineer review**
  - [ ] Review the diff against the approved specification, product pillars, and workflow.
  - [ ] Check for stale API surfaces, unnecessary abstractions, error-path leaks, and accidental scope expansion.
  - [ ] Add focused review fixes and regression tests only when a finding is real.
  - [ ] **Commit:** `fix(conductor): address async arbitration review findings`

- [ ] **Task: Finalize the track**
  - [ ] Mark all completed tasks in `plan.md`.
  - [ ] Run the smallest final gates invalidated by review fixes.
  - [ ] Archive the track, update the registry, and prepare the implementation merge.
  - [ ] **Commit:** `chore(conductor): archive track 'Async Intent Arbitration'`

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Confirm the final diff, tests, build, manual record, Git notes, and archive state.
  - [ ] Report completion and any remaining manual/device limitation.

## Stop conditions

Stop and report rather than expanding the track if arbitration requires changing the input-router contract, mission FSM semantics, a new child-facing loading/error UI, a new dependency, or a public product feature.
