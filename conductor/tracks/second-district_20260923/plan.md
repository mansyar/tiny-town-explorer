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

## Phase 1 – Mission spots derive from the map (TDD) [checkpoint: 4a6de5b]

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
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (4a6de5b)

## Phase 2 – Figure-eight map authoring (TDD for invariants) [checkpoint: 8084993]

- [x] Task: Author the figure-eight `TOWN_MAP` (FR1, FR2) (bf4a9f8)
  - [x] Write failing tests for the map invariants on the new spec: the road
    network is one connected component reachable through the shared junction;
    every lot touches a street; the pond green is never a `P` tile; the two
    loops meet at exactly one shared junction tile; the second block holds four
    house lots, one shop lot and the pond green; derived spawns sit 2 + 2
    across the loops (red first — the new counts fail on the 6×6 data)
  - [x] Author the rows/lot/prop data in `townMap.ts` — second block loop
    through one shared junction, shop lot at the junction corner, pond green in
    the loop's heart, four new houses with distinct Suburban models, prop
    offsets per the measure-first rule (`pnpm assets:measure` before mounting)
  - [x] Refactor + coverage (grid/layout suites; pathfinder tests extended to
    figure-eight crossing routes in both directions)
  - **Done (bf4a9f8):** `figureEight.test.ts` 7 tests red first (5 failed on the
    6×6 map exactly as designed), all green after; suite now 63 files / 779
    tests. In-flight refinements: `parkLitter`'s outer-edge `touchesRingRoad`
    heuristic generalized to `touchesStreet` (any road neighbour) because the
    outer-edge rule broke at N=10; `trafficBrain`'s custom mini-maps given
    10×10 rows so their world mapping matches the module grid (the helpers
    were implicitly coupled to the old size). Fallout recomputed across 10
    suites: missionSpots goldens at the new 4.5 grid centre (7 spots), counts
    39/18/42/1, six ring elbows + the junction crossroad, four lot-facing
    puppy kerb keys. Coverage: townMap/townTypes 100%, townGrid 100% stmts /
    94.6% branch, parkLitter 97.6% stmts / 78.6% branch (the uncovered branch
    is the defensive pool-exhaustion fallback).
  - **Design note (locked, in-flight):** N=10 square. Rows (y0 north):
    `['######PPPP','#PP#L#PPPP','#LL#L#PPPP','#LL#L#PPPP','#PP#L#PPPP'` hmm —
    see `figureEight.test.ts` for the authoritative strings. Junction (5,5) =
    old SE corner + new NW corner (4-road cross). New ring = perimeter of
    (5..9)^2; interior (6..8)^2: shop lot (6,6) bare until Phase 3 mounts the
    GLB, pond green (7,7) new tile kind ('W' char), 4 house lots (7,6),(8,6),
    (6,7),(8,7) distinct Suburban kinds, garden lots (6,8),(7,8),(8,8) with
    trees. Fields (NE 16 + SW 20 tiles) = 'P' meadow with trees (not lots, so
    "every lot touches a street" holds; parkSlots stays on the 2 original P
    tiles). Spawns 2+2: (3,2),(1,0) old; (7,5),(7,9) new. Hiding spots +3:
    spot-shop (6,6)-0.3,-0.3; spot-pond (7,7) 0,+0.4; spot-orchard (7,8) 0,+0.3.
    In-flight ripples: `parkLitter.touchesRingRoad` outer-edge heuristic breaks
    at N=10 -> generalize to "touches any street"; missionSpots goldens recompute
    (grid centre 2.5->4.5 shifts all world positions -2) + 7 spots; townGrid
    parse counts, parkSlots per-tile, townMap shape test update. Pond ground
    color lands in `townLayout.GROUND_COLORS`.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (8084993)

## Phase 3 – Corner shop GLB (manual-verify) [checkpoint: 085425d]

