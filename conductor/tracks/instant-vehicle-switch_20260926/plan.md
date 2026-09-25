# Implementation Plan: Instant-Answer Vehicle Switching

Phases 1 and 2 are logic-bearing and follow the scoped TDD rule in `workflow.md`:
red first, confirmed failing, then the minimum code to pass. Phase 3 is DOM
glue and styling, which `workflow.md` exempts from red/green and verifies by
hand instead. Phase 4 runs the gates and the device check.

## Phase 1 — Give the controller a pending-answer state

- [x] **Task: Add red tests for the pending-answer contract** [3ad937a]
  - [ ] Assert that a `selection` request raises the pending state synchronously, before any `await` resolves.
  - [ ] Assert the pending state is cleared when that request commits.
  - [ ] Assert the pending state is cleared when that request fails to load, and the previous vehicle stays active.
  - [ ] Assert that rapid fire → garbage → police leaves the pending state on `police` throughout, the skipped middle request never raises or clears a pending state, and the final active vehicle is `police`.
  - [ ] Assert that a `mission` morph, the helper siren demo, and a `direct` swap never raise a pending state.
  - [ ] Assert the pending state is `undefined` again after the last request settles, by every path.
  - [ ] Assert the arbitration tests' existing expectations still hold unmodified.
  - [x] **Run:** `$env:CI='true'; pnpm test -- src/game/game.test.ts` — recorded 66 pre-existing cases passing and the intentional red baseline: 4 of the 5 new cases fail because `hud.setPending` is never called. The fifth asserts a negative and passes vacuously by design, becoming load-bearing once the feature exists. **Commit:** `3ad937a`

- [x] **Task: Implement the minimal pending-answer state** [f995d39]
  - [ ] Track the pending vehicle id in `game.ts` alongside the existing request generation; clear it on commit, on skip, and on failure.
  - [ ] Raise it only for `selection` mode, at the point the request is enqueued, with no `await` between the tap and the raise.
  - [ ] Leave a newer pending state untouched when an older request settles.
  - [ ] Do not change the queue, the generation scheme, `commitVehicleActor`, `restoreVehicleActor`, or `activate`.
  - [x] **Run:** `$env:CI='true'; pnpm test -- src/game/game.test.ts` — **70/70 passed**, including the 4 cases that were red. The pending answer reuses the arbitration's own generation counter rather than introducing a second one. **Commit:** `f995d39`

- [ ] **Task: Expose the pending state through the HUD port** []
  - [ ] Add one `GameHud` method carrying the pending vehicle id, or `undefined` for none.
  - [ ] Keep the port no-oping before the real HUD exists, matching the five existing closures in `main.ts`.
  - [ ] **Commit:** `fix(hud): answer a vehicle switch tap in the same frame`

- [ ] **Task: Phase Verification & Checkpoint (Refer to workflow.md)** []
  - [ ] Identify the changed production and test files and their corresponding tests.
  - [ ] Run the exact targeted test and quality commands.
  - [ ] Present the results, commit SHA, and a detailed verification report; wait for explicit checkpoint confirmation.

## Phase 2 — Warm the fleet during the boot window

- [ ] **Task: Add red tests for boot-window prewarming** []
  - [ ] Assert that all four hero vehicle URLs are requested through the library before `game.ready` resolves.
  - [ ] Assert that a prewarm request is a `load` (cached template), not an `instantiate`, so no instance is created during boot.
  - [ ] Assert that a rejected prewarm neither rejects `game.ready` nor `game.driven`, and produces no unhandled rejection.
  - [ ] Assert that prewarming does not change the order in which the town base, the hero actor, and the traffic mount.
  - [ ] Assert that a post-boot switch issues no second network request for a warmed model.
  - [ ] **Run:** `$env:CI='true'; pnpm test -- src/game/game.test.ts`; record the intentional red baseline.

- [ ] **Task: Implement non-blocking fleet prewarming** []
  - [ ] Start the warm in `game.mount`, after the town base is on screen and alongside the hero model's own load, iterating `VEHICLE_IDS` through `ModelLibrary.load`.
  - [ ] Never await the warm from `ready`; a slow or failing warm must not hold the boot.
  - [ ] Keep the library's evict-on-failure behavior intact so a failed warm is retried by a later switch.
  - [ ] Do not add a second town, a duplicate instance, a new asset, or a general asset scheduler.
  - [ ] **Run:** the targeted tests and confirm they are green.

