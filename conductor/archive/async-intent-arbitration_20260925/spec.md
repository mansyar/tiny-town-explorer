# Track Specification: Async Intent Arbitration

## Overview

The game promises **pure agency** and “newest tap wins,” but the current guarantee is only synchronous. `inputRouter` records the newest command, while `game.tapAt()` can pause while a mission asynchronously swaps the vehicle actor. A slower older `tapAt()` can later set a route after a newer tap, and concurrent `swapVehicle()` calls can leave `fleet.activeId()`, HUD state, and the mounted actor out of sync.

This track fixes that race at the game-controller boundary. It will make accepted mission claims atomic, serialize vehicle morphs, apply only the newest pending intent after asynchronous work, and roll back safely when a replacement actor cannot load. It will not change mission rules, route geometry, collision behavior, or visible product scope.

## Context

- `src/game/input/inputRouter.ts` assigns a monotonic command ID and checks `isCurrent()` synchronously.
- `src/main.ts` checks that command before calling `game.tapAt()`.
- `game.tapAt()` gives immediate feedback, then awaits `answerMissions()` before calculating and committing a route.
- Fire, ice-cream, and park mission handlers commit mission state and then call `activate()` plus `await swapVehicle()`.
- `selectVehicle()` and helper/siren paths also call `activate()` before an asynchronous actor replacement.
- `swapVehicle()` builds a replacement actor before removing the current one, but it has no generation, serialization, stale-result check, or rollback policy.

## Functional Requirements

- **FR1 — Controller-owned intent generation.** `createGame` will assign monotonic generations to destination and vehicle requests. The input router remains a synchronous routing/hit-test seam; the controller becomes the authority for whether an intent may still commit after an `await`.
- **FR2 — Atomic mission claims.** Once a mission’s tap handler claims a tap and changes its FSM state, that claim and its required vehicle morph must complete. A later child tap cannot cancel or roll back the mission transition.
- **FR3 — Newest destination wins.** `tapAt()` will retain its immediate ring/audio feedback, but after mission handling or a vehicle swap it will commit a route only if its request is still the newest destination intent. If superseded, the old route is discarded.
- **FR4 — Latest pending destination replay.** If a newer destination arrives while a claimed mission morph is loading, the controller will discard older pending routes and apply the newest destination once the current actor is ready. It will not queue every historical tap.
- **FR5 — Serialized vehicle swaps.** Vehicle swaps will not mount concurrently. A requested vehicle will be built before the currently mounted actor is removed. HUD/active state will be committed only when the replacement actor is ready, so the active ID never names an actor that is not mounted.
- **FR6 — Latest HUD selection wins.** Rapid vehicle-button selections will be serialized; after the in-flight swap completes, the most recent explicit selection will be applied. Older selections are discarded rather than replayed.
- **FR7 — Mixed mission and HUD intent.** A mission-required morph remains atomic. A later explicit HUD selection is applied after that morph and wins over an earlier selection, without leaving mission state, fleet state, HUD state, and scene state inconsistent.
- **FR8 — Controlled actor-load failure.** If `createVehicleActor()` rejects, the current actor remains mounted and active, the failed request is cleared, no scene object is removed, and a later selection/tap can retry. A failed mission-required morph must not commit a route with the wrong vehicle; the claimed mission remains retryable.
- **FR9 — All controller entry points participate.** Manual taps, helper-hand demo taps, mission-triggered morphs, and HUD vehicle selections use the same arbitration rules. The helper must not reintroduce a stale route behind a child’s newer intent.
- **FR10 — No stale scene residue.** Every committed swap adds exactly one replacement actor and removes the previous actor; superseded or failed requests must not leak actors into the scene.

## Non-Functional Requirements

