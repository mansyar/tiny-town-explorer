# Plan: Static Parked Cars Around Town

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.
>
> Deliberate sequencing note: Phase 2's mission-clearing tests depend on Phase
> 1's authored instances existing, and Phase 3's fit measurements can move the
> offsets Phase 1 tuned — so the plan keeps the *contract* in tests (clearance,
> non-overlap, non-solid) and treats the constants as data the later phases may
> adjust.

## Phase 1 – Parking data and placement rules (TDD)

- [ ] Task: Parked-car kinds + authored map instances (FR1, FR9)
  - [ ] Write failing tests for the data contract: the map authors six parked cars across four models; each instance carries a model, a kerb offset and a yaw; the grid publishes the fitted footprint (half extents + yaw) alongside position; existing prop kinds keep their current shape and defaults
  - [ ] Implement the parked-car prop kinds and the authored `townMap.ts` rows (offset from the kerb, yaw parallel to the street), plus the grid's publication of model/footprint
  - [ ] Refactor + coverage (target >80% on the touched logic)
- [ ] Task: Kerbside placement + the lane-clearance contract (FR2, FR3, FR4)
  - [ ] Write failing tests: for every street tile on the shipped map, a drive along the centre line never impacts a parked car (clearance ≥ the player's own radius, with the margin the spec sets); no parked car overlaps a house footprint, another parked car, or an existing prop; the fit-and-offset choice is deterministic and never scales a model up
  - [ ] Implement the placement rule — offset derived from the fitted footprint, orientation from the street axis — and tune the authored offsets until the contract holds
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 – Collision, tap and mission safety (TDD)

- [ ] Task: Non-solid box obstacles for parked cars (FR5)
  - [ ] Write failing tests: a parked car publishes a non-solid box whose half extents follow the mounted footprint and yaw; a swept contact reports a crashable impact and never `solid`; a car driven into one bonks and resumes with the route cursor still advancing; a regression guard showing the equivalent covering circle would fail the centre-line case
  - [ ] Implement the prop→box obstacle mapping (box shape, `solid: false`) and keep the existing circle mapping for every other prop
  - [ ] Refactor + coverage
- [ ] Task: Tap-snap exclusion (FR6)
  - [ ] Write failing tests: a tap inside the prop snap radius of a parked car keeps the finger's ground point and reports no `propId`; taps near cones and poles still snap; newest-wins and the dead-zone honk are unchanged; a parked car never becomes a drive target or a mission target
  - [ ] Implement the snap-target flag on prop data and its use in the router
  - [ ] Refactor + coverage
- [ ] Task: Mission clearing zone (FR8)
  - [ ] Write failing tests: no parked-car footprint overlaps a litter kerbside slot, a puppy hiding spot, the park dumpster or a fire house's approach tile — asserted against the shipped map using the missions' own placement functions
  - [ ] Resolve any overlap found by moving the authored instances (data fix), or by narrowing the offending mission slot
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 – Registry, fit and blob shadow (manual-verify, exempt from TDD)

- [ ] Task: Registry entries + mount fit (FR2, FR9, FR10)
  - [ ] Add the four Car Kit models (sedan, hatchback-sports, van, suv) to the registry, mount them with the `fitWithin` cap, per-instance yaw and the ground seat, and keep them out of the house-footprint map; measure each fitted model with `pnpm assets:measure` and the precache delta, recording the manual steps and the numbers
- [ ] Task: Blob shadow (FR7)
  - [ ] Give each parked car a flat ground quad sized to its footprint, absent from the shadow-map pass and free of z-fighting against the ground tiles; confirm it grounds the car under the ortho camera — record the manual steps
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Wiring and verification (mixed)

- [ ] Task: Scene and obstacle wiring (FR5, FR7, FR9)
  - [ ] Wire parked cars into the mounted town and the obstacle set, then manual-verify: bonk one head-on, graze one, and drive the centre line past every one
- [ ] Task: Full gates + measurements + docs (NFR2, AC7, AC8)
  - [ ] Run `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` and coverage; measure triangles/frame, draw calls and precache entries/KiB in the build; record the deltas in `tech-stack.md` including the ~52k budget note and the shadow decision, and update `product.md`'s deferred list and roadmap
- [ ] Task: Device pass (AC1–AC6, AC9)
  - [ ] Desktop drive of all four missions with parked cars present, then the iPad sitting: legibility at play distance, muted and unmuted, fps re-judged, the four GLBs confirmed offline; record results in `docs/playtest.md`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
