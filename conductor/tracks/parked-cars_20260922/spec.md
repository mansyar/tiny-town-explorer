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

**Revised before implementation (2026-09-22), after measuring the design against
the shipped code.** Two findings reshaped this spec rather than being noted as
caveats:

1. **A parked car cannot park on the asphalt.** `road-straight`'s driving
   surface is a 0.60-wide band centred on the tile, while the player's capsule
   is 0.52 wide — 0.04 of slack per side. A parked car therefore occupies the
   **0.32–0.70 band** measured from the street's centre line: it cannot come
   inward of 0.26 (the player's own radius) or outward of ~0.70 (the house wall
   sits at 0.93). That band is the same band the missions already use for every
   kerb-placed item — litter's kerbside pieces sit at exactly **0.65** from the
   ring road's centre line and the puppy's two lot spots at **0.52** — so the
   conflict is structural, and this track grows a **kerb reservation** (FR8)
   that touches `parkLitter` and `puppySpots`.
2. **Every mounted mesh casts a shadow, so the shadow pass doubles a car's
   cost.** Six Car Kit cars would have cost ~25,600 triangles/frame against a
   ~12,200 headroom. Parked cars therefore stay out of the shadow pass and carry
   **sun-aligned blob shadows merged into one mesh** (FR7), which is what keeps
   this track affordable — and the draw-call cost that remains is now measured
   rather than estimated (NFR2).

## Functional Requirements

- **FR1 — Six cars, four models.** Six parked cars from four Car Kit models
  (sedan, hatchback-sports, van, suv), each authored in `townMap.ts` —
  deterministic, no RNG, one row per instance.
- **FR2 — Fit.** Car Kit art is authored ~4× town scale, so each model is fitted
  at mount time with the existing `fitWithin` cap to a longest horizontal extent
  of **≈0.65** — deliberately smaller than the player's own 0.86 fit, which is
  what keeps the lane clearance of FR4 a real margin rather than a shave. The
  plan measures each fitted model rather than trusting the kit's extents.
- **FR3 — Placement geometry.** Each car is parked **parallel to the kerb, in
  the 0.32–0.70 band, spanning the kerb strip and the lawn edge** outside its
  house. Two authoring constraints fall out of that band and must be asserted,
  not trusted:
  - **Straight segments only.** A 0.65-long box cannot sit parallel on a 1.00
    tile whose kerb is curved, so no car may occupy a kerb alongside a bend,
    junction or end tile — only alongside `straight` road tiles.
  - **Seating at the kerb top.** The footprint crosses lawn (0.00), kerb top
    (+0.02) and asphalt (+0.01), so the ground seat this spec originally assumed
    would sink the wheels 0.02 into the kerb. Parked cars seat at the **kerb top
    (+0.02)**, which floats them 0.02 over the lawn — below visual notice.
- **FR4 — Lane-clearance contract.** The contract is asserted against the
  paths the game actually drives, not just a geometric line:
  - a drive along every street's centre line never impacts a parked car;
  - **no parked car overlaps a spawn capsule** — all four authored spawn points
    are road-tile centres only 0.51 from the band, i.e. 0.06 of clearance;
  - **a leg that ends beside a parked car still completes**: a bonk never
    strands a route, including the grass-finishing leg into a mission target.
- **FR5 — Crashable, never solid.** Parked cars are crashable obstacles: the car
  squishes, bonks, honks and auto-resumes, and no leg is ever abandoned. Their
  hitbox is a **box derived from the mounted footprint** rather than a circle —
  a circle wide enough to cover a 0.65-long car would intrude into the lane and
  bonk a centre-line drive. Two consequences:
  - **Axis-aligned yaws only.** `collision.ts`'s box shape is axis-aligned and
    the streets run north–south and east–west, so a yaw of 0/90/180/270° swaps
    the half extents correctly. A diagonal placement must fail loudly in a test
    rather than silently mis-size its hitbox.
  - **Crashability preserves the puppy's contract.** `puppySpots.isScoopable`
    samples only buildings when deciding whether a pup can be reached; because
    parked cars are crashable rather than solid, a car parked beside a hiding
    spot can never make that spot unreachable. Solid hitboxes would break an
    invariant this project already tests, which is a second reason for FR5.
- **FR6 — No tap snap, no tap behaviour.** A tap on or near a parked car
  resolves to the ground point under the finger, exactly as an empty-street tap
  does: parked cars are excluded from the router's 0.45 prop snap, so the player
  never targets a point inside a car. They give no toot, no bob and no mission
  answer.
