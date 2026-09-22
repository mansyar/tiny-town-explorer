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

1. **A parked car cannot park on the asphalt, and the kerb band is narrow.**
   `road-straight`'s driving surface is a 0.60-wide band centred on the tile,
   while the player's capsule is 0.52 wide — 0.04 of slack per side. A parked
   car's inner edge must therefore stay at least 0.26 from the street's centre
   line, and its outer edge must clear the house wall. That wall is **not** a
   fixed distance: the lot centre is 1.00 from the centre line, so the wall sits
   at `1.00 − fitted depth ÷ 2`, and every house fits differently. Measured from
   the committed kit extents and the renderer's 0.86 cap, the walls run from
   **0.574** (house-8, type-r) to **0.748** (house-4, type-d). Two kerbs cannot
   host a parked car at any offset, one of the roomiest belongs to the puppy,
   and the rest leave a feasible band only if the cars are fitted smaller than
   first planned — hence FR2's ≈0.55. The band is also shared with every mission
   item placed at a kerb: litter's kerbside pieces sit at exactly **0.65** from
   the ring road's centre line and the puppy's two lot spots at **0.52**, so the
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
  of **≈0.55**. The constant comes from the measured walls, not from taste: at
  0.55 the widest model (the sedan, width/length 0.588) has a half-width of
  0.162, so a car needs a wall at **≥0.652** — which every kerb but the two
  impossible ones provides. At the 0.65 first planned, the same sedan needed a
  wall of 0.672 and only four kerbs in town qualified. The cost is visible: at
  0.55 a parked car is ~64% of the player's own 0.86-length car, so it reads as
  a smaller car of the same family rather than a same-size one. The plan
  measures each fitted model rather than trusting the kit's extents.
- **FR3 — Placement geometry.** Each car is parked **parallel to the kerb,
  spanning the kerb strip and the lawn edge** outside its house: offset ≈0.46
  from the street's centre line, which puts its inner edge 0.298 clear of the
  lane and its outer edge 0.622, inside the tightest eligible wall of 0.657.
  Kerb eligibility is therefore a real rule, not a formality: a kerb qualifies
  only if its wall is ≥0.652 — measured, per house, from the art. Three further
  constraints fall out and must be asserted, not trusted:
  - **Straight segments only.** A 0.65-long box cannot sit parallel on a 1.00
    tile whose kerb is curved, so no car may occupy a kerb alongside a bend,
    junction or end tile — only alongside `straight` road tiles.
  - **Seating at the kerb top.** The footprint crosses lawn (0.00), kerb top
    (+0.02) and asphalt (+0.01), so the ground seat this spec originally assumed
    would sink the wheels 0.02 into the kerb. Parked cars seat at the **kerb top
    (+0.02)**, which floats them 0.02 over the lawn — below visual notice.
  - **Walls are measured, never assumed.** The wall each car must clear is
    `1.00 − fitted depth ÷ 2` for the house on that lot, so eligibility is
    checked against the house's own fitted depth (kit extents + the renderer's
    0.86 cap) and, at runtime, against the footprint the renderer publishes.
    Collision.ts's square cap fallback is too pessimistic for this: it would
    wall every lot at 0.57 and rule out every kerb.
