# Plan: Static Parked Cars Around Town

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.
>
> Revised before implementation (2026-09-22) after measuring the design against
> the shipped code: the 0.32–0.70 kerb band is shared with `parkLitter` and
> `puppySpots` by construction, so Phase 3 adds a **kerb reservation**; and the
> shadow pass doubles every mounted mesh, so Phase 4's blob shadow must be
> sun-aligned and merged to one draw call.
>
> Deliberate sequencing: Phase 1 keeps the *contract* in tests (clearance,
> spawn clearance, non-overlap) and treats the constants as data the later
> phases may adjust; Phase 3's invariant is the cross-cutting guard, so it is
> written after both the cars (Phase 1) and their hitboxes (Phase 2) exist.

## Phase 1 – Parking data and placement rules (TDD)

- [ ] Task: Parked-car kinds + authored map instances (FR1, FR9)
  - [ ] Write failing tests for the data contract: the map authors six parked cars across four models; each instance carries a model, a kerb offset and a yaw; the grid publishes the fitted footprint (half extents + yaw) alongside position; existing prop kinds keep their current shape and defaults
  - [ ] Implement the parked-car prop kinds and the authored `townMap.ts` rows (offset from the kerb, yaw parallel to the street), plus the grid's publication of model/footprint
  - [ ] Refactor + coverage (target >80% on the touched logic)
- [ ] Task: Kerbside placement and clearance contracts (FR2, FR3, FR4)
  - [ ] Write failing tests: every parked car sits alongside a `straight` road tile (never a bend, junction or end kerb); each seats on the kerb top (+0.02); for every street tile a centre-line drive never impacts a parked car; no parked car overlaps a house footprint, a building's capped footprint, another parked car, an existing prop, or any of the four authored spawn capsules; the fit never scales a model up
  - [ ] Implement the placement rule — offset derived from the fitted footprint, orientation from the street axis, straight-segment validation — and tune the authored offsets until every contract holds
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 – Collision and tap rules (TDD)

- [ ] Task: Axis-aligned non-solid box hitboxes (FR5)
  - [ ] Write failing tests: a parked car publishes a non-solid box whose half extents follow the mounted footprint; a 90/180/270° yaw swaps the extents correctly and a diagonal yaw fails loudly rather than mis-sizing a hitbox; a swept contact reports a crashable impact and never `solid`; a car driven into one bonks and resumes with the route cursor still advancing; a regression guard showing the equivalent covering circle would fail the centre-line case
  - [ ] Implement the prop→box obstacle mapping (box shape, `solid: false`) and keep the existing circle mapping for every other prop
  - [ ] Refactor + coverage
- [ ] Task: Tap-snap exclusion (FR6)
  - [ ] Write failing tests: a tap inside the prop snap radius of a parked car keeps the finger's ground point and reports no `propId`; taps near cones and poles still snap; the dead-zone honk and newest-wins are unchanged; a parked car never becomes a drive target or a mission target
  - [ ] Implement the snap-target flag on prop data and its use in the router
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 – Kerb reservation across the missions (TDD)

- [ ] Task: Reservation source + the missions' declared kerbs (FR8)
  - [ ] Write failing tests: the reservation lists every kerb the missions already use — the park mission's two fixed north-edge slots and the puppy's two authored lot spots — derived from their own data rather than hand-copied; a parked car on a reserved kerb is rejected; the shipped authoring passes the check
  - [ ] Implement the reservation data and query, and assert the parked-car authoring against it
  - [ ] Refactor + coverage
- [ ] Task: Litter's kerbside draw yields to the cars (FR8)
  - [ ] Write failing tests: `spawnParkLitter`'s candidate lots exclude any reserved kerb; it still draws exactly three pieces; the pool stays large enough for the draw to vary by seed and stay reproducible for a given seed; no kerbside piece ever lands inside a parked-car footprint across many seeds
  - [ ] Implement the candidate filter in `spawnParkLitter`, leaving pacing, pickups and celebrations untouched
  - [ ] Refactor + coverage
- [ ] Task: The town-wide invariant (FR8)
  - [ ] Write the cross-cutting suite that walks the shipped map and every mission's placement — park litter across many seeds, the puppy's four spots, the fire pacer's houses, the ice-cream order marker, the park props — asserting that none falls inside a parked-car footprint or the reserved band, and that a puppy spot is still scoopable with the cars present
  - [ ] Fix any violation by adjusting the authored cars (never a mission rule)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Registry, fit and blob shadow (manual-verify, exempt from TDD)

- [ ] Task: Registry entries + mount fit (FR2, FR3, FR9, FR10)
  - [ ] Add the four Car Kit models (sedan, hatchback-sports, van, suv) to the registry, mount them with the `fitWithin` cap, per-instance yaw and the kerb-top seat, and keep them out of the house-footprint map; measure each fitted model with `pnpm assets:measure` and the precache delta, recording the manual steps and the numbers
- [ ] Task: Sun-aligned merged blob shadow (FR7)
  - [ ] Build the six blobs as one static mesh — each sized to its footprint and offset/stretched along the sun's (1.2, 0.9) × height direction, seated just above the kerb top with no z-fighting — absent from the shadow-map pass, collision and taps; confirm on screen that they read as the same shadow family as the houses — record the manual steps
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 – Wiring and verification (mixed)

- [ ] Task: Scene and obstacle wiring (FR5, FR7, FR9)
  - [ ] Wire parked cars and their blob mesh into the mounted town and the obstacle set, then manual-verify: bonk one head-on, graze one, drive the centre line past every car, and drive every street in the town
- [ ] Task: Full gates + measurements + docs (NFR2, AC8, AC9)
  - [ ] Run `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` and coverage; measure triangles/frame, draw calls (expected +32, 133 → ~165) and precache entries/KiB in the build; record the deltas in `tech-stack.md` including the ~52k budget note, the draw-call rise and the shadow decision, and update `product.md`'s deferred list and roadmap
- [ ] Task: Device pass (AC1–AC7, AC10)
  - [ ] Desktop drive of all four missions with parked cars present, then the iPad sitting: legibility at play distance, blobs reading as shadows, muted and unmuted, fps re-judged, the four GLBs confirmed offline; record results in `docs/playtest.md`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
