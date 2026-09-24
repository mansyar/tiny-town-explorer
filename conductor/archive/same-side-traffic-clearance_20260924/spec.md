# Spec: Same-Side Traffic Clearance Fix

## Overview

`tech-stack.md` carries one known cosmetic from *Light Wandering Traffic*: on a
same-side pass a wanderer's swept reach (0.3388 from the road centre line) edges
**0.041 into the parked-cars strip** (near edge 0.2982) — a mover visually clips
a parked car, the one interpenetration in town the squash-comedy language does
not cover (parked cars never react).

The cause is arithmetic: the 0.60-unit carriageway has no room for two lanes
*and* parking. `TRAFFIC_LATERAL_BIAS = 0.177` buys mover↔mover head-on clearance
and pays for it out of the parking strip. This track flips the trade — **the
lanes narrow** (bias 0.177 → **0.136**, derived as 0.2982 − 0.1618 = 0.1364,
rounded down) so a mover's footprint never reaches past the parked-cars strip.
The cost — mover↔mover straight passes now interpenetrate slightly (**≈0.015**
between the authored pair, **≈0.052** widest-vs-widest) — is accepted because
movers already "squash past each other as comedy", are silent, crashable and
non-blocking. One constant, its derivation comment, the pinned clearance
contracts, and two doc lines move. No art, no bytes, no triangle change.

## Functional Requirements

- **FR1 — Lanes clear the parking strip.** `TRAFFIC_LATERAL_BIAS` re-derives as
  *(parked-cars strip near edge 0.2982) − (widest fitted half-width 0.1618) =
  0.1364*, authored **rounded down to 0.136** so rounding can never reintroduce
  a clip. Swept reach becomes 0.2978 — 0.0004 inside the strip's near edge. The
  derivation comment in `trafficBrain.ts` is rewritten to the new arithmetic.
- **FR2 — Amended pass contract, pinned and honest.** The old contract ("any
  two movers clear each other… never overlap") is superseded: straight passes
  between movers may interpenetrate by `half-width A + half-width B − 2 × bias`
  (≈0.015 for the authored sedan↔hatchback pair; ≈0.052 widest-vs-widest). Tests
  pin this band explicitly, and the figures are measured from the real
  footprints in the plan, not taken from this spec's estimates.
- **FR3 — Kerb-kiss language superseded.** `TRAFFIC_KERB_SLACK`'s contract
  ("wheels kiss the kerb strip, never the kerb top") described the very overlap
  being fixed. It is replaced by the single clearance contract: *no mover
  footprint point reaches past 0.2982 from the centre line toward parking*
  (named epsilon 0.0005). The plan does the minimal edit — re-derive the
  constant's meaning or retire it.
- **FR4 — Every tile and leg, not just straights.** The characterization
  samples straights **and** curves (tangent-following bias included) across the
  whole figure-eight, including the tightest kerb, exactly as the `parkedCars`
  suite measures.
- **FR5 — Nothing else moves.** Brain routing, seeds, speeds, the dynamic
  obstacle feed, tap invisibility, silence, blob shadows, missions, HUD,
  precache — untouched.

## Non-Functional Requirements

- **NFR1 — Pillars:** zero text, zero failure, pure agency, offline-first. The
  kid's routes, taps and errands are unaffected by the lane positions.
- **NFR2 — TDD scope:** bias derivation and both clearance contracts are
  logic-bearing → red-first characterization tests; ≥80% coverage on touched
  logic (`trafficBrain.ts` holds or improves its current band). The visual read
  ("comedy, not collision") is manual-verify per `workflow.md`'s exemption.
- **NFR3 — Zero cost elsewhere:** no model, mesh or fit change ⇒ no
  triangle/draw change; the measured spawn-window line stands as recorded. Zero
  new precache entries.
- **NFR4 — Honesty in the ledger:** `tech-stack.md`'s known-cosmetic entry is
  rewritten to record the fixed clip and the newly accepted head-on overlap
  figures — the trade is documented, not buried.

## Acceptance Criteria

- **AC1 (red first):** sampling every road tile/pose on every leg (straights +
  curves), no mover footprint point lies past **0.2982** from the centre line
  toward the parking strip (epsilon 0.0005) — fails today at 0.3388 by 0.041.
- **AC2 (red first):** head-on and overtake gaps between the two mover
  footprints assert the *accepted* overlap band from measured half-widths; test
  names state the trade.
- **AC3:** `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; >80%
  coverage on touched logic.
- **AC4 — Desktop browser pass:** a mover threads the tightest kerb past parked
  cars with no clip; the pair passes head-on and reads as squash comedy, not
  collision; missions and taps unaffected; works offline.
- **AC5:** `trafficBrain.ts` derivation comment and `tech-stack.md` (derivation +
  known-cosmetic entry → recorded trade) updated.

## Design Decisions (locked with the planner)

| Decision | Chosen | Why, and what it cost |
| --- | --- | --- |
| Fix lever | Narrow the lanes: bias 0.177 → 0.136 | One constant fixes every same-side pass at once; parking placement and mover art stay untouched. Cost: the accepted mover↔mover overlap in FR2. |
| Trade direction | More accepted squash (mover↔mover) to remove an unaccepted clip (mover↔parked) | Mover↔mover squash already exists at junctions and is on-voice comedy; a mover clipping a *stationary* parked car reads as a bug. |
| Rounding | Round down to 0.136 (exact would be 0.1364) | Rounding must never reintroduce the clip; 0.0004 margin is enough because the contract is measured with a 0.0005 epsilon. |
| Verification gate | TDD characterization + desktop pass | Pure geometry — the tests *are* the defect. iPad sitting reserved for tracks that change art or feel (per the planner's decision). |
| Scope | Constant + contracts + two doc lines | Surgical: the smallest change that removes the only unaccepted interpenetration in town. |

## Out of Scope

- Moving parked cars outward, re-deriving the parking strip, or changing kerb
  eligibility (rejected levers).
- Shrinking the movers, changing models/fits, or using lower-detail karts.
- Any behaviour change: routing, seeds, speeds, obstacle feed, tap semantics,
  audio, shadows.
- Spawn-window budget trim (a separate candidate track).
- iPad device pass (no art/feel change; revisit only if the fix later grows
  visual changes).

## Flagged Assumptions

- Figures (0.3388 / 0.2982 / 0.041 / half-width 0.1618) come from
  `tech-stack.md`'s measured geometry; the plan **re-derives them from the fit
  data** before changing the constant, and measures both movers' real
  half-widths — the ≈0.015 / ≈0.052 overlaps are estimates (the 0.0668
  sedan↔hatchback gap in the current comment implies hatch half-width ≈0.1254).
- **Curve sweep:** if the tightest leg's tangent-following sweep carries
  footprint corners past 0.2982 even at bias 0.136, the derivation absorbs the
  measured overshoot (0.2982 − half-width − overshoot) and the head-on overlap
  grows accordingly. If that overshoot pushes the mover↔mover overlap beyond
  ≈0.1 (reads as interpenetration, not squash), the plan **stops and brings the
  user the numbers** before choosing the parking-outward fallback.
- `TRAFFIC_KERB_SLACK` (0.04) is retired or re-scoped at the plan's discretion —
  minimal edit wins.
