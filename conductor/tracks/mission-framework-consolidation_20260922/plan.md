# Plan: Mission Framework Consolidation + Unified Completion Sparkle

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.

## Phase 1 – Characterization safety net (TDD)

*Write the AC3/AC4/AC5 tests against **current** behavior before touching
anything — they pin today's semantics and must stay green through every later
phase.*

- [ ] Task: Per-mission state matrix (AC3)
  - [ ] Write matrix tests: for each of fire / ice cream / park / puppy × each FSM state, assert marker visibility and tap-correctness (no puppy spot tappable during fire mission, no cone after serve, etc.), red first where a gap exists
  - [ ] Implement only missing assertions/minimal hooks; coverage on new test helpers
- [ ] Task: Mid-mission abort parity harness (FR6, AC4)
  - [ ] Write tests that tear down each mission in every state (armed marker, celebrating, lingering) and assert full cleanup — no orphan markers, no post-abort celebration, no sparkle-pending leakage
  - [ ] Implement minimal fixes only if current behavior is under-specified; document any divergence in the task note
- [ ] Task: Frozen-contract baseline (FR5, AC5)
  - [ ] Verify `missionBusy` / `calmGapPacer` / `missionFocus` suites pass **unmodified**; record their test counts as the frozen baseline (no code changes)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 – Generic mission FSM (TDD)

- [ ] Task: FSM core module
  - [ ] Write failing tests for the state machine contract: declared states, guarded transitions, tick/tap delegation, exactly-one transition per update, celebration entry fires once (red first)
  - [ ] Implement the generic FSM module configured per mission
  - [ ] Refactor + coverage (>80% on the new logic module)
- [ ] Task: Abort/teardown semantics in the FSM (FR6)
  - [ ] Write failing tests: `abort()` from any state returns to idle and emits cleanup, including mid-celebration (red first)
  - [ ] Implement + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 – Shared marker layer (TDD)

- [ ] Task: Marker adapter contract
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
