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

## Phase 1 – Fire-mission rename (mechanical) [checkpoint: 403b1fa]

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

## Phase 2 – Delete the registry seam (mechanical) [checkpoint: 3fdc726]

- [x] Task: Remove `spawnOne`/`trySpawn` and the per-entry `focus` (FR2) (046abcc)
  - [x] Delete `spawnOne()` from the registry API and implementation,
    `MissionContribution.trySpawn`, and the per-entry `focus` fallback +
    `MissionContribution.focus` — the town-wide `missionFocus` resolver remains
    the single focus path and `tick`/`tap`/`isIdle`/`isBusy` are untouched
  - [x] Delete the now-orphaned tests (`spawnOne`/`trySpawn`/`focus` blocks in
    `missionRegistry.test.ts`); update the module JSDoc
    (`{ tick, tap, focus, isIdle, trySpawn }` → the surviving shape)
  - [x] Verify `rg 'spawnOne|trySpawn' src/` is empty; the remaining registry
    suite passes unchanged
  - [x] Refactor + coverage (`missionRegistry` stays >80%)
  - **Done:** Net −137 lines. Deleted `spawnOne()` (interface + impl), the
    `MissionContribution.trySpawn`/`focus` fields, and the per-entry focus
    fallback loop — the registry's `focus()` now delegates to the town-wide
    resolver or falls back to the car. Confirmed live surface first:
    `main.ts` builds the registry with `missionFocus` as second arg and calls
    `missions.focus()` at the helper hand; no `spawnOne`/`trySpawn`/per-entry
    `focus` consumer exists anywhere. 6 orphaned tests deleted (3 spawn +
    3 per-entry focus), the town-wide resolver test adapted to entries
    without `focus` (its `asked` assertion is now structurally guaranteed),
    and the stray `spawnOne()` assertion dropped from the empty-registry
    test. AC-2 sweep clean. Gates: `rg 'spawnOne|trySpawn' src/` empty,
    `pnpm check` + `tsc` clean, 64 files / 784 tests pass (790 − 6). Coverage:
    `missionRegistry` 100% stmts / branch / funcs.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 – Truthful marker adapter (TDD) [checkpoint: 356407b]

- [x] Task: `MarkerAdapter.showIn` optional; drop `FIRE_FLAME.showIn` (FR3) (73f23a0)
  - [x] Write failing tests (red): an adapter with no `showIn` is never visible
    through the generic sync (`markerVisible` reports false in every state)
    while its `markerTap` seams still work; `FIRE_FLAME` carries no `showIn`
    property (pinning that `fireFx` owns flame visibility); every other adapter
    (`ORDER_CONE`, `PARK_FIELD`, `PUPPY_PAW`, `PUPPY_HEART`) still declares
    `showIn` and behaves exactly as before
  - [x] Implement to pass (green): `readonly showIn?: readonly S[]` on
    `MarkerAdapter`; `markerVisible` treats absent as "drives no visibility";
    delete the `showIn` line from `FIRE_FLAME`
  - [x] Refactor + coverage (`missionMarkers` well above 80%; frozen suites
    green and unmodified)
  - **Done:** Red-first confirmed (red run: exactly 4 failing / 17 passing —
    `markerVisible` threw on the missing field, the property pin, and the two
    amended assertions). `MarkerAdapter.showIn` now optional;
    `markerVisible` treats absent as "drives no visibility"; `FIRE_FLAME`
    dropped `showIn`, its JSDoc naming `fireFx` as the flame's owner. 3 new
    tests: the no-`showIn` adapter contract (never visible while its
    `markerTap` seams still work), the `'showIn' in FIRE_FLAME` property pin,
    and the four visibility-driving adapters' exact `showIn` declarations.
    **Sanctioned frozen-suite amendment (user-approved via the deviation
    protocol before implementation — it supersedes "unmodified" above):**
    only the two FIRE_FLAME visibility assertions in `missionMarkers.test.ts`
    changed in place — the per-state matrix became "drives no visibility —
    fireFx owns the flame (FR3)" (all states false; the 2.5s-smoke reason in a
    comment) and the cross-adapter isolation line flipped `true`→`false`
    (retitled 'while a fire is spawned, no other marker is present'). Every
    other frozen assertion untouched (tap seams, `armIn` pins, other
    adapters, `syncMarker`). AC-3 satisfied. Gates: `pnpm check` + `tsc`
    clean, 64 files / 787 tests (784 + 3 new). Coverage: `missionMarkers`
    100% stmts/branch/funcs; `fireMission` 97.22% stmts / 100% branch.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Behavior-freeze proof & docs (manual-verify)

- [x] Task: Four-mission walkthrough at `?calmGap=2` (AC6) — manual
  verification steps recorded per workflow.md
  - [x] Play all four missions through on the dev server; every beat identical
    to the consolidation-track walkthrough: markers only in their states,
    confetti + sun + cheer, exactly one sparkle per completion (never in free
    play), helper hand demos exactly once per idle stretch
  - **Done:** Walkthrough performed at `?calmGap=2` and user-confirmed
    2026-09-24: all four missions played through with beats identical to the
    consolidation-track walkthrough — markers only in their states, the fire's
    smoke lingering through the 2.5s celebration (Phase 3's regression guard),
    confetti + sun + cheer with exactly one sparkle per completion and none in
    free play, helper hand demoing exactly one tap per idle stretch.
- [x] Task: Freeze review, docs sweep, final gates (AC4, AC5, AC7)
  - [x] Diff-review the frozen suites: only import-path/type-name renames (NFR1)
  - [x] Live docs/comments carry the new names; `docs/playtest.md` and
    `conductor/archive/*` byte-identical (NFR4) — verified via
    `git diff --name-only`
  - [x] Final `pnpm check && pnpm typecheck && CI=true pnpm test`
  - **Done:** Freeze review (`git diff -U0 main...HEAD` over the five frozen
    suites): only forced import-path/type/function renames plus
    biome-forced wraps, the 3 *additive* FR3 tests, and exactly the two
    user-sanctioned `FIRE_FLAME` amendments — no other frozen assertion
    moved; `missionFocus.test.ts` unchanged entirely (AC-4/NFR1). Docs
    sweep: `docs/playtest.md`, `conductor/archive/*`, `README.md` and
    `conductor/tech-stack.md` byte-identical to `main`; the single remaining
    `missionManager` mention is the historical v1 AC4 row in `docs/playtest.md`
    and stays as written (AC-7/NFR4). Final gates: `pnpm check` (145 files)
    and `tsc --noEmit` clean; `CI=true pnpm test` = 64 files / 787 tests pass
    (AC-5) — this run also serves as the checkpoint protocol's test run, as
    no code has changed since.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
