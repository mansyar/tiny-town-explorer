# Implementation Plan: Instant-Answer Vehicle Switching

Phases 1 and 2 are logic-bearing and follow the scoped TDD rule in `workflow.md`:
red first, confirmed failing, then the minimum code to pass. Phase 3 is DOM
glue and styling, which `workflow.md` exempts from red/green and verifies by
hand instead. Phase 4 runs the gates and the device check.

## Phase 1 — Give the controller a pending-answer state [checkpoint: b95d977]

- [x] **Task: Add red tests for the pending-answer contract** [3ad937a]
  - [x] Assert that a `selection` request raises the pending state synchronously, before any `await` resolves.
  - [x] Assert the pending state is cleared when that request commits.
  - [x] Assert the pending state is cleared when that request fails to load, and the previous vehicle stays active.
  - [x] Assert that rapid fire → garbage → police leaves the pending state on `police` throughout, the skipped middle request never raises or clears a pending state, and the final active vehicle is `police`.
  - [x] Assert that a `mission` morph, the helper siren demo, and a `direct` swap never raise a pending state.
  - [x] Assert the pending state is `undefined` again after the last request settles, by every path.
  - [x] Assert the arbitration tests' existing expectations still hold unmodified.
  - [x] **Run:** `$env:CI='true'; pnpm test -- src/game/game.test.ts` — recorded 66 pre-existing cases passing and the intentional red baseline: 4 of the 5 new cases fail because `hud.setPending` is never called. The fifth asserts a negative and passes vacuously by design, becoming load-bearing once the feature exists. **Commit:** `3ad937a`

- [x] **Task: Implement the minimal pending-answer state** [f995d39]
  - [x] Track the pending vehicle id in `game.ts` alongside the existing request generation; clear it on commit, on skip, and on failure.
  - [x] Raise it only for `selection` mode, at the point the request is enqueued, with no `await` between the tap and the raise.
  - [x] Leave a newer pending state untouched when an older request settles.
  - [x] Do not change the queue, the generation scheme, `commitVehicleActor`, `restoreVehicleActor`, or `activate`.
  - [x] **Run:** `$env:CI='true'; pnpm test -- src/game/game.test.ts` — **70/70 passed**, including the 4 cases that were red. The pending answer reuses the arbitration's own generation counter rather than introducing a second one. **Commit:** `f995d39`

- [x] **Task: Expose the pending state through the HUD port** [b95d977]
  - [x] Add one `GameHud` method carrying the pending vehicle id, or `undefined` for none.
  - [x] Keep the port no-oping before the real HUD exists, matching the five existing closures in `main.ts`.
  - [x] **Deviation (recorded per the in-flight refinement clause):** the plan put "Render the pending state in the vehicle HUD" in Phase 3 Task 1, but the edge cannot typecheck until `VehicleHud` declares `setPending`, and a declared-but-unimplemented member is dead code. The rendering therefore lands here, where it is required, and Phase 3 keeps the CSS ring styling and the hand verification.
  - [x] **Commit:** `feat(hud): render the pending answer in the vehicle switcher` (`b95d977`)

- [x] **Task: Phase Verification & Checkpoint (Refer to workflow.md)** [b95d977]
  - [x] Identify the changed production and test files and their corresponding tests.
  - [x] Run the exact targeted test and quality commands.
  - [x] Present the results, commit SHA, and a detailed verification report; wait for explicit checkpoint confirmation.

### Phase 1 implementation record (2026-09-26)

Three tasks, three functional commits: `3ad937a` red tests, `f995d39` the
controller state, `b95d977` the HUD and edge. `pnpm check`, `pnpm typecheck`
and the full suite at 887 tests across 69 files all pass; overall coverage is
91.55% statements / 87.5% branches, and `src/game/game.ts` measures 94.86% /
86.66%, up from the 94.5 / 86.6 on record for the game-controller-extraction
track.

The design decision worth keeping: the pending answer reuses the generation
counter the arbitration already stamps, rather than introducing a second one.
That makes it structurally impossible for the answer and the intent that
supersedes it to disagree about who is newest, and it is why
`settlePendingSelection` can compare a single integer.

`src/game/hud/vehicleHud.ts` has no test file. That is a recorded project
decision, not an oversight — `vitest.config.ts` excludes it alongside
`parentPanel.ts` and `bootOverlay.ts` as DOM glue, manual-verified by design.
The contract is pinned one layer up at the `GameHud` port in `game.test.ts`.
Overriding the exclusion is available on request.

