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

## Phase 1 – Pin the geometry, then narrow the lanes (TDD) [checkpoint: ____]

- [ ] Task: Amend the tech-stack ledger ahead of the code change (GP2)
  - [ ] Rewrite `tech-stack.md`'s lane-bias derivation line and the
    known-cosmetic entry to the target trade: bias 0.177 → **0.136**
    (0.2982 − 0.1618 = 0.1364, rounded down), parking clip removed, mover↔mover
    straight-pass overlap ≈0.015 (authored pair) / ≈0.052 (widest pair) accepted
    — figures marked *"estimates until measured in Phase 1"*, with a dated note
    on the trade reversal (accepted squash-comedy beats an unaccepted parked-car
    clip)
  - [ ] Commit: `docs(tech-stack): record the lane-narrowing trade for the
    clearance fix`
- [ ] Task: Red characterization — the parking-strip clearance contract (AC1)
  - [ ] Write failing tests in `trafficBrain.test.ts`'s FR3 suite: sampling
    every road tile/pose on every leg (straights **and** curves, tangent-following
    bias included), no mover footprint point reaches past the parked-cars strip
    near edge (**0.2982**, re-derived from the parked-cars placement data and
    named — e.g. `PARKED_NEAR_EDGE` next to `KERB_BAND_INNER`) toward parking,
    epsilon 0.0005 — **red first** (today's reach is 0.3388, failing by 0.041)
  - [ ] Re-derive every figure from fit data (`pnpm assets:measure` + the
    placement suite's arithmetic): widest fitted half-width (0.1618), both
    movers' real half-widths, parked strip near edge (0.2982); record the
    measured overlaps in the task summary
  - [ ] Commit: `test(traffic): pin the parked-strip clearance contract (red)`
- [ ] Task: Green — narrow the lanes, amend the pass contract (FR1, FR2, FR3)
  - [ ] Write failing tests first for the amended contracts: straight passes may
    interpenetrate by the measured band `halfA + halfB − 2 × bias` (rewrite
    `keeps a head-on pass clear of touch` and `lets a same-direction overtake
    pass alongside without overlap` to assert the **accepted** band);
    `derives the bias from the widest fitted model plus the pass clearance`
    becomes *bias ≈ parked-strip near edge − widest half-width, rounded down*;
    `never clips a kerb top by more than the measured slack` is superseded by
    the AC1 contract (`TRAFFIC_KERB_SLACK` re-scoped or retired — minimal edit
    wins)
  - [ ] Set `TRAFFIC_LATERAL_BIAS = 0.136`; rewrite the derivation comment in
    `trafficBrain.ts`; make all suites green
  - [ ] Refactor + coverage: `pnpm check`, `pnpm typecheck`, `CI=true pnpm test`,
    `pnpm test -- --coverage` — `trafficBrain.ts` holds ≥80% (its current band);
    `trafficSystem.test.ts` / `inputParity.test.ts` pass untouched
  - [ ] **Stop condition (Flagged Assumption):** if the tightest-leg curve sweep
    still carries footprint corners past 0.2982 at bias 0.136, absorb the
    measured overshoot into the derivation (0.2982 − half-width − overshoot) and
    re-record the head-on figures; if the mover↔mover overlap then exceeds
    **≈0.1** (reads as interpenetration, not squash), **STOP and bring the user
    the numbers** before any parking-outward fallback
  - [ ] Commit: `fix(traffic): narrow the lanes so movers clear the parked
    strip`
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