- **NFR1 — Product pillars.** No new text, timers, penalties, failure states, persistence, or visible controls. Existing instant feedback and forgiving input remain.
- **NFR2 — TDD.** Controller arbitration and failure behavior are logic-bearing, so failing tests must be written before implementation. Touched logic remains above 80% coverage.
- **NFR3 — Determinism.** The policy must not depend on wall-clock timing or network/model completion order in tests; deferred promises will model the race deterministically.
- **NFR4 — Surgical scope.** Prefer a controller-local arbitration mechanism and the smallest necessary test changes. Do not broaden `inputRouter`, mission FSMs, pathfinding, or the vehicle motor unless a failing test proves a dependency requires it.
- **NFR5 — No asset/render cost.** No models, textures, audio, materials, scene geometry, or mission timing change. The current render budget and PWA output must remain unchanged.
- **NFR6 — API clarity.** Any new internal types/functions and changed public controller methods must have documentation explaining ownership, commit point, and failure behavior.

## Acceptance Criteria

- **AC1 — Rapid destination race:** with a deferred mission/vehicle operation, taps A then B leave only B’s route committed after resolution; A never calls `setPath`, and both taps still receive immediate feedback.
- **AC2 — Atomic mission claim:** a newer free-play tap during a claimed fire, ice-cream, or park morph does not undo the mission state; the required vehicle mounts and the newest destination is then applied.
- **AC3 — Rapid vehicle selection:** selections A then B, with A delayed, finish with fleet active ID, HUD active ID, and mounted actor all equal to B; no A actor remains in the scene.
- **AC4 — Mixed intent:** a mission-required morph followed by a newer HUD selection completes the mission morph and then leaves the explicit selection as the final active vehicle, with no mismatch.
- **AC5 — Failed replacement:** a rejected actor load leaves the prior actor mounted and active, performs no scene removal, leaves the game usable, and permits a subsequent successful retry.
- **AC6 — Helper parity:** helper/demo input cannot overwrite a newer child intent and follows the same commit rules.
- **AC7 — Regression gates:** `pnpm check`, `pnpm typecheck`, `CI=true pnpm test`, and `pnpm build` are green; touched logic meets the coverage target.
- **AC8 — Manual interaction pass:** in a browser, rapidly tap destinations and switch vehicles while missions are active; verify immediate feedback, final actor/state consistency, no stuck car, and unchanged four-mission behavior. Repeat touch verification on the iPad floor device.

## Design Decisions

| Decision | Chosen policy | Reason |
| --- | --- | --- |
| Arbitration owner | `game.ts` controller | `inputRouter` has no knowledge of mission state or async actor lifecycle. |
| Mission claim | Atomic | Cancelling after an FSM transition could leave a mission waiting for a vehicle that never mounts. |
| Route queue | Latest pending intent only | Preserves newest-tap agency without replaying stale child actions. |
| Vehicle queue | Serialized, latest selection wins | Prevents actor leaks and guarantees the mounted actor matches the active ID. |
| HUD commit | After replacement actor is ready | Avoids advertising a vehicle that is still loading. |
| Failure behavior | Rollback to last known-good actor; retry later | Preserves zero-failure usability without adding a new child-facing recovery UI. |
| UI/error scope | No new loading or error screen | Boot recovery remains a separate deferred track. |

## Out of Scope

- Changes to pathfinding, tap hit-testing, collision response, vehicle motor rules, or mission FSM semantics.
- New missions, vehicles, art, audio, traffic, or controls.
- A new textless loading/error/retry screen or general PWA/service-worker redesign.
- Bundle splitting, render-budget work, CI/browser-test infrastructure, or the detected mission dependency cycle.
- A broad rewrite of the controller or mission framework.

## Flagged Assumptions

- `createVehicleActor()` is the asynchronous boundary that can be controlled by the controller; `modelLibrary` already evicts failed promises so later requests can retry.
- Mission handlers commit their FSM state before their current `await swapVehicle()`; the implementation must not attempt an implicit mission rollback.
- The existing `GameScene.add/remove` port is sufficient to test actor residue and rollback.
- The existing HUD API can represent a committed active vehicle without adding a new pending-state element.