**Deliberately not done in this phase:** the CSS ring. `is-pending` is applied
but not yet styled, so the ring half of FR1 is not visible in a browser until
Phase 3 Task 2. Doing it in Phase 1 would have pulled styling into a
logic-bearing phase and made its TDD discipline a lie.

The owner approved the six-step browser verification plan on 2026-09-26; the
steps are reproduced in the note on `b95d977`. No browser result is claimed
here, because none has been reported. Physical iPad verification is a Phase 4
item and remains outstanding.

Checkpoint: `b95d977`, the last functional commit of the phase. No empty commit
was created.

## Phase 2 — Warm the fleet during the boot window [checkpoint: f6a26c6]

- [x] **Task: Add red tests for boot-window prewarming** [12824f9]
  - [x] Assert that all four hero vehicle URLs are requested through the library before `game.ready` resolves.
  - [x] Assert that a prewarm request is a `load` (cached template), not an `instantiate`, so no instance is created during boot.
  - [x] Assert that a rejected prewarm neither rejects `game.ready` nor `game.driven`, and produces no unhandled rejection.
  - [x] Assert that prewarming does not change the order in which the town base, the hero actor, and the traffic mount.
  - [x] Assert a post-boot switch to a warmed model still commits through the ordinary queue. **Rewritten during implementation:** the plan's original wording, "issues no second network request", is not observable from this file — `createVehicleActor` is mocked, so a switch never reaches the library at all. The real guarantee is `ModelLibrary`'s fetch-once-and-cache path, already pinned by `modelLibrary.test.ts` ("fetches each url once"), and the observable half is AC2, a browser check listed in Phase 4.
  - [x] **Run:** `$env:CI='true'; pnpm test -- src/game/game.test.ts` — recorded 70 pre-existing cases passing and the intentional red baseline: 3 of the 5 new cases fail. The other two pass vacuously (a failure path with no failure to absorb, and ordinary switching) and become load-bearing once the warm exists. **Commit:** `12824f9`

- [x] **Task: Implement non-blocking fleet prewarming** [f6a26c6]
  - [x] Start the warm in `game.mount`, after the town base is on screen and alongside the hero model's own load, iterating `VEHICLE_IDS` through `ModelLibrary.load`.
  - [x] Never await the warm from `ready`; a slow or failing warm must not hold the boot.
  - [x] Keep the library's evict-on-failure behavior intact so a failed warm is retried by a later switch.
  - [x] Do not add a second town, a duplicate instance, a new asset, or a general asset scheduler.
  - [x] **Run:** `$env:CI='true'; pnpm test -- src/game/game.test.ts` — **75/75 passed**. `pnpm check`, `pnpm typecheck` and the full suite (892 tests / 69 files) are all clean. Biome's configured naming convention required `PascalCase` for the two new test consts; `check:fix` applied that mechanically and it was reviewed. **Commit:** `f6a26c6`

- [x] **Task: Phase Verification & Checkpoint (Refer to workflow.md)** [f6a26c6]
  - [x] Identify the changed production and test files and their corresponding tests.
  - [x] Run the exact targeted test and quality commands.
  - [x] Present the results, commit SHA, and a detailed verification report; wait for explicit checkpoint confirmation.

### Phase 2 implementation record (2026-09-26)

Two tasks, two functional commits: `12824f9` red tests, `f6a26c6` the warm.
`pnpm check`, `pnpm typecheck` and the full suite at 892 tests across 69 files
all pass, up from 887.

Two red-phase findings worth recording. First, the modelLibrary mock was an
empty object, so the warm had nothing to be observed through; it became a
`vi.hoisted` fake carrying inspectable `load`/`instantiate` spies. Second, two
of the five new cases passed vacuously on the first run — a failure path with
no failure to absorb, and an assertion that the warm touches nothing outside
the fleet, which is trivially true of an empty list. The second was tightened
to assert exactly four loads, which pins the "once each, no duplicates" half of
FR2 and made it genuinely red.

The placement is the design decision worth keeping. `warmFleet()` is called
from `mount()` immediately after the town base is on screen — not at the top
of `mount()` — so it rides behind the traffic-actor and hero-car loads that
were already in flight, instead of competing with the town's own ~25 model
loads for bandwidth. It uses `load`, not `instantiate`, so a warm nobody asked
to drive never builds a scene graph, and it is never awaited, so it cannot hold
`ready` by construction rather than by convention.

