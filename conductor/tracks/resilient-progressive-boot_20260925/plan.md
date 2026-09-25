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

- [x] **Task: Implement the two-phase town mount** [e585de5]
  - [x] Add the smallest optional base/progress seam needed by `mountTown`; do not add a second town or a general asset scheduler.
  - [x] Mount all synchronous ground/base geometry first.
  - [x] Invoke the base-ready seam once before the first awaited GLB.
  - [x] Continue mounting the remaining authored placements with the existing fit, seating, shadow, naming, and footprint logic.
  - [x] Preserve the `TownMount` return contract and model-library cache behavior.
  - [x] **Run:** the targeted town-renderer tests and confirm they are green. **Commit:** `e585de5`

- [x] **Task: Attach the progressive town at the game boundary** [39218bf]
  - [x] Pass the base-ready seam from `game.mount` so the town group enters the scene before model completion.
  - [x] Remove the later duplicate `scene.add(town.group)` path.
  - [x] Keep `driven`/`ready` signaling, motor measurement, and scene ownership unchanged.
  - [x] Confirm the pre-mount frame guards still cover the new earlier scene attachment.
  - [x] **Commit:** `feat(game): attach town base during progressive mount` (`39218bf`)

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)** [39218bf]
  - [x] Identify the changed production/test files and their corresponding tests.
  - [x] Run the exact targeted test and quality commands.
  - [x] Present the results, commit SHA, and detailed verification report; wait for explicit checkpoint confirmation.

### Phase 2 implementation record (2026-09-25)

- `mountTown` now mounts all ground placements first, signals the base-ready seam once, then mounts models in authored order; rejection, transforms, footprints, and disposal remain intact.
- `game.mount` attaches the town group from that seam, removing the later all-at-once scene attachment while leaving `driven`/`ready` and pre-mount guards unchanged.
- Automated results: `pnpm check` — passed; `pnpm typecheck` — passed; `$env:CI='true'; pnpm test` — **877 tests across 68 files passed**; scoped `townRenderer.ts` — **100%**; scoped `game.ts` — **94.01% statements / 86.16% branches / 90.36% functions**.
- Manual verification plan: slow model requests, confirm the base/roads render while the loop continues, then confirm models fill the same group and normal HUD/input return after readiness.
- Checkpoint commit: `39218bf` (`feat(game): attach town base during progressive mount`), with a detailed Git note attached.
- Checkpoint confirmation: the user explicitly approved the Phase 2 report and delayed-model verification plan.

## Phase 3 — Make sampled audio failure non-blocking

- [x] **Task: Add red tests for aggregate sample loading** [4f635e5]
  - [x] Test that one rejected or undecodable sample does not reject the aggregate operation.
  - [x] Test that all other samples still load and the result contains no unhandled rejection.
  - [x] Test that a failed sample is silent when played while synthesized voices remain usable.
  - [x] Test that a later successful load can still populate the failed sample through the existing model/audio seam where applicable.
  - [x] **Run:** the targeted audio test command and confirm the new behavior is red.

- [x] **Task: Implement settled sample loading** [eb0e252]
  - [x] Add the smallest testable aggregate loader around the existing `AudioEngine.load` contract.
  - [x] Use settled semantics rather than `Promise.all` so one optional sample cannot block or reject boot.
  - [x] Keep the sample registry, URLs, decode path, synthesized sounds, mute behavior, and first-gesture unlock unchanged.
  - [x] Do not surface failed-sample diagnostics in child-facing UI.
  - [x] **Run:** targeted audio tests and confirm they are green.
  - [x] **Commit:** `fix(audio): keep optional samples from blocking boot` (`eb0e252`)

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)** [eb0e252]
  - [x] Identify the changed production/test files and their corresponding tests.
  - [x] Run the exact targeted test and quality commands.
  - [x] Present the results, commit SHA, and detailed verification report; wait for explicit checkpoint confirmation.

### Phase 3 implementation record (2026-09-25)

- Added `src/game/audio/sampleLoader.ts` with a small `loadSamples` helper built on `Promise.allSettled` over the existing `AudioEngine.load` contract; `src/main.ts` now uses it at boot instead of `Promise.all`.
- Failure semantics: a rejected fetch or decode leaves that one sample silent, never rejects or escapes at boot, never surfaces child-facing diagnostics, and never blocks the other samples; synthesized voices, mute, and first-gesture unlock are unchanged, and a later `load` can still populate a previously failed sample.
- Automated results: `pnpm check` — passed (161 files); `pnpm typecheck` — passed; targeted audio tests — **20 passed**; `$env:CI='true'; pnpm test` — **882 tests across 69 files passed**; scoped `sampleLoader.ts` — **100%** statements/branches/functions/lines.
- Observed pre-existing gap, deliberately not in scope: `audioEngine.ts` remains at 54% because its existing tests cover the pure schedules only; this track added no new untested production logic there.
- Manual verification plan: block one sampled file, confirm boot and driving are unaffected with no unhandled rejection, confirm the blocked ability is silent while a synthesized ability still sounds, then unblock and reload to confirm normal playback.
- Checkpoint commit: `eb0e252` (`fix(audio): keep optional samples from blocking boot`), with a detailed Git note attached.
- Checkpoint confirmation: the user explicitly approved the Phase 3 report and blocked-sample verification plan.