- [ ] **Task: Phase Verification & Checkpoint (Refer to workflow.md)** []
  - [ ] Identify the changed production and test files and their corresponding tests.
  - [ ] Run the exact targeted test and quality commands.
  - [ ] Present the results, commit SHA, and a detailed verification report; wait for explicit checkpoint confirmation.

## Phase 3 — Draw the pending state, with no text

This phase is DOM glue and styling, which `workflow.md` exempts from red/green.
It is verified by hand in a browser and at the phase checkpoint.

- [ ] **Task: Render the pending state in the vehicle HUD** []
  - [ ] Apply a pending class to the tapped button, in the target vehicle's colour, using the class-based styling convention.
  - [ ] Point the ability button at the target vehicle's ability on the same frame, so the HUD never shows the previous vehicle's trick while a switch is pending.
  - [ ] Clear both when the pending state clears, by every path.
  - [ ] Add non-visible accessibility metadata for the pending state; add no visible string.

- [ ] **Task: Style the pending ring in `index.html`** []
  - [ ] Model the ring on the existing `.panel-gate` hold ring and `.hud-button.is-active` so it introduces no new visual language.
  - [ ] Keep the button at its current touch size, at or above the 72×72 px floor.
  - [ ] Make the ring steady rather than timed, and make sure it does not overlap or shift the neighbouring controls in portrait or landscape.
  - [ ] Respect safe-area insets as the existing HUD controls do.

- [ ] **Task: Phase Verification & Checkpoint (Refer to workflow.md)** []
  - [ ] Identify the changed production and test files and their corresponding tests.
  - [ ] Run the exact targeted test and quality commands.
  - [ ] Present the results, commit SHA, and a detailed verification report; wait for explicit checkpoint confirmation.

## Phase 4 — Integration, documentation, and device verification

- [ ] **Task: Run the full automated quality gates** []
  - [ ] Run `pnpm check`.
  - [ ] Run `pnpm typecheck`.
  - [ ] Run `$env:CI='true'; pnpm test`.
  - [ ] Run `$env:CI='true'; pnpm test:coverage` and confirm the new logic is above 80%.
  - [ ] Run `pnpm build` and confirm the precache is still 49 entries.
  - [ ] **Commit:** `chore(conductor): record instant-switch quality gates`

- [ ] **Task: Update affected documentation** []
  - [ ] Record the prewarm and pending-answer behavior in `conductor/tech-stack.md` with a dated note.
  - [ ] Update `docs/playtest.md` with the verification evidence, including the failure and supersession cases.
  - [ ] Do not document the out-of-scope items as shipped.

- [ ] **Task: Perform browser and target-device verification** []
  - [ ] Cold cache: confirm a vehicle tap answers within the frame, before the model resolves, with the ability icon already switched.
  - [ ] Warm cache: confirm switching to each of the four vehicles commits with no network request.
  - [ ] Failure: block one vehicle GLB, confirm the previous vehicle stays active, no button is left ringed, the boot itself still succeeds, and a retry mounts it.
  - [ ] Supersession: tap three vehicles in rapid succession and confirm the final vehicle wins and no stale ring is left behind.
  - [ ] Confirm every HUD control stays in-viewport at full touch size in portrait and landscape.
  - [ ] Run the physical iPad 9th-generation check.
  - [ ] **Commit:** `chore(conductor): document instant-switch verification`

- [ ] **Task: Phase Verification & Checkpoint (Refer to workflow.md)** []
  - [ ] Present the complete automated and manual verification report.
  - [ ] Await explicit user confirmation before marking the phase complete.
  - [ ] Attach the detailed verification report to the last functional commit using Git notes.
  - [ ] Record the checkpoint SHA in this plan and commit the plan update.

## Stop conditions

Stop and report rather than expanding this track if implementation requires any of
the following:

- Any change to the request queue, the generation scheme, `commitVehicleActor`,
  `restoreVehicleActor`, or the existing arbitration semantics.
- A pending state that must override or delay `hud.setActive` to work.
- A new asset, precache entry, dependency, framework, or visible text surface.
- Prewarming that must gate `game.ready`, or a prewarm failure that must reach
  child-facing UI.
- Changes to mission semantics, vehicle behavior, input routing after readiness,
  or the public product scope.
- A measurable regression in the render inventory, draw calls, or boot wall-clock.
- An unavailable iPad or device verification step; the phase remains incomplete
  rather than being marked by proxy.
