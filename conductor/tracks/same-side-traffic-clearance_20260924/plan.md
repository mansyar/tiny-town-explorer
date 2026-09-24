# Plan: Same-Side Traffic Clearance Fix

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.
>
> Deliberate sequencing: **Phase 1 pins the measured geometry before the
> constant moves.** The tech-stack ledger is amended *ahead of* the code change
> (Guiding Principle 2), then the red characterization (AC1) fails against
> today's 0.3388 reach — the defect itself as a test. The green step flips the
> bias and the amended pass contracts together, so the suite never asserts a
> state the spec doesn't accept. Phase 2 closes with the honest ledger rewrite
> and the desktop pass (AC4) — the one criterion the tests cannot carry.

## Phase 1 – Pin the geometry, then narrow the lanes (TDD) [checkpoint: 490a42d]

- [x] Task: Amend the tech-stack ledger ahead of the code change (GP2) `da58c8f`
  - [x] Rewrite `tech-stack.md`'s lane-bias derivation line and the
    known-cosmetic entry to the target trade: bias 0.177 → **0.136**
    (0.2982 − 0.1618 = 0.1364, rounded down), parking clip removed, mover↔mover
    straight-pass overlap ≈0.015 (authored pair) / ≈0.052 (widest pair) accepted
    — figures marked *"estimates until measured in Phase 1"*, with a dated note
    on the trade reversal (accepted squash-comedy beats an unaccepted parked-car
    clip)
  - [x] Commit: `docs(tech-stack): record the lane-narrowing trade for the
    clearance fix`

  **Done:** the derivation parenthetical and the known-cosmetic sentence are
  marked superseded (kept as the shipped record) and the dated lane-narrowing
  trade note is appended to the entry — target bias 0.136, the accepted
  mover↔mover overlap (≈0.015 / ≈0.052, estimates until Phase 1 measures
  them), and the one superseding clearance contract. Docs task — no red/green
  (not logic-bearing, Guiding Principle 3 exemption); verified by reading the
  rendered entry.
- [x] Task: Red characterization — the parking-strip clearance contract (AC1) `ad4779c`
  - [x] Write failing tests in `trafficBrain.test.ts`'s FR3 suite: sampling
    every road tile/pose on every leg (straights **and** curves, tangent-following
    bias included), no mover footprint point reaches past the parked-cars strip
    near edge (**0.2982**, re-derived from the parked-cars placement data and
    named — e.g. `PARKED_NEAR_EDGE` next to `KERB_BAND_INNER`) toward parking,
    epsilon 0.0005 — **red first** (today's reach is 0.3388, failing by 0.041)
  - [x] Re-derive every figure from fit data (`pnpm assets:measure` + the
    placement suite's arithmetic): widest fitted half-width (0.1618), both
    movers' real half-widths, parked strip near edge (0.2982); record the
    measured overlaps in the task summary
  - [x] Commit: `test(traffic): pin the parked-strip clearance contract (red)`

  **Done:** four tests under `the parking-strip clearance contract (AC1)`;
  3 failed exactly as the defect predicts (reach 0.33876 vs limit 0.29824; seat
  gap −0.03154) with 19 pre-existing tests green. Figures re-derived from fit
  data (`pnpm assets:measure` — suv.glb 1.50×1.30×2.70 confirms the extents
  table): widest half-width 0.16176 (sedan), hatchback 0.12544, strip near edge
  0.29824; per-seat same-side clips today — sedan 0.0405, suv 0.0315, van
  0.0288, hatchback 0.0042. In-flight: the near edge is a test-local
  `parkedNearEdge()` derivation (the plan's `PARKED_NEAR_EDGE` was an "e.g.";
  production code doesn't consume it). This mark is late — it rides the Green
  task's plan commit below.
- [x] Task: Green — narrow the lanes, amend the pass contract (FR1, FR2, FR3) `490a42d`
  - [x] Write failing tests first for the amended contracts: straight passes may
    interpenetrate by the measured band `halfA + halfB − 2 × bias` (rewrite
    `keeps a head-on pass clear of touch` and `lets a same-direction overtake
    pass alongside without overlap` to assert the **accepted** band);
    `derives the bias from the widest fitted model plus the pass clearance`
    becomes *bias ≈ parked-strip near edge − widest half-width, rounded down*;
    `never clips a kerb top by more than the measured slack` is superseded by
    the AC1 contract (`TRAFFIC_KERB_SLACK` re-scoped or retired — minimal edit
    wins)
  - [x] Set `TRAFFIC_LATERAL_BIAS = 0.136`; rewrite the derivation comment in
    `trafficBrain.ts`; make all suites green
  - [x] Refactor + coverage: `pnpm check`, `pnpm typecheck`, `CI=true pnpm test`,
    `pnpm test -- --coverage` — `trafficBrain.ts` holds ≥80% (its current band);
    `trafficSystem.test.ts` / `inputParity.test.ts` pass untouched
  - [x] **Stop condition (Flagged Assumption):** if the tightest-leg curve sweep
    still carries footprint corners past 0.2982 at bias 0.136, absorb the
    measured overshoot into the derivation (0.2982 − half-width − overshoot) and
    re-record the head-on figures; if the mover↔mover overlap then exceeds
    **≈0.1** (reads as interpenetration, not squash), **STOP and bring the user
    the numbers** before any parking-outward fallback
  - [x] Commit: `fix(traffic): narrow the lanes so movers clear the parked
    strip`
  **Done:** bias 0.177 → **0.136** (0.46 − 2 × 0.16176 = 0.136470… floored to
  0.136); swept reach 0.29776 — 0.00047 inside the strip (0.29824). Squash band
  pinned as measured literals (`AuthoredPairSquash` 0.015, `WidestPairSquash`
  0.052): authored pair 0.0152, widest pair 0.05153 — inside the ≈0.1 line, so
  the **stop condition did not trigger** (the mid-corner rotating box overshoots
  ≈0.021 past the strip line at the bend itself, but no seat stands on bend
  tiles and mover longitudinal reach ≈0.51 never meets a seat's inner bound
  0.725). `TRAFFIC_PASS_CLEARANCE` and `TRAFFIC_KERB_SLACK` retired (orphaned by
  the contract move). In-flight note: the red phase caught a tautology — the
  first band tests derived their expectation from the bias under test; fixed by
  pinning the approved figures as measured literals. Gates: biome ✓, tsc ✓,
  790/790 ✓; `trafficBrain.ts` coverage 94.54/91.42/100.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 – Ledger honesty and the desktop pass (mixed) [checkpoint: ____]

- [ ] Task: Record the measured outcome in `tech-stack.md` (NFR4, AC5)
  - [ ] Replace the estimate figures with the Phase 1 measurements; the
    known-cosmetic entry becomes a dated record: clip fixed, the accepted
    overlap figures, and the superseded kerb-kiss contract
  - [ ] Commit: `docs(tech-stack): record the measured clearance outcome`
- [ ] Task: Desktop browser verification pass (AC4, manual-verify)
  - [ ] `pnpm dev` → open the town; watch a mover thread the tightest kerb past
    the parked cars — **no clip**; watch the pair pass head-on — **reads as
    squash comedy, not collision**; run one mission and confirm taps, pacing and
    celebrations unaffected; reload offline — unchanged
  - [ ] No code change expected; the steps and outcome land in the task summary
    (git note) and the phase verification report
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
  - [ ] Quality gates: `pnpm check && pnpm typecheck && CI=true pnpm test` green;
    >80% coverage on touched logic; public constants documented; tech-stack
    documented
