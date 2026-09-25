# Specification: Resilient Progressive Boot

**Type:** Feature  
**Branch:** `feature/resilient-progressive-boot`  
**Track ID:** `resilient-progressive-boot_20260925`

## 1. Overview

The game currently starts its render loop before the world is fully mounted, but `mountTown()` does not add the town group to the scene until every model has loaded. During a normal cold boot, the child therefore sees the sky while all models are still loading. A rejected model promise can also escape `main()` without a visible recovery state, and sampled-audio loading is started without an aggregate rejection handler.

This track makes the existing boot pipeline progressive and recoverable while preserving the controller architecture, offline-first behavior, zero-text UX, and all existing game rules.

## 2. Goals

1. Make the loading period visibly intentional rather than an empty sky.
2. Show the ground/base town before the first awaited GLB completes.
3. Reveal mounted town pieces as they become available.
4. Keep gameplay input and the vehicle HUD unavailable until the controller is truly ready.
5. Turn initial model/world failures into a calm, icon-only retry state.
6. Allow sampled-audio failures to degrade silently without blocking the game.
7. Preserve existing game promises, world behavior, assets, and rendering budget.

## 3. Functional requirements

### FR1 — Progressive town mounting

- The town must be mounted in a visible two-phase order:
  1. synchronous ground/base geometry;
  2. authored GLB placements in the existing plan order.
- The base town group must be added to the scene before the first awaited model load.
- Each model must be added to that same group as soon as its load resolves.
- The existing `TownMount` result, house-footprint measurements, placement names, transforms, disposal behavior, and authored town data must remain compatible.
- A failed model must reject the existing mount promise; it must never make a partially mounted town look ready.
- The implementation must not create a second town, duplicate model instances, or issue duplicate uncached model requests.

### FR2 — Child-visible boot state

- A calm, icon-only boot overlay must be visible from the beginning of the boot process until the vehicle HUD is active.
- The loading state must use the existing toy-like visual language, with a large recognizable vehicle/loading icon and gentle motion rather than flashing, shaking, or harsh color changes.
- The loading control must acknowledge a touch with a small visual response, while not queueing a gameplay command.
- The overlay must not display written words, error codes, stack traces, or console output.
- The loading control must be at least 96×96 CSS pixels in either portrait or landscape.
- Non-visible accessibility metadata may describe the state, but no visible text may be introduced.
- The first pointer gesture anywhere on the page must still be used to unlock the audio context, even when the gesture lands on the loading overlay.

### FR3 — Readiness and input gating

- The controller’s synchronous `createGame()` behavior and its `driven`/`ready` promises must remain intact.
- The render loop must continue to start before asynchronous world mounting completes.
- Gameplay pointer routing and the vehicle HUD must not become active until `game.ready` has resolved and the HUD has been initialized.
- Taps received during loading must not create routes, honks, mission claims, or vehicle-selection requests.
- On successful readiness, the existing active vehicle, ability, mute, parent-gate, and install-hint behavior must appear without a second boot or state reset.
- The camera may continue to render the progressive town during loading, but the child must not be asked to drive an incomplete world.

### FR4 — Initial failure recovery

- `main()` must handle rejection from both the `driven` and `ready` paths.
- A failed initial mount must:
  1. stop the render loop;
  2. disconnect the resize observer;
  3. stop/dispose the audio engine where applicable;
  4. show the icon-only error/retry state;
  5. avoid unhandled promise rejections.
- The retry control must perform one full-page reload. It must not create a partial in-place restart state machine.
- Repeated pointer events on the retry control must result in only one reload request.
- A successful boot must never show the error state because of a late, unrelated audio failure.
- The implementation must not invent a visible diagnostic message for an adult or child.

### FR5 — Optional sampled audio

- Sample loading must settle independently, using an aggregate mechanism equivalent to `Promise.allSettled`.
- A failed or undecodable sample must not reject the boot, prevent `game.ready`, or prevent other samples from loading.
- Missing sampled sounds must degrade to silence for that sound only.
- Synthesized sounds and all visual/audio-pairing cues must continue to work when one sample is unavailable.
- A failed sample must not create an unhandled rejection.
- The retry control is for initial world readiness, not for waiting synchronously on optional audio.

### FR6 — Existing product contracts

- Zero visible text remains mandatory.
- Offline-first behavior remains mandatory.
- No new persistence or session storage is introduced.
- No new network dependency, asset, framework, or third-party package is introduced.
- Existing mission, vehicle, traffic, camera, audio-cap, and rendering behavior remains unchanged after readiness.

## 4. Non-functional requirements

- The base layer must become visible on the first rendered frames that can display it, without waiting for the complete town.
- The boot path must not create a measurable per-frame geometry or draw-call cost after readiness.
- The loading UI must use no text, network calls, or blocking browser dialogs.
- All new logic-bearing state transitions must be unit-testable with injected reload and clock/DOM seams where practical.
- The existing test suite must remain green, and new tests must cover both successful and rejected boot paths.
- The production build must continue to precache every shipped asset and remain playable offline after a successful first load.

## 5. Acceptance criteria

- **AC1 — Progressive visibility:** With model loads delayed, the first rendered view contains the base town rather than only the sky; resolved models appear progressively in the authored order.
- **AC2 — Final equivalence:** A successful progressive boot produces the same town placements, measured house footprints, motor position, active vehicle, missions, and traffic state as the current all-at-once boot.
- **AC3 — Readiness gate:** The loading overlay and child gameplay input remain unavailable until `game.ready`; a pre-ready tap produces only the loading-state acknowledgement and no queued game action.
- **AC4 — Successful transition:** After readiness, the overlay is removed, the HUD is initialized, and the first gameplay tap receives the existing route/honk response within the project’s approximately 100ms response target.
- **AC5 — Model failure:** A rejected town/model or initial hero-model load produces no unhandled rejection, transitions to the retry state, and the retry control requests exactly one page reload.
- **AC6 — Audio degradation:** A rejected or undecodable optional sample leaves the game playable, preserves other audio and all visual cues, and produces no unhandled rejection.
- **AC7 — Cleanup:** A failure path stops the render loop and resize observer and does not leave an animation frame or event listener running behind the retry UI.
- **AC8 — Offline:** A cache-backed production build opens and reaches the ready state with the network disabled; no new request is required for the loading UI.
- **AC9 — Regression gates:** Existing tests pass, new tests pass, `pnpm check`, `pnpm typecheck`, the production build, and the documented manual browser/iPad checks pass. Render measurements must show no material regression attributable to this track.

## 6. Out of scope

- WebGL `webglcontextlost` / `webglcontextrestored` handling.
- Service-worker update UI, cache redesign, or general PWA recovery.
- Bundle splitting or the existing JavaScript chunk-size warning.
- CI or committed browser/E2E infrastructure.
- Automatic retry, in-place partial-world restart, or retrying optional audio.
- New missions, vehicles, town content, persistence, analytics, or settings.
- Any post-ready gameplay refactor or controller decomposition.
- Visible error details, written instructions, or a new adult-facing support screen.

## 7. Technical notes

- The intended seam is an additive two-phase town-mount notification plus a small DOM boot-status module used by `main.ts`; the exact API names are implementation choices.
- `Game` remains the controller owner. The browser edge remains responsible for renderer, DOM status, input gating, and first-gesture audio unlock.
- `modelLibrary`’s existing failed-promise eviction remains useful, but the page-level retry uses a full reload rather than relying on a second in-page mount.
