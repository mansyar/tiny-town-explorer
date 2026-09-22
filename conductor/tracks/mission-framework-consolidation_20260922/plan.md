# Plan: Mission Framework Consolidation + Unified Completion Sparkle

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.

## Phase 1 – Characterization safety net (TDD) [checkpoint: ad610d6]

*Write the AC3/AC4/AC5 tests against **current** behavior before touching
anything — they pin today's semantics and must stay green through every later
phase.*

- [x] Task: Per-mission state matrix (AC3) `197324f`
  - [x] Write matrix tests: for each of fire / ice cream / park / puppy × each FSM state, assert marker visibility and tap-correctness (no puppy spot tappable during fire mission, no cone after serve, etc.), red first where a gap exists
  - [x] Implement only missing assertions/minimal hooks; coverage on new test helpers
- [x] Task: Mid-mission abort parity harness (FR6, AC4) `e9c4953`
  - [x] Write tests that tear down each mission in every state (armed marker, celebrating, lingering) and assert full cleanup — no orphan markers, no post-abort celebration, no sparkle-pending leakage
  - [x] Implement minimal fixes only if current behavior is under-specified; document any divergence in the task note
- [x] Task: Frozen-contract baseline (FR5, AC5) — frozen baseline: missionBusy 5 + calmGapPacer 13 + missionFocus 13 = **31 tests / 3 files**, zero diff vs branch point `0c177b2`
  - [x] Verify `missionBusy` / `calmGapPacer` / `missionFocus` suites pass **unmodified**; record their test counts as the frozen baseline (no code changes)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `ad610d6`

## Phase 2 – Generic mission FSM (TDD) [checkpoint: a71f890]

- [x] Task: FSM core module `f78bbf3`
  - [x] Write failing tests for the state machine contract: declared states, guarded transitions, tick/tap delegation, exactly-one transition per update, celebration entry fires once (red first)
  - [x] Implement the generic FSM module configured per mission
  - [x] Refactor + coverage (>80% on the new logic module) — 100% stmts/branch/funcs
- [x] Task: Abort/teardown semantics in the FSM (FR6) `f78bbf3` (abort landed in the same red-green cycle as the core; see task note)
  - [x] Write failing tests: `abort()` from any state returns to idle and emits cleanup, including mid-celebration (red first)
  - [x] Implement + coverage
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `a71f890`

## Phase 3 – Shared marker layer (TDD)

- [~] Task: Marker adapter contract
  - [ ] Write failing tests: one adapter interface covers cone/ring, litter, puppy spot, fire target — show/hide/arm/disarm/tap-resolution driven by FSM state (red first)
  - [ ] Implement the shared marker module
  - [ ] Refactor + coverage (>80%)
- [ ] Task: Migrate the four missions' markers onto the adapter
  - [ ] Re-point fire, order, litter, puppy markers through the shared layer; Phase 1 matrix tests are the acceptance gate (must stay green)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Shared celebration/linger + unified completion sparkle (TDD)

- [ ] Task: Celebration & linger as data
  - [ ] Write failing tests: confetti/cheer/sun recipe per mission expressed as data; linger duration preserved per mission; celebration fires exactly once (red first)
  - [ ] Implement the shared celebration module
- [ ] Task: Unified completion sparkle (FR4, AC6)
  - [ ] Write failing tests: fires exactly once per completion; zero fires in free play or mission start; survives tap-spam and interruption during linger (red first)
  - [ ] Implement the town-hall sparkle trigger (logic) + FX hook (manual-verify), paired with existing celebration audio — never sound-only
  - [ ] Refactor + coverage (>80% on sparkle/celebration logic)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 – Mission migration + deletion (mixed)

- [ ] Task: Move all four missions onto the framework (AC7)
  - [ ] Convert fire, ice cream, park, puppy FSM/marker/celebration code to configuration + adapters; delete bespoke transition code; full suite green after each mission
- [ ] Task: `main.ts` wiring (manual-verify)
  - [ ] Confirm registry/tick/tap paths unchanged externally; manual walkthrough spawn → respond → celebrate → sparkle for each mission
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6 – Verification + docs

- [ ] Task: Full gates (AC1, AC2, NFR1–NFR3)
  - [ ] `pnpm check`, `pnpm typecheck`, `CI=true pnpm test`; coverage >80% on logic modules; re-measure scene budget (~37.9k tris / ~134 draw calls) for the sparkle delta
- [ ] Task: Four-mission desktop playthrough (AC1)
  - [ ] Drive all four missions end-to-end: no unintended visible change; town-hall sparkle pops exactly once per completion, absent in free play
- [ ] Task: Update `docs/playtest.md` and `tech-stack.md` with AC results and any measured deltas
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## History

- 2026-09-22 – Track created from an approved spec. Phase 1 deliberately
  writes characterization tests *before* refactor work so the consolidation
  has a behavior-pinning safety net (the review-lesson pattern already in
  README: "faults lived in wiring").