`check:fix` renamed the two new test consts to `PascalCase` per the repo's
configured naming convention and wrapped one long call. Mechanical, reviewed,
no behaviour change.

Checkpoint: `f6a26c6`, the last functional commit of the phase. No empty commit
was created.

## Phase 3 — Draw the pending state, with no text [checkpoint: 15af3f5]

This phase is DOM glue and styling, which `workflow.md` exempts from red/green.
It is verified by hand in a browser and at the phase checkpoint.

- [x] **Task: Render the pending state in the vehicle HUD** [b95d977]
  - [x] Apply a pending class to the tapped button, in the target vehicle's colour, using the class-based styling convention.
  - [x] Point the ability button at the target vehicle's ability on the same frame, so the HUD never shows the previous vehicle's trick while a switch is pending.
  - [x] Clear both when the pending state clears, by every path.
  - [x] Add non-visible accessibility metadata for the pending state; add no visible string.
  - [x] **Delivered in Phase 1 Task 3** (`b95d977`), not here: the edge cannot typecheck until `VehicleHud` declares `setPending`, and a declared-but-unimplemented member is dead code. Recorded as an in-flight refinement at the time.

- [x] **Task: Style the pending ring in `index.html`** [15af3f5]
  - [x] Model the ring on the existing `.panel-gate` hold ring and `.hud-button.is-active` so it introduces no new visual language.
  - [x] Keep the button at its current touch size, at or above the 72×72 px floor. **The button is untouched at 84×84; the ring is a pseudo-element outside the box, so nothing reflows.**
  - [x] Make the ring steady rather than timed, and make sure it does not overlap or shift the neighbouring controls in portrait or landscape. **Steady, at `inset: -13px` against an 18px row gap, so 5px of clear space remains on each side.**
  - [x] Respect safe-area insets as the existing HUD controls do. **The row's own `calc(20px + env(safe-area-inset-*))` positioning is unchanged and the leftmost button keeps 20px plus inset of margin, so a 13px ring cannot clip.**
  - [x] **Commit:** `style(hud): draw a steady ring while a switch is pending` (`15af3f5`)

  **One thing this task added that the plan did not name:** `.hud-button` needed
  `position: relative`. The ring is an absolutely positioned pseudo-element, and
  without it the ring would have resolved against `.hud-vehicles` — one ring per
  button, all drawn at the row's origin. The plan's "verify in a browser" step
  is what caught it; the geometric reasoning alone would not have.

- [x] **Task: Phase Verification & Checkpoint (Refer to workflow.md)** [15af3f5]
  - [x] Identify the changed production and test files and their corresponding tests.
  - [x] Run the exact targeted test and quality commands.
  - [x] Present the results, commit SHA, and a detailed verification report; wait for explicit checkpoint confirmation.

### Phase 3 implementation record (2026-09-26)

Task 1 was delivered in Phase 1 Task 3 and is recorded there as a relocation.
Task 2 is `15af3f5`, the ring itself.

`pnpm check`, `pnpm typecheck` and `pnpm build` are all clean, and the suite is
unchanged at 892 tests across 69 files, which is the expected result for a
phase that adds styling and no logic. Coverage rose to 92.05% statements /
87.76% branches. `pnpm build` reports **precache 49 entries, 4250.34 KiB** —
still 49, so AC7 holds; the 1.31 KiB growth is the new CSS and the new
controller code, not new assets.

**The fault this phase caught is the reason it exists.** `.hud-button` had no
`position`, so the ring's absolutely positioned `::after` would have resolved
against `.hud-vehicles` and drawn one ring per button, all at the row's origin.
`position: relative` was required and is in the commit. The gap geometry was
checked separately and was never at risk; what was at risk was the containing
block, and only running the page surfaced it.

**What is verified and what is not.** Verified in a real browser session: with
`is-pending` forced on, the computed pseudo-element resolves to the expected
content, position, inset, colour and mask, with all six HUD buttons present and
the correct vehicle active. Not verified: a screenshot. The headless browser
here refuses capture without a visible desktop window, so the ring's appearance
is confirmed structurally and geometrically, not visually, and the owner
approved a seven-step throttled-network plan to look at it directly. No
browser result is claimed, because none has been reported.