- **FR7 — Blob shadow, sun-aligned, one draw call.** Parked cars do **not** join
  the shadow-map pass. Each carries a flat dark ground quad sized to its
  footprint, and because the sun sits at (12, 10, 9) with its target at the
  origin, a real shadow lands `(1.2, 0.9) × height` away from its object —
  **≈(0.40, 0.30)** for a 0.33-tall car, a third of a tile. A blob sitting
  directly *under* the car would contradict every house's real shadow and read
  as a hole, so blobs are **offset and stretched along the sun direction**. All
  six are merged into **one static mesh** (one draw call, 12 triangles, not six
  draw calls), sit just above the FR3 seat height so they cross the lawn, kerb
  and asphalt without z-fighting, and take no part in collision or taps.
- **FR8 — Kerb reservation across the missions.** One shared source of truth
  records which kerb edges the town has spoken for, and both directions are
  enforced:
  - **The missions' fixed kerb items are declared**: the park mission's two
    fixed north-edge slots (0.65 from the north ring road's centre line, over
    park tiles (1,1) and (2,1)) and the puppy's two authored lot spots
    (`spot-garden` on lot (2,3)'s cross-street kerb, `spot-verge` on lot (1,4)'s
    ring-road kerb). Parked cars may not occupy those kerbs.
  - **The dynamic placer yields to the cars**: `spawnParkLitter`'s seeded
    kerbside draw must skip any kerb a parked car occupies, filtering its
    candidate lots before drawing three. The pool must stay large enough that
    the draw is still meaningful and still varies by seed.
  - **One invariant, town-wide**: no mission item is ever placed inside a
    parked car. Asserted against the shipped map for every mission, across many
    seeds for the seeded draws.
- **FR9 — Mount path hygiene.** The `fitWithin` cap currently doubles as "this
  is a house" (it publishes a footprint into the renderer's house map). Parked
  cars take the cap without being republished as buildings, and they take a
  per-instance yaw the way park trees already do.
- **FR10 — Precache.** Four new GLBs join the build: sedan 180.2 KiB,
  hatchback-sports 205.2, van 183.6, suv 214.7 — **~784 KiB** and 44 → 48
  precache entries, measured in the build and recorded in `tech-stack.md`. No
  new texture: all four models carry a single material reading the one shared
  `car-kit/colormap` image the fleet already loads.

## Non-Functional Requirements

- **NFR1 — Pillars:** zero text, zero failure, pure agency, offline-first. A
  parked car never blocks, punishes, or claims a tap; nothing about the town
  becomes interactive that wasn't before.
- **NFR2 — Performance, measured (all numbers from `pnpm assets:measure` and the
  built scene, not estimates).** Each Car Kit car is **5 primitives (suv 6),
  1 material, 1 shared image**, so six cars add **+31 draw calls** and, with the
  merged blob mesh, **+32 total** against today's 133 (133 → ~165, +24%) — the
  metric `docs/playtest.md` records as the last crash hotspot, so it is reported
  and judged on the device, not waved through. Triangles: parked cars leave the
  shadow pass, so six cars cost **+12,796** single-pass (not ~25,600) plus 12
  blob triangles — **~+12,808 → ~50.6k** shadow-inclusive. `tech-stack.md`
  records the deltas and notes the budget as **~52k** (from ~50k) with the
  reason; the device fps pass remains the real gate.
- **NFR3 — No simulation cost:** parked cars are static scene content — no
  per-frame tick, no update in the render loop.
- **NFR4 — TDD scope:** placement and clearance rules, hitbox derivation and
  orientation, the snap exclusion, the kerb reservation and the invariant are
  logic-bearing → red-first tests, >80% coverage. Scene mounting, the blob
  material and the art fit are manual-verify per `workflow.md`'s exemption.
- **NFR5 — Assets:** no new pack, no new texture, no audio, no Blender step.
  Leaving the shadow pass is a deliberate, documented rendering choice.
- **NFR6 — Determinism:** hand-authored placement only; the reservation shrinks
  litter's candidate pool but keeps its draw seeded and reproducible, so a given
  session stays identical and nothing is persisted.
- **NFR7 — No mission rule changes:** the reservation moves *where* kerb items
  may be placed, never how a mission plays — pacing, gates, pickups, markers and
  celebrations are untouched.

## Acceptance Criteria

- **AC1:** Six parked cars stand along the streets — four distinct Car Kit
  models, parallel to the kerb on straight segments only, seated on the kerb top,
  overlapping neither a house, a prop, another car, nor a spawn capsule.
- **AC2:** A centre-line drive along every street never bonks a parked car, and
  a leg ending beside one still completes.