- [x] Task: Author and mount the corner shop (FR3) (085425d)
  - [x] Blender-author shopfront + striped awning to the City Kit (Suburban)
    measured contract; UV-map onto the kit's colormap swatches; measure with
    `scripts/blender-analyze-kit.py` + `pnpm assets:measure`; record the
    measurements (kit-mount-measurements pattern)
  - [x] Mount like a house (fit cap, published building footprint) and verify
    by the golden derivation: a fire can spawn on it, an ice-cream order can
    originate there, it can be the puppy's owner door — no special cases
    anywhere; silhouette reads at 48px
  - [x] Manual steps + measurements recorded in the commit note; the GLB joins
    the precache with the build

  **Done (085425d):** deterministic recipe `scripts/blender-corner-shop.py`
  (copied from the ice-cream-truck canonical; 17 contracted `shop_*` nodes;
  front authored +Y and turned 180 about Z so the GLB faces glTF +z like the
  kit, mounting at `yawForDirection` like any house). Gate 1.1 measurement
  table in the recipe docstring; measured extents 1.560 x 1.380 x 0.900,
  min z 0.000, 29.2 KiB raw / 0.04 MiB packed — under the spec's 40-80 KiB
  guess, so the honest note carries the real number; fit 0.551 puts the
  awning-side wall at ~0.62 from the street centre line (family band
  0.574-0.748). Palette = the kit's own atlas texels (family green/coral
  columns + neutral cells). Three render iterations; the user accepted the
  woven-stripe awning at Layer 3 (2026-09-24). Packed at
  `src/assets/kits/city-kit-suburban/corner-shop.glb`; `BuildingKind 'shop'`
  with the measured `BUILDING_EXTENTS` row; house-15 at (6,6) facing north as
  the junction-corner landmark. Test fallout: house counts 15, the figure-eight
  block test now expects the shop as a house. Gates: `pnpm check` +
  `pnpm typecheck` clean, 63 files / 779 tests green.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (085425d)

## Phase 4 – Pond splash and waddling ducks (mixed) [checkpoint: 142e333]

- [x] Task: Passable surface + once-per-entry splash (FR4) (TDD) (5726d5e)
  - [x] Write failing tests: pond tiles are never solid (`isScoopable`'s
    "only buildings block" invariant holds with pond green beside every spot);
    entering the pond raises exactly one splash until the car leaves and
    re-enters; a route through the pond completes with no leg abandoned (red
    first)
  - [x] Implement the passable-surface flag + entry trigger at the
    collision/motor seam — minimum code to pass
  - [x] Refactor + coverage

  **Done (5726d5e):** red-first `src/game/feedback/pondSplash.test.ts` (4
  tests: exactly one splash per entry — silent while wet, rearmed on leaving;
  nothing outside the pond; the water stays scoopable and house-clear for all
  seven spots; a motor route onto the water completes with zero bonks). Pure
  trigger module `src/game/feedback/pondSplash.ts`
  (`PondWatcher.note(point)` on `tileAt(worldToTile(point)) === 'pond'`). The
  water was already passable ground (only buildings are solid) — FR4 is the
  trigger, not a collision. In-flight refinement: the sploosh is **synthesized**
  as a scheduling function (Task 2, red-first like the jingle) rather than a
  transcoded CC0 clip — the plan delegated the call and zero new assets is the
  honest cost; the droplet poof reuses `fx.burst('poof')`. Gates: `pnpm check`
  + `pnpm typecheck` clean, 64 files / 783 tests green.