## Phase 4 — Wire the browser edge and failure recovery

- [x] **Task: Add the zero-text boot overlay to the page edge** [3ed8a8f]
  - [x] Add the calm icon-only loading presentation and the icon-only retry presentation using the existing inline `index.html` styling model.
  - [x] Create/append the overlay before asynchronous model work begins.
  - [x] Keep the render loop active while the progressive world loads.
  - [x] Attach first-gesture audio unlocking so a touch on the loading overlay still unlocks the audio context.
  - [x] Ensure the overlay does not create a blocking browser dialog or visible text.
  - [x] **Commit:** `feat(boot): add zero-text loading and retry presentation` (`3ed8a8f`)

- [x] **Task: Gate gameplay input and HUD readiness** [3aef0cf]
  - [x] Await both `game.driven` and `game.ready` through one settled error boundary.
  - [x] Keep gameplay pointer routing and vehicle-HUD activation unavailable until `game.ready` resolves.
  - [x] Ensure taps received while loading are not queued as routes, honks, mission claims, or vehicle selections.
  - [x] Initialize and display the existing vehicle HUD only after readiness.
  - [x] Preserve the current parent gate, install hint, mute, helper, and active-vehicle behavior after the transition.
  - [x] **Commit:** `feat(boot): gate gameplay until the world is ready` (`3aef0cf`)

- [x] **Task: Handle initial mount failure safely** [3aef0cf]
  - [x] Catch failures from both pre-motor and post-motor/hero-model mount paths.
  - [x] Stop the render loop and disconnect the resize observer on failure.
  - [x] Dispose/stop the audio engine where applicable.
  - [x] Transition to the failed state without an unhandled rejection.
  - [x] Wire the retry control to exactly one full-page reload.
  - [x] Confirm a successful ready transition cannot be overwritten by an optional audio rejection.
  - [x] **Commit:** `feat(boot): recover from initial mount failure` (`3aef0cf`)

- [x] **Task: Phase Verification & Checkpoint (Refer to `workflow.md`)** [3aef0cf]
  - [x] Identify the changed production/test files and their corresponding tests.
  - [x] Run the exact targeted test and quality commands.
  - [x] Present the results, commit SHA, and detailed verification report; wait for explicit checkpoint confirmation.

### Phase 4 implementation record (2026-09-25)

- Added `src/game/hud/bootOverlay.ts` (DOM glue, excluded from unit coverage like the other HUD chrome) and its inline `index.html` styling: a soft bouncing toy car while loading and one large round-arrow retry button on failure, with an `aria-label` rather than any visible text.
- `src/main.ts` now appends the overlay before any async model work, unlocks audio from a one-shot window-level first `pointerdown` so a tap on the loading overlay still starts the context, holds `game.driven` and `game.ready` inside a single `try`/`catch`, and creates gameplay pointer routing plus the vehicle HUD only after `ready`.
- On initial mount failure it stops the render loop, disconnects the `ResizeObserver`, disposes audio, and switches the overlay to the retry control wired to exactly one full-page reload. A settled failure is never blanked; a ready boot is never overwritten by a late optional-audio rejection.
- Follow-up `fba6c30` gave the loading toy the same chunky circular weight and palette as the HUD buttons so it stays legible over sky, road, or grass.
- Automated results: `pnpm check` — passed (162 files); `pnpm typecheck` — passed; `$env:CI='true'; pnpm test` — **882 tests across 69 files passed**.
- Browser evidence (Chromium via Playwright): normal boot clears the overlay with 0 console errors; a delayed GLB shows the loading toy over the visible progressive base with no HUD; a blocked GLB shows the retry icon with a verifiably stopped render loop; one retry tap causes exactly one reload; a blocked `bark.mp3` still reaches ready with **0 unhandled rejections**; post-ready canvas taps are unobstructed; scene inventory sits at 49,428 triangles, inside the documented range, with no duplicated town.
- Two verification traps were caught and corrected rather than reported: the render probe returns zero samples until a recorder is explicitly started (so loop liveness was proven by screenshot hash comparison instead), and the navigation counter double-counts per load (so a plain-reload control was run before concluding the retry count).
- Checkpoint commits: `3aef0cf` (`feat(boot): gate gameplay and recover from initial mount failure`), with `fba6c30` as the overlay legibility follow-up; detailed Git notes attached.
- Checkpoint confirmation: the user explicitly approved the Phase 4 report, the Chromium evidence, and the remaining physical-iPad plan (normal launch, first-tap audio unlock during loading, airplane-mode reopen).

