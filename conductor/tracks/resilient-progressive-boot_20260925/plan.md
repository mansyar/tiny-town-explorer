# Implementation Plan: Resilient Progressive Boot

## Phase 1 — Define and test the boot-state contract

- [x] **Task: Add red tests for boot-state transitions** [aa92ce9]
  - [x] Define the initial `loading`, successful `ready`, failed `failed`, and one-shot `retrying` states in a small, injectable state contract.
  - [x] Test that a loading touch produces a visual acknowledgement without creating a gameplay command.
  - [x] Test that a failed boot exposes retry exactly once and repeated retry input cannot trigger multiple reloads.
  - [x] Test that a late failure cannot replace a successful ready state.
  - [x] **Run:** `CI=true pnpm test -- src/game/hud/bootStatus.test.ts`; recorded the intentional red baseline (module missing). **Commit:** `aa92ce9`

- [x] **Task: Implement the minimal boot-status state contract** [e32650b]
  - [x] Add the pure transition/state helpers and a thin DOM-facing wrapper.
  - [x] Keep visible output icon-only; use non-visible accessibility metadata only.
  - [x] Inject the reload callback so the one-shot retry behavior is testable without a real page reload.
  - [x] **Run:** the targeted test command and confirm the new contract is green. **Commit:** `e32650b`

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)** [e32650b]
  - [x] Identify the changed production/test files and their corresponding tests.
  - [x] Run the exact targeted test and quality commands.
  - [x] Present the results, commit SHA, and detailed verification report; wait for explicit checkpoint confirmation.

### Phase 1 implementation record (2026-09-25)

- Boot status is a pure state contract with `loading`, `ready`, `failed`, and one-shot `retrying` phases; a late failure cannot replace a successful boot.
- Targeted tests: `$env:CI='true'; pnpm test -- src/game/hud/bootStatus.test.ts` — **5/5 passed**.
- Quality gates: `pnpm check` — passed (159 files); `pnpm typecheck` — passed.
- Scoped coverage for `src/game/hud/bootStatus.ts`: **94.44% statements / 88.88% branches / 85.71% functions**.
- Manual verification plan: normal cold boot remains visually unchanged in this phase; confirm existing boot and console behavior, with visual loading/retry deferred to Phase 4.
- Checkpoint commit: `e32650b` (`feat(boot): add boot status state contract`), with a detailed Git note attached.
- Checkpoint confirmation: the user explicitly approved the Phase 1 report and unchanged-boot manual plan.

## Phase 2 — Make the town mount progressive

- [x] **Task: Add red tests for two-phase town mounting** [ce3af40]
  - [x] Use a deferred stub model source to hold the first GLB unresolved.
  - [x] Assert that all synchronous ground placements are mounted and the base-ready callback fires before the deferred model resolves.
  - [x] Assert that each resolved model is added to the same town group in the existing authored order.
  - [x] Assert that the final placement inventory, transforms, house footprints, and disposal behavior remain equivalent to the current mount.
  - [x] Assert that a rejected model rejects the mount and never produces a ready town.
  - [x] **Run:** `CI=true pnpm test -- src/game/town/townRenderer.test.ts`; recorded 14 passing existing tests and 2 intentional progressive-seam failures. **Commit:** `ce3af40`

- [ ] **Task: Implement the two-phase town mount**
  - [ ] Add the smallest optional base/progress seam needed by `mountTown`; do not add a second town or a general asset scheduler.
  - [ ] Mount all synchronous ground/base geometry first.
  - [ ] Invoke the base-ready seam once before the first awaited GLB.
  - [ ] Continue mounting the remaining authored placements with the existing fit, seating, shadow, naming, and footprint logic.
  - [ ] Preserve the `TownMount` return contract and model-library cache behavior.
  - [ ] **Run:** the targeted town-renderer tests and confirm they are green.

- [ ] **Task: Attach the progressive town at the game boundary**
  - [ ] Pass the base-ready seam from `game.mount` so the town group enters the scene before model completion.
  - [ ] Remove the later duplicate `scene.add(town.group)` path.
  - [ ] Keep `driven`/`ready` signaling, motor measurement, and scene ownership unchanged.
  - [ ] Confirm the pre-mount frame guards still cover the new earlier scene attachment.
  - [ ] **Commit:** `feat(town): reveal the base town during model mount`

- [ ] **Task: Verify Phase 2**
  - [ ] Run targeted town and controller tests.
  - [ ] Manually delay model responses and confirm the base layer is visible before the first model completes.
  - [ ] **Checkpoint:** `Phase Verification & Checkpoint (Refer to workflow.md)`

## Phase 3 — Make sampled audio failure non-blocking

- [ ] **Task: Add red tests for aggregate sample loading**
  - [ ] Test that one rejected or undecodable sample does not reject the aggregate operation.
  - [ ] Test that all other samples still load and the result contains no unhandled rejection.
  - [ ] Test that a failed sample is silent when played while synthesized voices remain usable.
  - [ ] Test that a later successful load can still populate the failed sample through the existing model/audio seam where applicable.
  - [ ] **Run:** the targeted audio test command and confirm the new behavior is red.

- [ ] **Task: Implement settled sample loading**
  - [ ] Add the smallest testable aggregate loader around the existing `AudioEngine.load` contract.
  - [ ] Use settled semantics rather than `Promise.all` so one optional sample cannot block or reject boot.
  - [ ] Keep the sample registry, URLs, decode path, synthesized sounds, mute behavior, and first-gesture unlock unchanged.
  - [ ] Do not surface failed-sample diagnostics in child-facing UI.
  - [ ] **Run:** targeted audio tests and confirm they are green.
  - [ ] **Commit:** `fix(audio): keep optional samples from blocking boot`

