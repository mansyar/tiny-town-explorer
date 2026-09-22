# Spec: Static Parked Cars Around Town

## Overview

product.md defers "AI traffic or wandering cars (static parked cars also
deferred)" from v1, and the roadmap's first liveliness step is **static parked
cars, then light wandering traffic**. This track ships step 1 only.

Six parked cars stand along the town's streets, drawn from the already-vendored
Car Kit family. They mount as ordinary town props, so they inherit collision,
tap resolution, the render path and precache warming; they bonk harmlessly like
cones and poles, never block a route, and never answer a tap themselves. The
town stays hand-authored and identical every session. Nothing moves: wandering
traffic remains its own future track.

## Functional Requirements

- **FR1 — Six cars, four models.** Six parked cars from four Car Kit models
  (sedan, hatchback-sports, van, suv), each authored in `townMap.ts` —
  deterministic, no RNG, one row per instance.
- **FR2 — Fit.** Car Kit art is authored ~4× town scale, so each model is fitted
  at mount time with the existing `fitWithin` cap to a longest horizontal extent
  of **≈0.65** — deliberately smaller than the player's own 0.86 fit, which is
  what buys the lane clearance FR4 asserts. The plan measures each fitted model
  rather than trusting the kit's extents.
- **FR3 — Placement geometry.** Each car is parked **parallel to the kerb, just
  outside the asphalt band**, spanning the kerb strip and the lawn edge outside
  its house. Measured reason: `road-straight`'s asphalt is a 0.60-wide band
  centred on the tile while the player's capsule is 0.52 wide, so a car cannot
  park on the asphalt at all; a full-size car parked off the asphalt leaves
  ~0.01 of clearance where the smaller fit leaves ≥0.05. Starting offsets: ~0.51
  from the street centre line, tuned at mount time against the tests.
- **FR4 — Lane-clearance contract.** A drive along any street's centre line
  never impacts a parked car. The tests fix this contract; the offsets are free
  to move as long as it holds.
- **FR5 — Crashable, never solid.** Parked cars are crashable obstacles: the car
  squishes, bonks, honks and auto-resumes, and no leg is ever abandoned. Their
  hitbox is a **box derived from the mounted footprint** (swapped by yaw,
  `solid: false`) rather than a circle — a circle wide enough to cover a
  0.65-long car would intrude into the lane and bonk a centre-line drive.
- **FR6 — No tap snap, no tap behaviour.** A tap on or near a parked car
  resolves to the ground point under the finger, exactly as an empty-street tap
  does: parked cars are excluded from the router's 0.45 prop snap, so the player
  never targets a point inside a car. They give no toot, no bob and no mission
  answer.
- **FR7 — Blob shadow.** Parked cars do **not** join the shadow-map pass. Each
  carries a flat dark ground quad (2 triangles) sized to its footprint, so it
  stays visually grounded at a cost that doesn't double with the shadow pass. It
  must not z-fight the ground tiles and must not participate in collision or
  taps.
- **FR8 — Mission safety.** No parked-car footprint may overlap a mission spawn
  site at the shipped map: litter's kerbside slots, the puppy's authored hiding
  spots, the park dumpster and the fire houses' approach tiles. Verified as data
  against the missions' own placement functions.
- **FR9 — Mount path hygiene.** The `fitWithin` cap currently doubles as "this
  is a house" (it publishes a footprint into the renderer's house map). Parked
  cars take the cap without being republished as buildings, and they take a
  per-instance yaw the way park trees already do.
- **FR10 — Precache.** Four new GLBs join the build: sedan 180.2 KiB,
  hatchback-sports 205.2, van 183.6, suv 214.7 — **~784 KiB** and 44 → 48
  precache entries, measured in the build and recorded in `tech-stack.md`.

## Non-Functional Requirements

- **NFR1 — Pillars:** zero text, zero failure, pure agency, offline-first. A
  parked car never blocks, punishes, or claims a tap; nothing about the town
  becomes interactive that wasn't before.
- **NFR2 — Performance, measured:** parked cars are the largest new content
  class since launch, so the numbers are measured, not estimated. Blob shadows
  keep the delta at **~+12.8k triangles/frame → ~50.6k** shadow-inclusive, with
  ~+30 draw calls from 133. `tech-stack.md` records the delta and notes the
  budget as **~52k** (from ~50k) with the reason; the device fps pass remains
  the real gate.
