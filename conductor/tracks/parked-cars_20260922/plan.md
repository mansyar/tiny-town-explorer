# Plan: Static Parked Cars Around Town

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.
>
> Revised before implementation (2026-09-22) after measuring the design against
> the shipped code: the 0.32–0.70 kerb band is shared with `parkLitter` and
> `puppySpots` by construction, so Phase 3 adds a **kerb reservation**; the
> shadow pass doubles every mounted mesh, so Phase 4's blob shadow must be
> sun-aligned and merged to one draw call; and the house walls measure 0.574 to
> 0.748 from the street's centre line (not the 0.93 first assumed), which sets
> the fit at 0.55 and makes kerb eligibility a tested rule.
>
> Deliberate sequencing: Phase 1 keeps the *contract* in tests (clearance,
> spawn clearance, non-overlap) and treats the constants as data the later
> phases may adjust; Phase 3's invariant is the cross-cutting guard, so it is
> written after both the cars (Phase 1) and their hitboxes (Phase 2) exist.

## Phase 1 – Parking data and placement rules (TDD) [checkpoint: f91ae7a]

- [x] Task: Parked-car kinds + authored map instances (FR1, FR9) `f242c5d`
  - [x] Write failing tests for the data contract: the map authors six parked cars across four models; each instance carries a model, a kerb offset and a yaw; the grid publishes the fitted footprint (half extents + yaw) alongside position; existing prop kinds keep their current shape and defaults (12 tests in `parkedCars.test.ts`, red first — the suite died on `isParkedCarKind is not a function` before the data layer existed)
  - [x] Implement the parked-car prop kinds and the authored `townMap.ts` rows (offset from the kerb, yaw parallel to the street), plus the grid's publication of model/footprint (`PARKED_CAR_EXTENTS` measured from the kit, `PARKED_CAR_FIT` 0.55, `PARKED_CAR_KERB_OFFSET` 0.46; `parkedCarFootprint` throws on a non-quarter-turn yaw; parked props publish `yaw` + footprint and no `collisionRadius`; two pre-existing assertions updated to the new contract — 633/633 pass)
  - [x] Refactor + coverage (100% stmts on `townGrid.ts` and `townMap.ts`, 95.45% on `townTypes.ts`; the one uncovered line is the diagonal-yaw throw, whose test belongs to Phase 2's hitbox task)
- [x] Task: Kerbside placement and clearance contracts (FR2, FR3, FR4) `7aaaeeb`
  - [x] Write failing tests: every parked car sits alongside a `straight` road tile (never a bend, junction or end kerb) and on a kerb whose house wall is at least 0.652 from the street's centre line, with the wall derived as `1.00 − fitted depth ÷ 2` from the house's own kit extents and the 0.86 fit cap; each seats on the kerb top (+0.02); for every street tile a centre-line drive never impacts a parked car; no parked car overlaps a house's fitted footprint, another parked car, an existing prop, or any of the four authored spawn capsules; the fit never scales a model up (10 tests in `parkedCarsPlacement.test.ts`; the lane test samples every street tile centre and 20 points along every leg, and *collects* the blocked points so one run reports every offender)
  - [x] Make each house's model identity derivable in the pure layer (it is chosen by index in `townLayout` today), so wall eligibility is testable rather than trusted — each lot now names its house in `townMap.ts`, `BUILDING_MODELS` is a `Record<BuildingKind, url>` instead of a cycled array, and `houseFootprint`/`houseWallDistance` derive the wall from the model's measured extents through the same 0.86 fit cap the mount uses
  - [x] Implement the placement rule — offset ≈0.46 from the street's centre line, orientation from the street axis, straight-segment and wall eligibility validation — and tune the authored instances until every contract holds (all six pass lane, wall, spawn and non-overlap checks with 0.038–0.075 of lane margin and 0.037–0.147 of wall gap; `MIN_KERB_WALL` 0.652, `KERB_CLEARANCE` 0.03 and `PARKED_CAR_SEAT_HEIGHT` 0.02 are now named constants)
  - [x] Refactor + coverage (644/644 tests, 52 files; `townTypes.ts` 100%, `townMap.ts` 100%, `townGrid.ts` 94.59% branch — its two uncovered lines are pre-existing nullish fallbacks in `collectTiles` and the parked yaw default; the diagonal-yaw throw now has its test)
  - [x] **Deviation, flagged for review:** three props (the pole on lot (1,2), the cones on (1,3) and (2,2)) sat at their lot's *centre* along the street, exactly where a parked car's body goes, and the lane/wall band leaves nowhere for them to retreat to. Rather than move them to other streets they now step **0.45 along their own kerb** to the lot's corner — same kerb, same perpendicular offset, 0.045 of daylight from the car. This changes visible prop positions, so it is called out rather than buried.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
  - [x] Phase scope listed (`git diff --name-only f242c5d~1 HEAD`), a test file verified for every changed code file, and `townMap.test.ts` created for the one gap (7 tests; the authored map's own intent)
  - [x] Automated verification: `pnpm check && pnpm typecheck && CI=true pnpm test` — lint and types clean, **651 tests / 53 files** green (one Biome format fix in `townMap.test.ts` caught and re-run before the checkpoint)
  - [x] Manual verification plan presented, including the disclosed intermediate state: parked-car placements carry no `fitWithin` yet, so the cars render at kit scale with real shadows until Phase 4
  - [x] User confirmed the phase on the automated evidence, deferring the visual judgement of parking to Phase 4's checkpoint
  - [x] Verification report attached as a git note to `f91ae7a`

## Phase 2 – Collision and tap rules (TDD) [checkpoint: ea906cc]

- [x] Task: Axis-aligned non-solid box hitboxes (FR5) `1d30b62`
  - [x] Write failing tests: a parked car publishes a non-solid box whose half extents follow the mounted footprint; a 90/180/270° yaw swaps the extents correctly and a diagonal yaw fails loudly rather than mis-sizing a hitbox; a swept contact reports a crashable impact and never `solid`; a car driven into one bonks and resumes with the route cursor still advancing; a regression guard showing the equivalent covering circle would fail the centre-line case (14 tests across `collision.test.ts`, `vehicleMotor.test.ts` and `townGrid.test.ts`; red first — seven collision tests failed against the code that dropped parked cars from the hitbox list entirely)
  - [x] Implement the prop→box obstacle mapping (box shape, `solid: false`) and keep the existing circle mapping for every other prop (a prop with neither a radius nor a footprint now throws rather than being skipped, which is the bug this replaces)
  - [x] Refactor + coverage (663/663 tests, 53 files; `collision.ts` 100% on all four metrics, `vehicleMotor.ts` 100% statements/functions/lines and 94.82% branches — the residue is one comparison branch in the new deepest-overlap helper plus one pre-existing line in `pushClear`; the first draft of that helper tripped Biome's cognitive-complexity limit at 17 and was split into two functions)
  - [x] **Found and fixed while driving the tests (deviation from this task's sub-tasks):** a bonk whose recoil direction points at a wall springs the car *into* it — a parked car leaves 0.037 to the house behind it while the recoil travels 0.14, so the tail-bonk a turning truck takes off a parked car put its nose inside house-8. The motor's spring-back now clears solid hitboxes, leaving crashables drivable. Proven red-first: with the clamp disabled, both the new regression test and the pre-existing `never creeps into a building` test fail.
- [x] Task: Tap-snap exclusion (FR6) `ea906cc`
  - [x] Write failing tests: a tap inside the prop snap radius of a parked car keeps the finger's ground point and reports no `propId`; taps near cones and poles still snap; the dead-zone honk and newest-wins are unchanged; a parked car never becomes a drive target or a mission target (5 tests, red first — the router snapped to `parkedSedan-1`'s centre; the dead-zone honk and newest-wins are the existing suite's, and still pass untouched)
  - [x] Implement the snap-target flag on prop data and its use in the router (a required `snappable` on every published prop, set from the *kind* by the grid so a map cannot author a car as tappable; the router takes the nearest prop that says yes)
  - [x] Refactor + coverage (668/668 tests, 53 files; `inputRouter.ts` 100% on all four metrics, `townGrid.ts` 100% statements/lines, 94.59% branches — two pre-existing nullish fallbacks)
  - [x] **Reading of FR6 chosen, and asserted:** exclusion is per prop, not a veto on snapping. A tap inside 0.45 of both a parked car and a cone snaps to the cone, because that is the prop the kid meant; the parked car is simply never a candidate.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
  - [x] Phase scope listed since Phase 1's checkpoint (`git diff --name-only f91ae7a HEAD`); all four changed code files already had test files, so none was created
  - [x] Automated verification: `pnpm check && pnpm typecheck && CI=true pnpm test` — lint and types clean, **668 tests / 53 files** green
  - [x] Manual verification plan presented, with the disclosed caveat that the cars still render at kit scale until Phase 4 — which distorts a tap aimed past them, not just the view
  - [x] User confirmed the phase on the automated evidence, keeping the plan's order
  - [x] Verification report appended to `ea906cc`'s note so the task summary and the phase evidence stay together

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
  - [ ] Add the four Car Kit models (sedan, hatchback-sports, van, suv) to the registry, mount them with the `fitWithin` cap of 0.55, per-instance yaw and the kerb-top seat, and keep them out of the house-footprint map; measure each fitted model with `pnpm assets:measure` and the precache delta, and confirm the rendered footprint agrees with the derived half extents the placement tests assume — recording the manual steps and the numbers
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