## Phase 5 — Integration, documentation, and device verification

- [x] **Task: Run the full automated quality gates** [a202486]
  - [x] Run `pnpm check`.
  - [x] Run `pnpm typecheck`.
  - [x] Run `CI=true pnpm test`.
  - [x] Run `CI=true pnpm test:coverage` and confirm new logic remains above 80%.
  - [x] Run `pnpm build`.
  - [x] Confirm the PWA precache still contains the required assets and record the current entry count/size.
  - [x] **Commit:** `chore(conductor): record resilient boot quality gates` (`a202486`)

### Phase 5 automated quality-gate record (2026-09-25)

- `pnpm check` — passed, 162 files, no fixes applied.
- `pnpm typecheck` — passed.
- `$env:CI='true'; pnpm test` — **882 tests across 69 files passed** (exit 0).
- `$env:CI='true'; pnpm test:coverage` — **All files 91.4% statements / 87.39% branches / 93.19% functions / 91.26% lines**, comfortably above the 80% logic target. New and changed logic modules: `sampleLoader.ts` **100 / 100 / 100 / 100**; `townRenderer.ts` **100 / 100 / 100 / 100**; `bootStatus.ts` 94.44 / 88.88 / 85.71 / 94.44; `game.ts` 94.01 / 86.16 / 90.36 / 93.92. `main.ts` and `bootOverlay.ts` remain excluded DOM glue per `workflow.md`.
- `pnpm build` — succeeded in 1.23s. The main JS chunk is 707.40 kB (185.90 kB gzip); the known Vite chunk-size warning persists and stays out of scope for this track.
- PWA precache: **49 entries, 4,249.03 KiB** — the same 49 entries as before, about 2.4 KiB larger from the boot overlay. This supersedes the stale "42 entries / 3.3 MiB" figure in `docs/cloudflare-pages.md`.
- Only the pre-existing recurring Vitest transform-cache reminder was printed; it is advisory and not a failure.

- [x] **Task: Update affected documentation** [pending]
  - [x] Correct the stale precache figures in `docs/cloudflare-pages.md` to the current measured values.
  - [x] Document the zero-text loading/retry behavior and the fact that optional audio failure is non-blocking.
  - [x] Update the playtest record with the successful progressive boot, retry, offline reopen, and target-device evidence.
  - [x] Do not document context-loss recovery, service-worker redesign, or bundle splitting as shipped features.

- [~] **Task: Perform browser and target-device verification**
  - [x] Start the development server and verify the base town appears before the delayed model set completes.
  - [x] Verify the loading overlay is calm, icon-only, touch-responsive, and safe-area correct in portrait and landscape.
  - [x] Block a model request and verify the retry icon appears and one tap performs one reload.
  - [x] Block an audio sample and verify the game still reaches ready with all visual cues intact.
  - [x] Load the production preview, complete a first visit, enable airplane mode, and verify a cache-backed reopen reaches ready.
  - [x] Exercise representative vehicle selection, movement, traffic, pond, helper, and mission interactions after readiness.
  - [x] Run the physical iPad 9th-generation check at the existing render budget. — **passed, owner-confirmed**
  - [x] **Commit:** `chore(conductor): document resilient boot verification`

### Phase 5 browser verification record (2026-09-25)

**Dev server (Chromium, scripted network conditions)**

- Delayed GLB responses: the progressive base, sky and roads render first, the
  loading toy is shown, and no HUD is present until readiness.
- Blocked GLB response: the retry icon replaces the toy, the render loop is
  verifiably stopped, and exactly one retry tap causes exactly one reload.
- Blocked optional sample: the game still reaches ready with **0 unhandled
  rejections** and all visual cues intact.
- Post-ready canvas taps reach the canvas, not intercepted by a removed overlay.

**Production preview (`pnpm build` + `pnpm preview`)**

- First visit: overlay cleared, 6 HUD buttons, service worker registered and
  active, **0 page errors**.
- Airplane-mode reopen: with `navigator.onLine === false`, the reload still
  reached ready, the full world rendered, and two screenshots taken 700 ms apart
  differed — the offline world is animating, not frozen.
- Interaction smoke: all four vehicle selections took effect
  (`aria-pressed="true"` on each after selection), the ability fired, three
  routed canvas taps produced no errors, and the three-second parent hold opened
  the panel with both toggles.
- Safe areas: at 810×1080 portrait and 1080×810 landscape every control stayed
  fully in-viewport at full touch size — vehicles 91×91, ability 96×96, mute
  72×72, parent gear 56×56 — with the overlay gone in both orientations.