- [ ] **Task: Verify Phase 3**
  - [ ] Run the audio test suite and confirm existing scheduling tests remain green.
  - [ ] Confirm no new production dependency, asset, or visible control was introduced.
  - [ ] **Checkpoint:** `Phase Verification & Checkpoint (Refer to workflow.md)`

## Phase 4 — Wire the browser edge and failure recovery

- [ ] **Task: Add the zero-text boot overlay to the page edge**
  - [ ] Add the calm icon-only loading presentation and the icon-only retry presentation using the existing inline `index.html` styling model.
  - [ ] Create/append the overlay before asynchronous model work begins.
  - [ ] Keep the render loop active while the progressive world loads.
  - [ ] Attach first-gesture audio unlocking so a touch on the loading overlay still unlocks the audio context.
  - [ ] Ensure the overlay does not create a blocking browser dialog or visible text.
  - [ ] **Commit:** `feat(boot): add zero-text loading and retry presentation`

- [ ] **Task: Gate gameplay input and HUD readiness**
  - [ ] Await both `game.driven` and `game.ready` through one settled error boundary.
  - [ ] Keep gameplay pointer routing and vehicle-HUD activation unavailable until `game.ready` resolves.
  - [ ] Ensure taps received while loading are not queued as routes, honks, mission claims, or vehicle selections.
  - [ ] Initialize and display the existing vehicle HUD only after readiness.
  - [ ] Preserve the current parent gate, install hint, mute, helper, and active-vehicle behavior after the transition.
  - [ ] **Commit:** `feat(boot): gate gameplay until the world is ready`

- [ ] **Task: Handle initial mount failure safely**
  - [ ] Catch failures from both pre-motor and post-motor/hero-model mount paths.
  - [ ] Stop the render loop and disconnect the resize observer on failure.
  - [ ] Dispose/stop the audio engine where applicable.
  - [ ] Transition to the failed state without an unhandled rejection.
  - [ ] Wire the retry control to exactly one full-page reload.
  - [ ] Confirm a successful ready transition cannot be overwritten by an optional audio rejection.
  - [ ] **Commit:** `feat(boot): recover from initial mount failure`

- [ ] **Task: Verify Phase 4**
  - [ ] Run the boot-state, town, game, and audio targeted tests.
  - [ ] Run a browser smoke pass with delayed model responses, a blocked model response, and a blocked optional audio response.
  - [ ] Confirm no duplicate listeners, duplicate scene objects, blank retry state, or post-ready behavior regression.
  - [ ] **Checkpoint:** `Phase Verification & Checkpoint (Refer to workflow.md)`

## Phase 5 — Integration, documentation, and device verification

- [ ] **Task: Run the full automated quality gates**
  - [ ] Run `pnpm check`.
  - [ ] Run `pnpm typecheck`.
  - [ ] Run `CI=true pnpm test`.
  - [ ] Run `CI=true pnpm test:coverage` and confirm new logic remains above 80%.
  - [ ] Run `pnpm build`.
  - [ ] Confirm the PWA precache still contains the required assets and record the current entry count/size.
  - [ ] **Commit:** `chore(conductor): record resilient boot quality gates`

- [ ] **Task: Update affected documentation**
  - [ ] Correct the stale precache figures in `docs/cloudflare-pages.md` to the current measured values.
  - [ ] Document the zero-text loading/retry behavior and the fact that optional audio failure is non-blocking.
  - [ ] Update the playtest record with the successful progressive boot, retry, offline reopen, and target-device evidence.
  - [ ] Do not document context-loss recovery, service-worker redesign, or bundle splitting as shipped features.

- [ ] **Task: Perform browser and target-device verification**
  - [ ] Start the development server and verify the base town appears before the delayed model set completes.
  - [ ] Verify the loading overlay is calm, icon-only, touch-responsive, and safe-area correct in portrait and landscape.
  - [ ] Block a model request and verify the retry icon appears and one tap performs one reload.
  - [ ] Block an audio sample and verify the game still reaches ready with all visual cues intact.
  - [ ] Load the production preview, complete a first visit, enable airplane mode, and verify a cache-backed reopen reaches ready.
  - [ ] Exercise representative vehicle selection, movement, traffic, pond, helper, and mission interactions after readiness.
  - [ ] Run the physical iPad 9th-generation check at the existing render budget.
  - [ ] **Commit:** `chore(conductor): document resilient boot verification`

- [ ] **Task: Phase Verification & Checkpoint (Refer to workflow.md)**
  - [ ] Present the complete automated and manual verification report.
  - [ ] Await explicit user confirmation before marking the phase complete.
  - [ ] Attach the detailed verification report to the last functional commit using Git notes.
  - [ ] Record the checkpoint SHA in this plan and commit the plan update.

## Stop conditions

Stop and report rather than expanding this track if implementation requires any of the following:

- WebGL context-loss handling.
- A service-worker/PWA redesign or a new persistence model.
- A new dependency, asset, framework, or visible text surface.
- In-place partial-world restart or automatic retry semantics.
- Changes to mission semantics, vehicle behavior, input routing after readiness, or the public product scope.
- A loss of the existing town footprint, disposal, model-cache, offline, or render-budget contracts.
- An unavailable iPad/device verification step; the phase remains incomplete rather than being marked by proxy.
