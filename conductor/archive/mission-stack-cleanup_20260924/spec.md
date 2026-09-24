# Spec: Mission-Stack Naming & Seam Cleanup

## Overview
Rename the misnamed fire-mission module and delete the half-used
`missionRegistry` seam so the mission stack reads as one coherent, data-driven
framework with no machinery that nothing calls. **Behavior is frozen**: zero
child-visible change of any kind.

## Context
- `missionManager.ts` is actually the **fire mission** — `MissionState` is
  fire's state type. Naming debt carried since the framework consolidation.
- `missionRegistry` exposes `spawnOne()`/`trySpawn` and a per-entry `focus`
  fallback that `main.ts` never exercises: spawning goes through `tickPacers`
  + `missionRotation`, and focus through the town-wide `missionFocus` resolver.
- `FIRE_FLAME.showIn` is a required `MarkerAdapter` field that no code path
  reads for the flame — `fireFx` owns flame visibility, so the field describes
  states it never drives.

## Functional Requirements
- **FR1 — Fire-mission rename.** `src/game/mission/missionManager.ts` →
  `fireMission.ts`; `MissionState` → `FireMissionState`; test file renames in
  step (`missionManager.test.ts` → `fireMission.test.ts`); all imports and
  references in live code updated (including `main.ts`).
- **FR2 — Delete the registry seam.** Remove `spawnOne()`, `trySpawn`, and the
  per-entry `focus` fallback from `missionRegistry.ts` (and
  `MissionContribution.focus`), deleting their now-orphaned tests.
  `createMissionRegistry` keeps `tick`/`tap`/`isIdle`/`isBusy`, and the
  town-wide focus resolver stays the single focus path.
- **FR3 — Truthful marker adapter.** `MarkerAdapter.showIn` becomes optional
  (`readonly showIn?: readonly S[]`); `FIRE_FLAME` drops the field. A pin test
  asserts the flame's visibility remains owned by `fireFx` (nothing reads a
  `showIn` for `FIRE_FLAME`).
- **FR4 — Pinned APIs untouched.** `abort()` on all four mission APIs and the
  abort-parity harness stay exactly as the consolidation review left them.

## Non-Functional Requirements
- **NFR1 — Zero behavior change.** Frozen suites (`missionStateMatrix`,
  `missionAbortParity`, `missionBusy`, `missionFocus`, `missionMarkers`) pass
  **unmodified** except mechanically forced import-path/type-name renames from
  FR1/FR3.
- **NFR2 — Gates green.** `pnpm check && pnpm typecheck && CI=true pnpm test`;
  >80% coverage on logic modules touched (per `workflow.md` TDD scope).
- **NFR3 — No stack change.** No dependency or tech-stack changes
  (`tech-stack.md` untouched except if it names a renamed identifier in live
  prose).
- **NFR4 — Docs discipline.** Live docs (code comments/JSDoc, `README.md`,
  live sections of `tech-stack.md`) carry the new names; historical records
  (`docs/playtest.md`, `conductor/archive/*`) stay as written.

## Acceptance Criteria
- **AC1** `missionManager.ts` and the `MissionState` name are gone from `src/`;
  `fireMission.ts`/`FireMissionState` exist; a search for `missionManager` in
  `src/` returns nothing.
- **AC2** The seam is gone: no `spawnOne`/`trySpawn`/per-entry `focus` anywhere;
  their tests deleted; the remaining registry suite passes.
- **AC3** `MarkerAdapter.showIn` is optional, `FIRE_FLAME` carries none, and a
  test pins the `fireFx`-owns-visibility arrangement.
- **AC4** Frozen suites green and untouched beyond forced renames
  (diff-reviewable).
- **AC5** All three gates green; coverage targets met.
- **AC6** Manual verification: a four-mission walkthrough on the dev server at
  `?calmGap=2` — every mission completes identically (markers, confetti + sun +
  cheer, exactly one sparkle, helper hand demos once).
- **AC7** Live docs reference the new names; historical records unchanged.

## Out of Scope
- Wiring the seam up instead of deleting it (decided: delete).
- Wiring `FIRE_FLAME.showIn` into the fire tick (would cut the smoke 2.5s
  early — a visible change).
- Removing `abort()` or other pinned-but-unused contracts.
- Any child-visible change: markers, FX, timing, pacing, sounds.
- Rewriting historical docs (`docs/playtest.md`, `conductor/archive/*`).
- Separate tracks: CI gates, performance ratchet, sticker board, housekeeping.