- **AC3:** Driving into a parked car squishes, bonks, honks and resumes; it never
  stops the car, never abandons a leg, and never makes a puppy spot unreachable.
- **AC4:** A tap on a parked car drives to the finger's ground point with no
  snap, and the car itself never reacts.
- **AC5:** Parked cars are absent from the shadow-map pass; their blobs are
  sun-aligned, merged into one mesh, grounded without z-fighting, and read as
  the same family of shadows as the houses'.
- **AC6:** Kerb reservation holds both ways — no parked car sits on a kerb the
  missions use, no mission item is placed inside a parked car across many seeds,
  and litter still varies its kerbside lots by seed.
- **AC7:** All four missions complete untouched on the shipped map (pacing,
  gates, pickups, markers, celebrations unchanged).
- **AC8:** `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; >80%
  coverage on the logic touched.
- **AC9:** Triangles/frame, draw calls and precache entries/KiB measured and
  recorded in `tech-stack.md` with the budget note.
- **AC10:** iPad pass — cars read as parked cars at play distance, blobs read as
  shadows, missions unaffected, fps unchanged from the pre-track figure within
  noise, all four GLBs present offline.

## Design Decisions (locked with the planner)

| Decision | Chosen | Why, and what it cost |
| --- | --- | --- |
| Hitbox | Crashable, bonk-and-resume | Zero-failure pillar; reuses the prop collision path. Solid would abandon legs mid-street *and* break `puppySpots.isScoopable`'s assumption that only buildings block a pup. |
| Placement | The 0.32–0.70 kerb-and-lawn band | Measured: 0.60 asphalt band against a 0.52-wide player capsule leaves nothing to park on. Straddling the kerb is what parallel parking looks like from a near-top-down camera. |
| Fit | ~0.65 long, smaller than the player's 0.86 | Turns lane clearance into a real margin instead of a shave. Cost: parked cars are visibly a size smaller than the fleet. |
| Obstacle | Axis-aligned box from the mounted footprint | A circle covering the length would protrude into the lane. Boxes already exist for houses — this adds a non-solid one, and diagonal yaws are rejected by test. |
| Seat height | Kerb top (+0.02) | The footprint crosses three surface heights; seating at ground would bury the wheels 0.02 in the kerb. |
| Kerb conflict | Reservation: cars declare, missions skip | The band is shared with litter (0.65) and the pup's spots (0.52) by construction, so one side must yield. The missions' fixed items are declared and the dynamic litter draw filters — keeping 6 spread-out cars instead of surrendering every ring kerb to the missions. Cost: this track touches `parkLitter` and `puppySpots` and must re-verify the puppy's spots. |
| Tap snap | Excluded | Snapping would send the player to a point inside the car, where the bump-once-then-drive-past rule walks it through the parked car's body. |
| Shadows | Sun-aligned blobs, merged into one mesh | Halves the biggest new content class (~12.8k vs ~25.6k tris/frame) and keeps its draw cost to +1 instead of +6. The sun's (1.2, 0.9) offset is what makes an un-offset blob read as a hole. |
| Budget | ~50k → ~52k, documented | The 50k figure was a heuristic start; the measured delta is ~600 tris, and the device pass stays the gate. Draw calls, the riskier number, are reported and judged on device. |
| Art | Car Kit, four models | Already vendored, matches the fleet, fit path exists, one shared texture. Cost: ~784 KiB of precache and four registry entries. |
| Placement data | Authored in `townMap.ts` | Keeps the town deterministic and offline-identical, and the layout testable as data. |
| Wandering traffic | Out of scope | Stays its own roadmap step; parked-car data stays separable so a traffic track isn't boxed in later. |

## Out of Scope

- Any moving or AI traffic, animations, headlights, or parked cars reacting to
  anything.
- Driveways, parking bays, kerb markings, a verge outside the map edge, or any
  reshaping of the town's tiles.
- Changing any mission *rule* — pacing, gates, pickups, markers, celebrations —
  or the missions' fixed park slots; only where kerb items may be placed moves.
- Parked cars on the park tiles themselves or inside a house footprint.
- New Car Kit models beyond the four, new textures, new audio, Blender work.
- Persistence, and any change to tap semantics beyond the snap exclusion.

## Flagged Assumptions

- The 0.65 fit and the ~0.51 kerbside offset remain measured starting points; the
  tests hold the contract (lane clearance, spawn clearance, non-overlap,
  reservation) rather than the constants.
- The reservation's shape (a declared edge list consulted by the missions) is the
  spec's requirement; the plan picks the module that owns it and how the filter
  reads, without changing litter's seeded character.
- Dropping to four cars remains a one-line change to FR1 if the documented budget
  note is not wanted.