**Outstanding:** none. The physical iPad 9th-generation check was completed by the
owner and passed — the loading toy is calm, first-tap audio unlock works during
loading, the airplane-mode reopen reaches ready, and frame feel is unchanged
while the world streams in.

- [x] **Task: Phase Verification & Checkpoint (Refer to workflow.md)** [3aef0cf]
  - [x] Present the complete automated and manual verification report.
  - [x] Await explicit user confirmation before marking the phase complete.
  - [x] Attach the detailed verification report to the last functional commit using Git notes.
  - [x] Record the checkpoint SHA in this plan and commit the plan update.

### Phase 5 integration and device-verification record (2026-09-25)

**Delivered**

- The world mounts in two phases: `mountTown` places every ground quad first
  and calls `TownMountOptions.onBaseReady` once, before the first awaited GLB,
  and `game.mount` adds that group to the scene from the seam. Sky, ground and
  roads are therefore on screen while models, traffic and the hero car load.
- `bootStatus.ts` owns the pure `loading → ready | failed → retrying`
  lifecycle, including one-shot retry and the rule that a late promise can
  never overwrite a settled boot. `bootOverlay.ts` is the DOM over it: a
  bouncing toy car while loading, one large round-arrow retry button on
  failure, and no visible text in either state.
- `main.ts` holds `driven` and `ready` in a single `try`/`catch`, creates
  gameplay input and the vehicle HUD only after `ready`, and on failure stops
  the render loop, disconnects the `ResizeObserver`, disposes audio and wires
  the retry control to exactly one `location.reload()`.
- First-gesture unlock moved to a one-shot window-level `pointerdown`, so a
  touch on the loading overlay still starts the `AudioContext`.
- `sampleLoader.ts` settles the nine optional samples with
  `Promise.allSettled`, so one failed fetch or decode is silent rather than
  fatal. The registry, URLs, decode path, synthesized voices, mute behaviour
  and unlock path are unchanged, and a later load can still populate the clip.

**Automated gates**

- `pnpm check` — passed, 162 files, no fixes.
- `pnpm typecheck` — passed.
- `CI=true pnpm test` — **882 tests across 69 files passed**.
- `CI=true pnpm test:coverage` — **91.4% statements / 87.39% branches / 93.19%
  functions / 91.26% lines** overall, above the 80% logic target. `sampleLoader`
  and `townRenderer` at 100%; `bootStatus` 94.44 / 88.88 / 85.71; `game.ts`
  94.01 / 86.16 / 90.36.
- `pnpm build` — succeeded; main chunk 707.40 kB (185.90 kB gzip). The known
  Vite chunk-size warning persists and stays out of scope.
- PWA precache — **49 entries / 4,249.03 KiB**, same entries as before and
  about 2.4 KiB larger. `docs/cloudflare-pages.md` carried a stale "42 entries
  / 3.3 MiB" figure and has been corrected.

**Browser verification** — recorded in the task above and in `docs/playtest.md`:
delayed models show the base first, a blocked model shows the retry icon with a
stopped loop and exactly one reload, a blocked sample still reaches ready with
zero unhandled rejections, the production preview's airplane-mode reopen still
renders and animates, all four vehicles select, the ability and routed taps
work, the parent hold opens, and every control stays in-viewport in portrait
and landscape.

**Target device** — the owner completed the physical iPad 9th-generation check
and confirmed it passed: the loading toy is calm, first-tap audio unlock works
during loading, the airplane-mode reopen reaches ready, and frame feel is
unchanged while the world streams in.

**Scope and deviations**

- No new dependency, asset, framework, registry entry, or visible text surface.
- No WebGL context-loss handling, service-worker/PWA redesign, bundle splitting,
  CI/browser-test infrastructure, mission cycle cleanup, or mission/vehicle
  semantics changes — all explicitly out of scope.
- One in-flight fix beyond the original wording: the loading toy was first a
  bare white icon that washed out against the ground, so it was given the same
  chunky circular weight and palette as the HUD buttons (`fba6c30`).

**Checkpoint:** `3aef0cf` (`feat(boot): gate gameplay and recover from initial
mount failure`) carries the full verification record in its Git note.

## Stop conditions

Stop and report rather than expanding this track if implementation requires any of the following:

- WebGL context-loss handling.
- A service-worker/PWA redesign or a new persistence model.
- A new dependency, asset, framework, or visible text surface.
- In-place partial-world restart or automatic retry semantics.
- Changes to mission semantics, vehicle behavior, input routing after readiness, or the public product scope.
- A loss of the existing town footprint, disposal, model-cache, offline, or render-budget contracts.
- An unavailable iPad/device verification step; the phase remains incomplete rather than being marked by proxy.