One honest limitation of the design, recorded so a later reader does not
mistake it for a bug: **the ring is steady, and a warm switch lands in a few
milliseconds.** So on a warm cache there is nothing to see, which is the
intended outcome of Phase 2 rather than a missing visual. The ring exists for
the cold, blocked, or slow-network case, and the verification plan throttles
deliberately to reach it.

Checkpoint: `15af3f5`, the last functional commit of the phase. No empty commit
was created.

## Phase 4 — Integration, documentation, and device verification

- [~] **Task: Run the full automated quality gates** []
  - [x] Run `pnpm check`.
  - [x] Run `pnpm typecheck`.
  - [x] Run `$env:CI='true'; pnpm test`.
  - [x] Run `$env:CI='true'; pnpm test:coverage` and confirm the new logic is above 80%.
  - [x] Run `pnpm build` and confirm the precache is still 49 entries.
  - [x] **Run:** all five clean. `pnpm check` 163 files; `pnpm typecheck` clean; **892 tests / 69 files**; coverage **92.05% stmts / 87.76% branch / 93.57% funcs / 91.93% lines** with `game.ts` at **94.89 / 86.66 / 91.86 / 94.81**; `pnpm build` → **precache 49 entries / 4250.34 KiB**. Gate 4 detail: the track's new logic is `pendingSelectionGeneration`, `settlePendingSelection` and the three `setPending` call sites, all of which are covered by the five Phase 1 cases and the five Phase 2 cases; `game.ts` rose from the 94.5 / 86.6 recorded for game-controller-extraction to 94.89 / 86.66. Gate 5 detail: still 49 entries, so AC7 holds; the 1.31 KiB growth over the 4,249.03 KiB on record is the new CSS and controller code, not new assets.
  - [x] **Commit:** `chore(conductor): record instant-switch quality gates`

- [x] **Task: Update affected documentation** [fb498b2]
  - [x] Record the prewarm and pending-answer behavior in `conductor/tech-stack.md` with a dated note.
  - [x] Update `docs/playtest.md` with the verification evidence, including the failure and supersession cases.
  - [x] Do not document the out-of-scope items as shipped.
  - [x] **Run:** `fb498b2`. The `tech-stack.md` note records the three additions, the `position: relative` trap, the 1.31 KiB / 49-entries cost, and two limitations stated plainly: the steady ring is imperceptible on a warm cache by design, and the "no second network request" guarantee belongs to `ModelLibrary`'s fetch-once-and-cache path (already pinned by `modelLibrary.test.ts`) rather than to anything observable from `game.test.ts`, where `createVehicleActor` is mocked. The `playtest.md` section separates **what was done** (automated gates, the browser check of the computed pseudo-element, the containing-block fault) from **what is outstanding** (all manual steps, the iPad pass), and names no out-of-scope item as shipped. `README.md` needed no change: it describes the HUD by role and never enumerated the `GameHud` members.
  - [x] **Commit:** `docs(conductor): document instant-switch verification`

- [x] **Task: Perform browser and target-device verification** [c571acf]
  - [x] Cold cache: confirm a vehicle tap answers within the frame, before the model resolves, with the ability icon already switched.
  - [x] Warm cache: confirm switching to each of the four vehicles commits with no network request.
  - [x] Failure: block one vehicle GLB, confirm the previous vehicle stays active, no button is left ringed, the boot itself still succeeds, and a retry mounts it.
  - [x] Supersession: tap three vehicles in rapid succession and confirm the final vehicle wins and no stale ring is left behind.
  - [x] Confirm every HUD control stays in-viewport at full touch size in portrait and landscape.
  - [x] Run the physical iPad 9th-generation check.
  - [x] **Run:** the owner ran the seven-step throttled-network plan on a desktop browser against the dev server on 2026-09-26 and **reported it passing**, then ran the physical iPad 9th-generation pass and **reported that passing** as well. Per-step observations were not captured on either device, so both records claim the plan as a whole rather than each step; the structural half of the cold-switch case (computed pseudo-element, ability icon following the pending vehicle) was independently confirmed in an automated browser session beforehand, and that is the evidence standing behind the ring rather than a restatement of the reports. A screenshot could not be captured in the automated environment, so the ring's appearance rests on the owner's eyes plus the computed-style check. The iPad pass carried the most weight of any check in this track, because the track's subject is decode latency and the floor device is where a fleet warm stops being free.
  - [x] **Commit:** `chore(conductor): document instant-switch verification`

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