- **NFR3 — No simulation cost:** parked cars are static scene content — no
  per-frame tick, no update in the render loop.
- **NFR4 — TDD scope:** placement/clearance rules, obstacle derivation, the snap
  exclusion and the mount planning are logic-bearing → red-first tests, >80%
  coverage. Scene mounting, the blob material and the art fit are manual-verify
  per `workflow.md`'s exemption.
- **NFR5 — Assets:** no new pack, no new texture, no audio, no Blender step.
  Skipping the shadow-map pass for parked cars is a deliberate, documented
  rendering choice.
- **NFR6 — Determinism:** hand-authored placement only; sessions stay identical,
  nothing persisted.

## Acceptance Criteria

- **AC1:** Six parked cars stand along the streets — four distinct Car Kit
  models, parallel to the kerb, seated on the ground, overlapping neither a
  house, a prop, nor each other.
- **AC2:** A centre-line drive along every street never bonks a parked car
  (test + device).
- **AC3:** Driving into a parked car squishes, bonks, honks and resumes; it
  never stops the car and never abandons a leg.
- **AC4:** A tap on a parked car drives to the finger's ground point with no
  snap, and the car itself never reacts.
- **AC5:** Parked cars are absent from the shadow-map pass; each blob shadow
  reads as grounded under the ortho camera with no z-fighting.
- **AC6:** All four missions still complete untouched, and no mission spawn site
  overlaps a parked-car footprint.
- **AC7:** `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; >80%
  coverage on the logic touched.
- **AC8:** Triangles/frame, draw calls and precache entries/KiB measured and
  recorded in `tech-stack.md` with the budget note.
- **AC9:** iPad pass — cars read as parked cars at play distance, missions
  unaffected, fps unchanged from the pre-track figure within noise, and all four
  GLBs present offline.

## Design Decisions (locked with the planner)

| Decision | Chosen | Why, and what it cost |
| --- | --- | --- |
| Hitbox | Crashable, bonk-and-resume | Zero-failure pillar; reuses the prop collision path. Solid would abandon legs mid-street — exactly what the success criteria measure as frustration. |
| Placement | At the kerb, straddling kerb strip + lawn edge | The measured 0.60 asphalt band against the 0.52 player capsule leaves ±0.04 of slack, so nothing parks on the asphalt. Straddling the kerb is what parallel parking looks like from a near-top-down camera. |
| Fit | ~0.65 long, smaller than the player's 0.86 | Turns lane clearance into a real margin instead of a shave; keeps them reading as parked, not driving. Cost: parked cars are visibly a size smaller than the fleet. |
| Obstacle | Box from the mounted footprint | A circle covering the length would protrude into the lane. Boxes already exist in `collision.ts` for houses — this adds a non-solid one. |
| Tap snap | Excluded | Snapping would send the player to a point inside the car, where the bump-once-then-drive-past rule walks it through the parked car's body. |
| Shadows | Blob quad, not the shadow pass | Halves the cost of the biggest new content class (~12.8k vs ~25.6k tris/frame) — the single decision that keeps this track near the budget. |
| Budget | ~50k → ~52k, documented | The 50k figure was a heuristic start; the delta is ~600 tris and the device pass stays the gate. Documented per `workflow.md`, before implementation. |
| Art | Car Kit, four models | Already vendored, matches the fleet, fit path exists. Cost: ~784 KiB of precache and four registry entries. |
| Placement data | Authored in `townMap.ts` | Keeps the town deterministic and offline-identical, and keeps the layout testable as data. |
| Wandering traffic | Out of scope | Stays its own roadmap step; parked-car data stays separable so a traffic track isn't boxed in later. |

## Out of Scope

- Any moving or AI traffic, animations, headlights, or parked cars reacting to
  anything.
- Driveways, parking bays, kerb markings, or any reshaping of the town map's
  tiles.
- Parked cars on the park tiles or at mission sites.
- New Car Kit models beyond the four, new textures, new audio, Blender work.
- Persistence, and any change to tap semantics beyond the snap exclusion.

## Flagged Assumptions

- The 0.65 fit and ~0.51 kerbside offset are measured starting points — the plan
  measures the fitted models and tunes both, while the tests hold the contract
  (centre-line clearance, no overlaps) rather than the constants.
- Dropping to four cars is a one-line change to FR1 if the documented budget
  note is not wanted.
