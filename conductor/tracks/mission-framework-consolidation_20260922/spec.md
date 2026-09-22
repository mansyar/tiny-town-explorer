# Spec: Mission Framework Consolidation (with Unified Completion Sparkle)

## Overview

The four shipped missions (fire, ice cream delivery, park cleanup, lost puppy)
each hand-roll an internal FSM, marker wiring, and celebration/linger handling
on top of an already-shared seam (`missionRegistry`, `missionRotation`,
`missionBusy`, `calmGapPacer`, `missionFocus`). This track consolidates those
duplicated layers into one tested generic framework the four missions configure
— a refactor both the ice-cream and park/puppy specs deferred as "a later
track" — plus one bundled micro-feature: a **unified completion sparkle** that
gives every mission the same visual completion beat.

Type: **Refactor + minor feature**. The child-facing game plays the same,
except the new sparkle.

## Functional Requirements

**FR1 — Generic mission FSM:** Extract a single state-machine module covering
the shared lifecycle stages the four missions currently implement separately
(idle → spawning → ready/armed → resolving → celebrating → lingering → idle).
Each mission supplies configuration/behavior callbacks; no mission keeps its
bespoke transition code.

**FR2 — Shared marker layer:** Consolidate marker wiring (order cone/ring,
litter pile, puppy spot, fire target) behind one shared module with a
per-mission adapter. Visibility, tap-resolution, and arm/disarm semantics are
expressed once.

**FR3 — Shared celebration & linger:** One celebration/linger module drives
confetti/cheer/sun-style completion feedback; per-mission differences become
data (colors, sounds, duration), not code.

**FR4 — Unified completion sparkle (bundled feature):** On mission completion,
a small sun/sparkle burst pops at town hall. Icon-only, zero text, never
sound-only (must pair with existing celebration audio). Fires **exactly once
per completion** — immune to tap spam and interruption during linger — and
**never** during free play or mission start.

**FR5 — Frozen shared-module contracts:** `missionBusy`, `calmGapPacer`,
`missionFocus` are **not** reworked. 60–90s calm gaps, no double-spawn /
fire-vs-ice-cream exclusion, and 10s-idle helper-hand retargeting behave as
today.

**FR6 — Mid-mission abort parity:** Teardown in *any* FSM state (marker armed,
celebration lingering, sparkle pending) must clean up exactly as today's
missions do — no orphan markers, no post-abort celebrations.

## Non-Functional Requirements

- **NFR1:** Existing test suite stays green (current baseline: **516 tests /
  43 files**); edits to existing tests limited to import-path/shape changes
  forced by the refactor.
- **NFR2:** Logic-module coverage stays **>80%**; new FSM/marker/celebration
  modules are logic modules (TDD applies).
- **NFR3:** Scene budget unaffected materially: sparkle reuses existing FX
  particles/shaders where possible; no new draw-call hotspot (baseline ~134
  draw calls, ~37.9k tris).
- **NFR4:** Zero new text, zero failure states, zero persistence — the four
  product pillars hold.

## Acceptance Criteria

- **AC1:** All four missions run end-to-end on desktop with no *unintended*
  visible change; the only child-visible difference is the town-hall sparkle on
  completion.
- **AC2:** `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` all green;
  NFR1/NFR2 hold.
- **AC3 — state matrix:** For each mission × each FSM state, tests assert
  marker visibility/tap-correctness — no marker visible or tappable outside
  its own mission and state (e.g., no puppy spot during fire mission).
- **AC4 — abort parity:** Tests tear down each mission in every state and
  assert full cleanup (FR6).
- **AC5 — shared contracts frozen:** Existing `missionBusy` / `calmGapPacer` /
  `missionFocus` tests pass **unmodified**.
- **AC6 — sparkle:** Unit tests prove exactly-once firing on completion, zero
  firing on free play/start, and survival of tap-spam + interruption scenarios
  (FR4).
- **AC7:** Per-mission bespoke FSM/marker/celebration code is gone — a single
  framework module exists, and each mission file shrinks to configuration +
  adapters.

## Out of Scope

- Any 5th mission or new mission content.
- Reworking `missionBusy`, `calmGapPacer`, `missionFocus`, `missionRotation`,
  `helperHand` internals (frozen contracts).
- New vehicle models, audio clips, or scene/camera changes.
- The sticker board, traffic/parked cars, and any persistence.
- Visual redesign of existing markers/celebrations (behavior preserved; only
  code location changes).
- Refactors outside `src/game/mission/` (except the minimal sparkle FX hook).
