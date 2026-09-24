# Plan: Mission-Stack Naming & Seam Cleanup

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/UI-glue, exempt from red/green per `workflow.md`
> Guiding Principle 3. **(mechanical)** = pure rename/deletion with no behavior
> change — the frozen suites are the gate. Every phase ends with the workflow's
> verification and checkpoint protocol.
>
> Deliberate sequencing: **rename before deletion, deletion before reshaping** —
> Phase 1 moves names first so every later diff is readable against the new
> ones; Phase 2 removes the unused seam while its tests still name the old
> shape; Phase 3 is the only red/green phase (the one real contract change:
> `showIn` becomes optional); the freeze proof closes the track (Phase 4)
> because "zero behavior change" (NFR1) is judged against the fully-assembled
> mission stack.

## Phase 1 – Fire-mission rename (mechanical) [checkpoint: ]

- [x] Task: Rename `missionManager.ts` → `fireMission.ts` and its misnamed exports (FR1) (8205c2e)
  - [x] Audit the module's exports and rename truthfully: `MissionState` →
    `FireMissionState`, `createMissionManager` → `createFireMission`; if
    `MissionSnapshot` proves fire-owned (it embeds `MissionState`) but is
    consumed as a generic shape (e.g. `missionBusy.ts`), extract the minimal
    shared type instead of renaming blindly — record as an in-flight refinement
  - [x] Rename `missionManager.test.ts` → `fireMission.test.ts`; update imports
    in `main.ts`, `missionBusy.ts`, `missionFocus.ts`, `missionCelebration.ts`
    (+test), `missionFsm.test.ts`, `missionBusy.test.ts`
  - [x] Mechanically rename `MissionState`/imports in the frozen suites
    (`missionAbortParity`, `missionStateMatrix`, `missionMarkers`) — imports and
    type names only, nothing else (NFR1 diff-reviewable)
  - [x] Sweep live comments/JSDoc for "manager" wording; verify
    `rg 'missionManager|\bMissionState\b|createMissionManager' src/` is empty
  - [x] Refactor + coverage (frozen suites green; >80% on every touched logic
    module)
  - **Done:** 790 tests green (64 files) after `pnpm check` + `tsc` clean.
    Full rename set: `createMissionManager` → `createFireMission`,
    `MissionState` → `FireMissionState`, `MissionSnapshot` →
    `FireMissionSnapshot`, `MissionManager` → `FireMission`,
    `MissionManagerOptions` → `FireMissionOptions`; `firePacer.ts` comment
    wording updated. In-flight refinement (workflow.md): `MissionSnapshot`
    audited and renamed rather than extracting a shared type — it embeds the
    fire state + `fireHouseId`/`burstsLeft` (fire-owned), and `isTownBusy()`'s
    `fire` parameter *is* the fire snapshot, so there is no generic shape to
    extract. AC-1 sweep clean (no `missionManager`/`MissionState`/
    `createMissionManager`/`FireFire` in `src/`). Biome safe fixes were forced
    by the rename (import reorder + line wraps) in the 11 already-touched
    files; frozen suites changed only in import order/wrap and type names.
    Coverage: fireMission 97.22% stmts / 100% branch; missionBusy,
    missionFocus, missionCelebration, firePacer 100%.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 – Delete the registry seam (mechanical)

- [ ] Task: Remove `spawnOne`/`trySpawn` and the per-entry `focus` (FR2)
  - [ ] Delete `spawnOne()` from the registry API and implementation,
    `MissionContribution.trySpawn`, and the per-entry `focus` fallback +
    `MissionContribution.focus` — the town-wide `missionFocus` resolver remains
    the single focus path and `tick`/`tap`/`isIdle`/`isBusy` are untouched
  - [ ] Delete the now-orphaned tests (`spawnOne`/`trySpawn`/`focus` blocks in
    `missionRegistry.test.ts`); update the module JSDoc
    (`{ tick, tap, focus, isIdle, trySpawn }` → the surviving shape)
  - [ ] Verify `rg 'spawnOne|trySpawn' src/` is empty; the remaining registry
    suite passes unchanged
  - [ ] Refactor + coverage (`missionRegistry` stays >80%)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 – Truthful marker adapter (TDD)

- [ ] Task: `MarkerAdapter.showIn` optional; drop `FIRE_FLAME.showIn` (FR3)
  - [ ] Write failing tests (red): an adapter with no `showIn` is never visible
    through the generic sync (`markerVisible` reports false in every state)
    while its `markerTap` seams still work; `FIRE_FLAME` carries no `showIn`
    property (pinning that `fireFx` owns flame visibility); every other adapter
    (`ORDER_CONE`, `PARK_FIELD`, `PUPPY_PAW`, `PUPPY_HEART`) still declares
    `showIn` and behaves exactly as before
  - [ ] Implement to pass (green): `readonly showIn?: readonly S[]` on
    `MarkerAdapter`; `markerVisible` treats absent as "drives no visibility";
    delete the `showIn` line from `FIRE_FLAME`
  - [ ] Refactor + coverage (`missionMarkers` well above 80%; frozen suites
    green and unmodified)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Behavior-freeze proof & docs (manual-verify)

- [ ] Task: Four-mission walkthrough at `?calmGap=2` (AC6) — manual
  verification steps recorded per workflow.md
  - [ ] Play all four missions through on the dev server; every beat identical
    to the consolidation-track walkthrough: markers only in their states,
    confetti + sun + cheer, exactly one sparkle per completion (never in free
    play), helper hand demos exactly once per idle stretch
- [ ] Task: Freeze review, docs sweep, final gates (AC4, AC5, AC7)
  - [ ] Diff-review the frozen suites: only import-path/type-name renames (NFR1)
  - [ ] Live docs/comments carry the new names; `docs/playtest.md` and
    `conductor/archive/*` byte-identical (NFR4) — verified via
    `git diff --name-only`
  - [ ] Final `pnpm check && pnpm typecheck && CI=true pnpm test`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
