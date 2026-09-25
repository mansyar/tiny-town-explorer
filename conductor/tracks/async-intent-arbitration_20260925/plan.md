# Implementation Plan: Async Intent Arbitration

## Phase 1 — Reproduce and pin the race (TDD)

- [x] **Task: Add deterministic deferred async test controls**
  - [x] Extend the existing `game.test.ts` mocks with controllable `createVehicleActor` promises and a controllable mission-tap boundary.
  - [x] Reset deferred mocks and call counts between tests so one race test cannot contaminate another.
  - [x] Keep all controls test-only; do not add runtime configuration or production hooks.
  - [x] **Commit:** `test(game): add async intent race harness`

- [~] **Task: Write red tests for stale destination commits**
  - [ ] Hold a mission/vehicle promise, issue destination A, then destination B, and assert that only B calls `motor.setPath` after resolution.
  - [ ] Assert that both taps retain their immediate ring/audio feedback.
  - [ ] Assert that an unreachable/stale route is not committed after a newer tap supersedes it.
  - [ ] **Commit:** include the red regression tests in the test commit.

- [ ] **Task: Write red tests for atomic mission claims**
  - [ ] Fire mission: hold the required fire-truck actor, issue a newer destination, and assert the mission claim survives while the newer destination is eventually applied.
  - [ ] Ice-cream and park paths: assert their required morphs are not undone by a later tap.
  - [ ] Failed mission morph: assert the old actor remains and no route is committed until a later retry can mount the required vehicle.
  - [ ] **Commit:** include the atomic-mission red tests in the test commit.

- [ ] **Task: Write red tests for serialized vehicle selection**
  - [ ] Select A then B while actor creation is delayed; assert final fleet ID, HUD active ID, and mounted actor are all B.
  - [ ] Assert only one swap is in flight at a time.
  - [ ] Assert no superseded actor remains mounted in the scene.
  - [ ] Add a mixed mission-required/HUD-selection case to lock the agreed precedence.
  - [ ] **Commit:** include the vehicle-selection red tests in the test commit.

- [ ] **Task: Write red tests for rollback and helper parity**
  - [ ] Reject a replacement actor and assert the previous actor, active ID, and HUD state remain intact; assert a later request succeeds.
  - [ ] Assert helper-hand demo input uses the same latest-intent rules and cannot overwrite a newer child tap.
  - [ ] **Commit:** include the rollback/helper red tests in the test commit.

- [ ] **Task: Run and record the red baseline**
  - [ ] Run `CI=true pnpm test -- src/game/game.test.ts` and confirm each new test fails for the expected missing arbitration behavior, not because of a broken fixture.
  - [ ] Record the failing test names and any fixture corrections in the phase checkpoint.
  - [ ] **Commit:** `test(game): characterize async intent races`

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Identify the changed test files and run the exact targeted test command.
  - [ ] Present the red-baseline results and stop if a test is failing for an unrelated reason.

## Phase 2 — Implement controller-level arbitration (TDD green)

- [ ] **Task: Add controller-owned intent generations**
  - [ ] Add monotonic destination and vehicle request generations inside `createGame` or a small controller-local helper.
  - [ ] Store only the latest pending destination/request; do not build a general-purpose event bus or queue every historical intent.
  - [ ] Keep `inputRouter` synchronous and unchanged unless a red test proves it is the required authority.
  - [ ] Document ownership, commit points, and the fact that mission claims are not cancelled.

- [ ] **Task: Gate `tapAt` route commitment**
  - [ ] Preserve immediate ring/audio feedback before any async work.
  - [ ] Capture the tap generation, await mission handling and the relevant vehicle-swap settling point, then recompute/commit the route only if the generation is still current.
  - [ ] Ensure a newer destination replaces the pending route and an older resumed tap cannot call `setPath`.
  - [ ] Do not set a route for a failed mission-required morph.

- [ ] **Task: Serialize and commit vehicle swaps**
  - [ ] Replace concurrent `swapVehicle()` completion paths with a serialized request/commit flow.
  - [ ] Build the replacement actor before removing the current actor.
  - [ ] Commit fleet active ID, serve/ability HUD state, `world.actor`, and scene node only after the replacement is ready.
  - [ ] Keep the existing direct rule-handle/test seam where practical; normal UI/mission paths must use the serialized flow.

- [ ] **Task: Implement latest-selection and rollback policy**
  - [ ] Keep the current mission-required morph atomic, then apply the newest explicit HUD selection.
  - [ ] Contain actor-load failure at the controller seam: retain the last known-good actor, clear only the failed pending request, and settle without leaving an unhandled broken world.
  - [ ] Allow a later request to retry through the model library.
  - [ ] Remove or dispose any superseded actor so scene residue is impossible.

- [ ] **Task: Route every async entry point through arbitration**
  - [ ] Update fire, ice-cream, park, helper/siren, and public `selectVehicle()` paths to use the same request/commit policy.
  - [ ] Keep mission FSM transitions and response timing unchanged.
  - [ ] Add/update controller JSDoc for the new async ordering and failure contract.
  - [ ] Do not add UI, text, assets, or new dependencies.

- [ ] **Task: Make targeted tests green**
  - [ ] Run `CI=true pnpm test -- src/game/game.test.ts`.
  - [ ] Run targeted coverage for touched controller logic and confirm the project’s >80% logic threshold.
  - [ ] Refactor only to remove duplication exposed by the green tests; do not broaden scope.
  - [ ] **Commit:** `fix(game): arbitrate async vehicle and route intent`

- [ ] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)**
  - [ ] Identify all changed production/test files and their corresponding tests.
  - [ ] Run the exact targeted test and quality commands.
  - [ ] Present the results, commit SHA, and detailed verification report; wait for explicit checkpoint confirmation.

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
