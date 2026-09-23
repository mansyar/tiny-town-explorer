# Plan: Second District

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.
>
> Deliberate sequencing: **derivation before expansion** — Phase 1 turns the
> hardcoded mission spots into map-derived ones *while the map is still the
> known 6×6*, so golden tests can prove derivation reproduces today's authored
> data exactly, and the map can then grow without breaking a single mission.
> Phase 2 authors the figure-eight against those derivations (invariants TDD'd).
> Art follows data: the shop GLB is measured before mounting (Phase 3), and the
> pond's one interaction seam is red-first (Phase 4). Shadows (Phase 5) are
> keyed to the bigger town and land before town life so every later manual
> verification sees proper shadows. Life (Phase 6) needs the new ring's kerbs
> measured, so it comes after the map exists. Measurement and the device pass
> close the track (Phase 7) because the honest budget note (NFR2) is judged
> against the fully-assembled scene at the junction's worst-case window.

## Phase 1 – Mission spots derive from the map (TDD)

- [x] Task: Generalize spot derivation (FR6) (9b7d17f)
  - [x] Write failing tests: deriving puppy spots, park slots and spawn points
    from today's `TOWN_MAP` reproduces **exactly** the currently authored four
    puppy spots, the two park slots' tiles and the four spawn points (golden
    equivalence on the shipped map); derivation is pure and map-driven — no
    tile coordinates remain in the derivation modules; `parkSlots` reads `P`
    tiles only and ignores any other green kind (red first — the derivation
    modules don't exist)
  - [x] Implement derivation in the pure layer reading `TOWN_MAP`/grid metadata
    (lots → puppy spots and owner doors, `P` tiles → park slots, road tiles →
    spawn points); delete the hardcoded tile lists
  - [x] Refactor + coverage (`puppySpots*`, `parkSlots*`, spawn suites green;
    >80% on every touched logic module)
  - **Done:** 772 tests green (62 files), red-first on the two map-follows
    tests. In-flight refinement recorded per workflow.md: the spot data moved
    into `townMap.ts` (new `HidingSpotSpec` / `ParkSlotSpec` map fields) rather
    than being re-derived structurally — the approved golden clause ("reproduces
    exactly the currently authored four spots") is only satisfiable with
    authored data, and `puppySpots.ts`'s own contract requires each spot to
    read as a place. The derivation modules hold zero tile coordinates now;
    `fixedParkItems` filters to `P` tiles only (the pond-green guard). Spawn
    derivation already ran through `spec.spawnPoints` — pinned by the golden
    test. Coverage on touched logic: parkSlots 100%, townGrid 100% stmts /
    94.6% branch, puppySpots 97.6%.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 – Figure-eight map authoring (TDD for invariants)

- [ ] Task: Author the figure-eight `TOWN_MAP` (FR1, FR2)
  - [ ] Write failing tests for the map invariants on the new spec: the road
    network is one connected component reachable through the shared junction;
    every lot touches a street; the pond green is never a `P` tile; the two
    loops meet at exactly one shared junction tile; the second block holds four
    house lots, one shop lot and the pond green; derived spawns sit 2 + 2
    across the loops (red first — the new counts fail on the 6×6 data)
  - [ ] Author the rows/lot/prop data in `townMap.ts` — second block loop
    through one shared junction, shop lot at the junction corner, pond green in
    the loop's heart, four new houses with distinct Suburban models, prop
    offsets per the measure-first rule (`pnpm assets:measure` before mounting)
  - [ ] Refactor + coverage (grid/layout suites; pathfinder tests extended to
    figure-eight crossing routes in both directions)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 – Corner shop GLB (manual-verify)

- [ ] Task: Author and mount the corner shop (FR3)
  - [ ] Blender-author shopfront + striped awning to the City Kit (Suburban)
    measured contract; UV-map onto the kit's colormap swatches; measure with
    `scripts/blender-analyze-kit.py` + `pnpm assets:measure`; record the
    measurements (kit-mount-measurements pattern)
  - [ ] Mount like a house (fit cap, published building footprint) and verify
    by the golden derivation: a fire can spawn on it, an ice-cream order can
    originate there, it can be the puppy's owner door — no special cases
    anywhere; silhouette reads at 48px
  - [ ] Manual steps + measurements recorded in the commit note; the GLB joins
    the precache with the build
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Pond splash and waddling ducks (mixed)

- [ ] Task: Passable surface + once-per-entry splash (FR4) (TDD)
  - [ ] Write failing tests: pond tiles are never solid (`isScoopable`'s
    "only buildings block" invariant holds with pond green beside every spot);
    entering the pond raises exactly one splash until the car leaves and
    re-enters; a route through the pond completes with no leg abandoned (red
    first)
  - [ ] Implement the passable-surface flag + entry trigger at the
    collision/motor seam — minimum code to pass
  - [ ] Refactor + coverage
- [ ] Task: Ducks and the sploosh (FR5, FR10) (manual-verify)
  - [ ] Build 2–3 primitive ducks in the puppy's pattern (measured, ~200–300
    triangle band, shared materials — zero new art files) with squash-and-
    stretch waddle-in-place; droplet poof in the `abilityFx` burst-pool language
  - [ ] Sploosh one-shot in the established audio pipeline (CC0 clip transcoded
    per the recipe + `src/assets/audio/README.md` row, or synthesized — this
    plan's call), always paired with the visual poof so muted play reads it
  - [ ] Manual steps recorded: drive in → sploosh + poof + carry on; ducks
    untouched by taps and traffic; muted play communicates the splash
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 – Shadow frustum follows the car (manual-verify)

- [ ] Task: Car-following, texel-snapped shadow camera (FR7)
  - [ ] Rebuild the sun's shadow camera to track the active car snapped to
    texel increments (no shimmer while driving); both loops cast full shadows
    at play distance; nothing clips at the old ±5-unit bounds (if the snap
    helper is extracted as pure logic it takes red-first tests; the rig itself
    is exempt scene-setup)
  - [ ] Manual steps recorded: drive both loops — house/shop/tree shadows stay
    grounded, flicker-free, on the sun's side
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6 – Town life: six parked, three movers, spawns (mixed)

- [ ] Task: Town-wide kerb reservation + 3-per-ring placements (FR8, FR9) (TDD)
  - [ ] Write failing tests: three parked cars per ring on each ring's three
    roomiest **measured** kerbs (straight segments only; the old 0.038 / 0.071
    wall-gap kerbs stay excluded); no parked car overlaps any of the 2 + 2
    spawn capsules; the town-wide reservation guarantees no mission item is
    placed inside a parked car on either ring across many seeds (red first —
    the reservation is single-ring-shaped today)
  - [ ] Implement the reservation extension and the placement data; the
    placement suite re-measures wall gaps for the new lots
  - [ ] Refactor + coverage (`parkedCars*`, `kerbReservation`, `kerbInvariant`
    green; >80% on touched logic)
- [ ] Task: Third wanderer + three-mover lane re-pin (FR8) (TDD)
  - [ ] Write failing tests: three movers run seeded endless routes spanning
    both rings through the junction; the lane-clearance contract re-pinned on
    the bigger graph — head-on (opposite lanes) and same-lane overtaking clear
    on every straight; same-lane opposite-direction encounters resolve as the
    mover↔mover squash language (asserted crashable, never solid)
  - [ ] Implement (third mover row in `trafficSystem` — likely the van, already
    precached — and only what red proves missing)
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 7 – Measurements, docs and device pass (mixed)

- [ ] Task: Full gates + measurements + docs (NFR2, NFR4, AC9)
  - [ ] Run `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` and coverage —
    >80% on every logic module touched
  - [ ] Measure the assembled scene at the **junction worst-case window** with
    the GL-counter method + `pnpm assets:measure`; confirm precache entries/KiB
    (expect +1 GLB, ≤1 audio clip); record all of it in `tech-stack.md` with
    the honest budget note — **the overage is carried and stated plainly,
    never rounded into the ~50k heuristic**
  - [ ] `product.md` records the second district as shipped; `docs/playtest.md`
    gains the section
- [ ] Task: iPad device pass (AC10)
  - [ ] iPad sitting: first-load time and frame rate vs. the pre-track figures,
    drive-time feel across the junction (voyages read calm, not tedious), shop
    legibility at play distance and 48px, pond delight, offline intact;
    verdicts recorded in `docs/playtest.md`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)