- **FR4 — Lane-clearance contract.** The contract is asserted against the
  mounted art and the paths the game actually drives, not just a geometric
  line: no parked-car footprint may overlap a house's fitted footprint, and no
  centre-line drive may touch one.
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
  origin, a real shadow lands `(−1.2, −0.9) × height` from its object — toward
  negative x and z, i.e. *away* from the sun, which is the sign that matters: a
  blob offset the other way would point into the light and contradict every
  house's shadow beside it. For the measured fitted heights (0.21 to 0.28 — the
  original 0.33 here was pre-fit) that is **≈(0.34, 0.25)** for the sedan, about
  a third of a tile. A blob sitting directly *under* the car would contradict
  every house's real shadow and read as a hole, so blobs are **offset and
  stretched along the sun direction**, each drawn as the box around its
  footprint and that footprint's sun-shifted copy. All six are merged into **one
  static mesh** (one draw call, 12 triangles, not six draw calls), sit just
  above the FR3 seat height so they cross the lawn, kerb and asphalt without
  z-fighting, and take no part in collision or taps. The sun's position is
  exported from `scene.ts` and the offset derived from it, so the fake shadow
  cannot drift away from the light that shades the houses.
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
  records the deltas and the budget note; the device fps pass remains the real
  gate.

  **Measured after implementation** (GL draws counted per frame on the running
  game, the method the recorded baseline used; cars removed from the map for the
  control run): no cars **138 draws / 38,310 triangles**, cars as first shipped
  **245 / 59,768**, cars with blobs only **171 / 51,130**. So the estimate above
  was right on triangles (**+12,820** vs the predicted +12,808 — 12 triangles of
  rounding, all of it the blob) and right on draws (**+33** vs a predicted +32),
  and wrong about one thing it assumed rather than tested: the cars *were* in the
  shadow pass, because the model library sets `castShadow` on every mesh it
  prepares and no placement could opt out. That is the 245 → 171 drop.
  Baseline drift: the no-car scene now measures 138/38,310 against the 133/37,802
  recorded before this track — the park track's trees, dumpster and props since.
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
| Placement | Kerb-and-lawn straddle at offset ≈0.46, walls ≥0.652 only | Measured: the 0.60 asphalt band against a 0.52-wide player capsule leaves nothing to park on, and the house walls sit between 0.574 and 0.748 from the centre line depending on the model fitted. Straddling the kerb is what parallel parking looks like from a near-top-down camera. |
| Fit | ~0.55 long, smaller than the player's 0.86 | Derived from the measured walls: at 0.55 every kerb with a wall ≥0.652 works, where 0.65 left only four kerbs in town (and the roomiest is the puppy's). Cost: parked cars are ~64% of the player's car length, visibly a smaller car rather than a same-size one. |
| Obstacle | Axis-aligned box from the mounted footprint | A circle covering the length would protrude into the lane. Boxes already exist for houses — this adds a non-solid one, and diagonal yaws are rejected by test. |
| Seat height | Kerb top (+0.02) | The footprint crosses three surface heights; seating at ground would bury the wheels 0.02 in the kerb. |
| Kerb conflict | Reservation: cars declare, missions skip | The band is shared with litter (0.65) and the pup's spots (0.52) by construction, so one side must yield. The missions' fixed items are declared and the dynamic litter draw filters — keeping 6 spread-out cars instead of surrendering every ring kerb to the missions. Cost: this track touches `parkLitter` and `puppySpots` and must re-verify the puppy's spots. |
| Tap snap | Excluded | Snapping would send the player to a point inside the car, where the bump-once-then-drive-past rule walks it through the parked car's body. |
| Shadows | Sun-aligned blobs, merged into one mesh | Halves the biggest new content class (~12.8k vs ~25.6k tris/frame) and keeps its draw cost to +1 instead of +6. The sun's (1.2, 0.9) offset is what makes an un-offset blob read as a hole — and it points toward negative x and z, away from the sun. The one thing this decision assumed and did not check was that the cars were already out of the shadow pass; measured, they were not, which is what `ModelPlacement.castsShadow` fixes. |
| Budget | ~50k heuristic → **51,130 measured, ~1.1k over** | The 50k figure was a heuristic start, and the real delta is the +12,820 of the six cars, not the ~600 written here before anything was measured. Over the line for the first time in this project, so `tech-stack.md` states it plainly with the levers (four cars, or lower-detail karts) instead of calling 51.1k "inside ~50k". The device pass stays the gate on fps; the draw-call rise is judged there too. |
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

- The 0.55 fit and the ≈0.46 kerbside offset are measured starting points; the
  tests hold the contract (lane clearance, wall clearance, spawn clearance,
  non-overlap, reservation) rather than the constants.
- The measured walls above come from the kit extents and the renderer's fit
  math, computed by hand for this revision. Deriving them in the pure layer
  needs each house's model identity, which today is chosen by index in
  `townLayout` — the plan's Phase 1 task covers making that derivable so the
  eligibility rule can be tested rather than trusted.
- The reservation's shape (a declared edge list consulted by the missions) is the
  spec's requirement; the plan picks the module that owns it and how the filter
  reads, without changing litter's seeded character.
- Dropping to four cars remains a one-line change to FR1 if the documented budget
  note is not wanted.