- [x] Task: Ducks and the sploosh (FR5, FR10) (manual-verify) (142e333)
  - [x] Build 2–3 primitive ducks in the puppy's pattern (measured, ~200–300
    triangle band, shared materials — zero new art files) with squash-and-
    stretch waddle-in-place; droplet poof in the `abilityFx` burst-pool language
  - [x] Sploosh one-shot in the established audio pipeline (CC0 clip transcoded
    per the recipe + `src/assets/audio/README.md` row, or synthesized — this
    plan's call), always paired with the visual poof so muted play reads it
  - [x] Manual steps recorded: drive in → sploosh + poof + carry on; ducks
    untouched by taps and traffic; muted play communicates the splash

  **Done (142e333):** sploosh synthesized as `splooshSchedule` (red-first,
  2 tests — falling 440→175 Hz drop over 0.46 s, like the jingle's tested
  schedule) + `audioEngine.sploosh()` in sine; no CC0 clip, zero new assets
  and no `src/assets/audio/README.md` row (the plan delegated the call —
  recorded in Task 1's Done note). `src/game/town/pondDucks.ts`: three
  chunky primitives ducks in the puppy's pattern (~214 tris each, three
  shared kit-family materials, deterministic edge-of-pond poses found from
  the map's 'pond' tile — empty group on a town without one), squash-and-
  stretch waddle-in-place via `update(delta)`. main.ts wiring: the pond
  watcher and ducks join the `let … | undefined` async-window house pattern;
  `tickVehicle` extracted so `advance` stays under the complexity cap. The
  droplet poof reuses `fx.burst('poof')` — the sploosh always shares its
  simultaneous visual (FR10). Gates: `pnpm check` + `pnpm typecheck` clean,
  64 files / 785 tests green (sploosh red-first; ducks/wiring visual —
  manual-verify).
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (142e333)

## Phase 5 – Shadow frustum follows the car (manual-verify) [checkpoint: 53091f1]

- [x] Task: Car-following, texel-snapped shadow camera (FR7) (53091f1)
  - [x] Rebuild the sun's shadow camera to track the active car snapped to
    texel increments (no shimmer while driving); both loops cast full shadows
    at play distance; nothing clips at the old ±5-unit bounds (if the snap
    helper is extracted as pure logic it takes red-first tests; the rig itself
    is exempt scene-setup)
  - [x] Manual steps recorded: drive both loops — house/shop/tree shadows stay
    grounded, flicker-free, on the sun's side

  **Done (53091f1):** `SUN_SHADOW_TEXEL` + `sunShadowSnap` (pure, red-first —
  3 tests: idempotent; sub-cell creep leaves the map still; `followSun` aims
  the light and its target at the snapped focus) and `GameScene.followSun` —
  the sun travels with the car instead of holding fixed ±8 bounds on the
  world origin, so both loops keep full shadows and the 1024 map stays sharp
  on the window rather than the town. main.ts wires
  `followSun(motor.position)` into `tickVehicle`. In-flight refinement: the
  snap rounds on the map's lattice but solves the step BACK IN THE GROUND
  PLANE (`SNAP_GROUND_DET`) — the first cut rebuilt the focus in the light
  basis and dropped its y, so the round trip drifted and idempotence failed.
  Gates: `pnpm check` + `pnpm typecheck` clean, 64 files / 788 tests green.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (53091f1)

## Phase 6 – Town life: six parked, three movers, spawns (mixed) [checkpoint: 203f160]

- [x] Task: Town-wide kerb reservation + 3-per-ring placements (FR8, FR9) (TDD) (9e1a159)
  - [x] Write failing tests: three parked cars per ring on each ring's three
    roomiest **measured** kerbs (straight segments only; the old 0.038 / 0.071
    wall-gap kerbs stay excluded); no parked car overlaps any of the 2 + 2
    spawn capsules; the town-wide reservation guarantees no mission item is
    placed inside a parked car on either ring across many seeds (red first —
    the reservation is single-ring-shaped today)
  - [x] Implement the reservation extension and the placement data; the
    placement suite re-measures wall gaps for the new lots
  - [x] Refactor + coverage (`parkedCars*`, `kerbReservation`, `kerbInvariant`
    green; >80% on touched logic)
  **Done (9e1a159):** six cars, three per ring — suv (3,2), sedan (3,4),
  hatchback (4,5) on the old loop; hatchback (7,5), sedan (5,7), van (9,6) on
  the second loop. The placement suite now re-derives the ranking from each
  house's **facing** kerb (the measured wall), room = wall minus the widest
  fitted car, with mission-declared kerbs excluded (the reservation owns
  them) — which is why house-4's roomiest kerb stays the puppy's. Red-first:
  3 tests (six-car lineup, historic-tightest guard, 40-seed reservation
  sweep). In-flight refinement: the reservation needed **no extension** —
  the 40-seed sweep proved `takenKerbKeys` is already town-wide, so the
  change was lineup data + the derived ranking only. Stale fixtures
  re-derived (parkedCars lever count, collision transposed-box pair,
  vehicleMotor lane fixture). Gates: `pnpm check` + `pnpm typecheck` clean,
  64 files / 790 tests green; coverage townMap 100%, parkSlots 100%,
  parkLitter 97.6%.
- [x] Task: Third wanderer + three-mover lane re-pin (FR8) (TDD) (203f160)
  - [x] Write failing tests: three movers run seeded endless routes spanning
    both rings through the junction; the lane-clearance contract re-pinned on
    the bigger graph — head-on (opposite lanes) and same-lane overtaking clear
    on every straight; same-lane opposite-direction encounters resolve as the
    mover↔mover squash language (asserted crashable, never solid)
  - [x] Implement (third mover row in `trafficSystem` — likely the van, already
    precached — and only what red proves missing)
  - [x] Refactor + coverage
  **Done (203f160):** the roster is three — sedan 0.8, hatchback 1.0, van 0.9
  (`parkedVan`, precached) — alternating sides, `pickStarts` generalized to N
  distinct tiles so the roster never starts stacked. Red-first: the roster
  contract (three stable ids, three crashable boxes — same-lane meets squash
  past as the mover-to-mover comedy, never walls; every wanderer advances a
  step per frame; starts pairwise apart). In-flight note: the lane-clearance
  contract (trafficBrain FR3) is **pair-wise and count-agnostic** — head-on
  and overtake already clear on every straight of the figure-eight grid, so
  no bias values changed (`TRAFFIC_LATERAL_BIAS` 0.177 still covers widest +
  pass clearance). Gates: `pnpm check` + `pnpm typecheck` clean, 64 files /
  790 tests green.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (203f160)

## Phase 7 – Measurements, docs and device pass (mixed)

- [x] Task: Full gates + measurements + docs (NFR2, NFR4, AC9) (0e15d7b)
  - [x] Run `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` and coverage —
    >80% on every logic module touched
  - [x] Measure the assembled scene at the **junction worst-case window** with
    the GL-counter method + `pnpm assets:measure`; confirm precache entries/KiB
    (expect +1 GLB, ≤1 audio clip); record all of it in `tech-stack.md` with
    the honest budget note — **the overage is carried and stated plainly,
    never rounded into the ~50k heuristic**
  - [x] `product.md` records the second district as shipped; `docs/playtest.md`
    gains the section
  **Done (0e15d7b):** GL-counter measured on the running game (shadow-inclusive,
  windows sampled along a spawn→junction drive): fresh spawn **237 draws /
  56,232 tris**, transit peak 275 / 50,795 (avg), junction settled 270 /
  47,745 (avg) — the honest worst window is the **fresh spawn at 56,232,
  ~6.2k over the ~50k heuristic**, carried plainly (NFR2); the junction
  window itself sits *inside* the heuristic (the ortho window keeps expansion
  nearly per-frame-neutral). Precache from a real `pnpm build`: **49 entries /
  4,236.32 KiB** (+1 GLB = `corner-shop.glb` 42.11 kB packed, zero new audio —
  the sploosh is synthesized) (NFR4). `tech-stack.md` gains the rendering
  entry + budget note; `product.md` records the district shipped;
  `docs/playtest.md` gains the section (iPad subsection pending Task 2).
  Gates: `pnpm check` + `pnpm typecheck` clean, 64 files / 790 tests green.
- [~] Task: iPad device pass (AC10)
  - [ ] iPad sitting: first-load time and frame rate vs. the pre-track figures,
    drive-time feel across the junction (voyages read calm, not tedious), shop
    legibility at play distance and 48px, pond delight, offline intact;
    verdicts recorded in `docs/playtest.md`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)