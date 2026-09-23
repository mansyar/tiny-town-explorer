# Spec: Second District

## Overview

The town is a 6×6 toy rug — one ring road, one cross street, ten houses. This
track expands it into a **figure-eight**: two block loops meeting at one shared
junction, with a new district that has its own identity — a **corner shop with
a striped awning** at the junction corner and a **pond with waddling ducks** in
the new loop's heart. Four new houses fill the block. The kid discovers a
bigger world exactly the way they discovered the first one: by driving.

Expansion is unusually cheap here by architecture: `townMap.ts` is pure data
and `createTownGrid`, the BFS pathfinder and the renderer already derive
everything from `spec.rows.length` (the pure layer's tests run 5×5 and 7×7
grids today). The real work is three seams: **generalizing the mission-spot
datasets** that are still hardcoded to today's tiles, **making the shadow
frustum follow the car** so a bigger town keeps its shadows, and **authoring
the new lots to the measured-first rule** (kit contracts, kerb bands, wall
clearances).

The design stance is deliberately calm: **longer voyages are embraced**, not
compensated — no speed tuning, no minimap, no district names. A tap that sends
the car across the junction is a voyage, and voyages are the point of
explorers. All four missions range over both districts under their existing
rules (the pure ≥2-houses draw, unchanged), while park clean-up stays anchored
to the two original park tiles. Town life scales with the map: **six parked
cars (three per ring) and a third wanderer**, re-measured honestly against the
~50k heuristic with the overage carried openly per the owner's 2026-09-23
precedent.

## Functional Requirements

- **FR1 — The map grows into a figure-eight.** `TOWN_MAP` becomes one larger
  authored grid: the existing ring and cross street plus a second block loop
  joined at **one shared junction tile**. It stays pure data in `townMap.ts` —
  hand-authored, deterministic, identical every session. A new tile kind marks
  the **pond green**, distinct from `P` park tiles, so the park mission's
  derivation can never drift onto the pond. The road tiles remain the pathing
  graph; connectivity ("every lot touches a street", one connected road
  network) holds across both loops.
- **FR2 — The second block's contents.** Four new house lots (Suburban models
  distinct enough to read as a different neighbourhood), one **corner-shop lot
  at the junction corner**, one **pond green in the loop's heart**. All
  placements follow the measured-first rule: `scripts/blender-analyze-kit.py` /
  `pnpm assets:measure` before mounting, kerb bands and wall clearances derived
  like the first town's.
- **FR3 — The corner shop: a house like any house.** One Blender-authored GLB
  to the City Kit (Suburban) measured contract — UV-mapped onto the kit's
  colormap swatches, geometry measured before mounting (the ice-cream truck
  pipeline). Silhouette: shopfront + striped awning, readable at 48px with zero
  text. It mounts like a house and **publishes a building footprint**, so every
  mission treats it identically: fires can land on it, ice-cream orders can
  come from it, it can be the puppy's owner door, its kerb joins the
  reservation. No special cases anywhere.
- **FR4 — The pond: splash-through, never a bonk.** The pond is a **passable
  surface**: driving in plays a soft sploosh one-shot and a droplet poof (its
  simultaneous visual counterpart), and the car carries on without losing a
  leg — never solid, never blocking, so `puppySpots.isScoopable`'s "only
  buildings block" invariant holds. A tap anywhere on the pond routes there
  like any ground. Entry triggers the splash once (a small logic seam:
  passable-surface flag + once-per-entry trigger).
- **FR5 — Waddling ducks.** Two to three chunky low-poly ducks at the pond's
  edge, built from **primitives in the puppy's pattern** (measured, ~200–300
  triangle band, shared materials — zero new art files). They waddle gently in
  place with squash-and-stretch (exempt motion code): no scattering, no
  quacking, no collision, no tap-snap — pure ambient life in the traffic
  system's spirit.
- **FR6 — Mission spots derive from the map.** `puppySpots`, `parkSlots` and
  the `spawnPoints` stop being hardcoded tiles and **derive from `TOWN_MAP`**:
  house-adjacent spots from lots, park slots from `P` tiles only, spawns from
  road tiles. Fire and ice-cream already derive from `houses` (the shop joins
  that list). The draw rule is unchanged: a fire or ice-cream order at **any
  house ≥2 houses from the previous**, now across all 14–15 houses in both
  districts; the puppy roams both districts and its owner door is any house in
  either. Park clean-up stays on the two original `P` tiles. No mission *rule*
  changes: pacing, gates, pickups, markers and celebrations are untouched.
- **FR7 — The shadow frustum follows the car.** The sun's shadow camera stops
  using fixed ±5-unit bounds and **tracks the active car** (snapped to texel
  increments so shadows don't shimmer), so both districts cast full shadows at
  play distance — the prerequisite for any town bigger than the shadow box.
- **FR8 — Town life scales: six parked, three movers.** Three parked cars per
  ring on each ring's **three roomiest measured kerbs** (straight segments
  only; the original ring's two impossible kerbs — 0.038 and 0.071 wall gaps —
  stay excluded), with the **kerb reservation extended town-wide** so no
  mission item is ever placed inside a car on either ring. A **third wanderer**
  joins the two (van or another already-precached Car Kit civilian), on seeded
  endless BFS routes that span **both rings through the junction**; lane
  discipline, crashability, tap-invisibility and silence are exactly the
  shipped traffic contract.
- **FR9 — Spawns spread 2 + 2.** The four vehicle spawn points derive from the
  map (FR6) and sit **two per district**, so both halves read as one town from
  the first second. The "no parked car overlaps a spawn capsule" invariant
  holds across the new map.
- **FR10 — One new sound: the sploosh.** A soft, warm sploosh one-shot in the
  established audio pipeline (CC0 clip transcoded to mono 44.1 kHz MP3 with
  provenance recorded, or synthesized like the jingle — plan's call), always
  paired with the droplet poof so muted play communicates it fully.

## Non-Functional Requirements

- **NFR1 — Pillars:** zero text, zero failure, pure agency, offline-first. The
  pond never punishes, the shop never demands, the bigger map never strands:
  every tap routes, every leg completes. The district has no text, no signs
  with words, no names.
- **NFR2 — Performance, measured honestly.** Per-frame cost is
  near-expansion-neutral — the orthographic camera's fixed ~5.3-unit window
  frustum-culls both districts — and the shadow-follow fix keeps the shadow
  pass constant regardless of town size. What grows is the **worst-case
  window** (junction views seeing both districts' edges) and **first-load
  cloning** (~5 more mounted buildings, pond, ducks, 3 parked, 1 mover). Both
  are measured with the GL-counter method and the floor device, recorded in
  `tech-stack.md` with the budget note. **Stance (locked): carry the honest
  overage** — the scene is already ~1.2k over the ~50k heuristic; the
  re-measured number is stated plainly, never rounded into the budget, and the
  iPad pass is the fps gate.
- **NFR3 — TDD scope:** map-size generalization and mission-spot derivation
  (FR6), the splash trigger and passable-surface semantics (FR4), town-wide
  kerb reservation (FR8), spawn placement invariants (FR9) and the three-mover
  lane/overtake clearance re-pin (FR8) are logic-bearing → red-first tests,
  >80% coverage. GLB authoring, scene mounting, shadow-follow rigging, duck
  waddle and splash FX are manual-verify per `workflow.md`'s exemption.
- **NFR4 — Determinism & offline:** hand-authored map, identical every session;
  seeded draws stay seeded. One new GLB (shop) and at most one new audio clip
  join the precache; ducks and pond are primitives — zero new art files beyond
  the shop. The game remains fully playable offline.
- **NFR5 — No mission rule changes:** only *where* spots come from moves.
  Pacing, calm gaps, the town-at-a-time gate, pickups, markers, helper hand and
  celebrations are untouched, and no new mission is added.
- **NFR6 — Tap responsiveness:** the tap → route → drive path gains no awaits
  and no per-frame cost beyond one more `update` call and the splash check; the
  100ms response target stands. Longer routes change duration, never
  responsiveness.
- **NFR7 — Calm pacing by design:** no speed tuning, timers, minimaps,
  fast-travel or route shortening. Voyages across the junction are the feature.

## Acceptance Criteria

- **AC1:** The figure-eight town loads and drives: tap-to-move routes across
  the junction between both loops and back with no dead ends; the pathfinder
  needs no district awareness.
- **AC2:** The corner shop reads as a landmark at play distance and at 48px,
  and behaves as a house in all four missions (fire can spawn on it, an
  ice-cream order can originate there, it can be the puppy's owner door).
- **AC3:** Driving into the pond splashes through — sploosh + droplet poof, car
  carries on, no leg abandoned — and the ducks waddle at its edge untouched by
  taps and traffic.
- **AC4:** All four missions complete across both districts under unchanged
  rules; park clean-up stays on the original park; every derived puppy spot
  stays scoopable and reachable.
- **AC5:** Shadows appear everywhere in both districts (no clipping at old
  bounds) and don't shimmer while the car moves.
- **AC6:** Six parked cars (3 per ring, straight-segment kerbs, measured walls)
  and three silent crashable movers tour the map; no mission item is ever
  placed inside a parked car across many seeds.
- **AC7:** Vehicles spawn 2 + 2 across the districts, derived from the map; no
  parked car overlaps a spawn capsule.
- **AC8:** `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; >80%
  coverage on the logic touched.
- **AC9:** Triangles/frame, draw calls and precache entries/KiB re-measured and
  recorded in `tech-stack.md` with the honest budget note (overage carried,
  stated plainly).
- **AC10:** iPad device pass in-track — first-load time and frame rate on the
  floor device vs. the pre-track figures, drive-time feel across the junction
  (voyages read calm, not tedious), shop legibility, pond delight, works
  offline — verdicts recorded in `docs/playtest.md`.

## Design Decisions (locked with the planner)

| Decision | Chosen | Why, and what it cost |
| --- | --- | --- |
| Shape | Figure-eight at one shared junction | Two loops give real topology and discovery without dead-end backtracking; one shared junction keeps the BFS graph clean and gives the district its crossing moment. Cost: more authored tiles than a spur. |
| Identity | Shop at junction corner + pond in heart | The landmark marks "where the neighborhoods meet" — visible from both rings; the pond is the calm discovery destination inside the loop. |
| Shop | Blender-authored GLB, house-like for all missions | The ice-cream truck pipeline is proven, and zero special-casing means the shop can be any mission's site for free. Cost: one measured Blender pass and ~40–80 KiB of precache. |
| Pond | Splash-through passable surface | Flat water reading as a wall would be odd and "wrong" actions must resolve as comedy, not errors — a splash is comedy. Cost: one small TDD-able trigger seam. |
| Ducks | Primitives, waddle in place, silent | The puppy's 232-triangle pattern proves primitives fit the style; silent waddle matches the traffic system's ambient voice. Scattering and quacking explicitly rejected as startle risks. |
| Mission draw | Pure ≥2 rule across both districts | The simplest rule to test and the calmest to play; occasional long voyages are embraced per the pacing stance. Cost: average errand distance grows. |
| Park anchor | Clean-up stays on the two original `P` tiles | A second park would need park-slots data for N parks; the pond green is a *different tile kind* so the derivation can't drift. Cost: the new district has no clean-up round. |
| Spawns | 2 + 2, derived from the map | Both districts read as lived-in from the first second; derivation replaces the hardcoded four. |
| Life | 6 parked (3 per ring) + 3 movers | Restores the six-car lineup the budget lever removed, spread evenly; a third mover keeps the bigger map from feeling empty. Cost: the known 0.041 sedan/parked-strip cosmetic carries unchanged. |
| Shadows | Frustum follows the car (texel-snapped) | Cheaper than a town-sized shadow box and keeps resolution; the prerequisite for shading any town bigger than ±5 units. |
| Budget | Carry the honest overage; measured never estimated | The owner's 2026-09-23 precedent; frustum culling keeps the delta mostly worst-case-window and load cost, both measured and recorded. |
| Pacing | No speed compensation | A bigger rug has longer voyages; the pillars reward patience (missions wait forever). Cost: some taps now resolve in 8–12s of driving. |
| Done | In-track iPad pass + playtest.md verdicts | First-load cloning and voyage feel are floor-device questions that desktop verification cannot answer. |

## Out of Scope

- New missions, or any change to mission *rules* — pacing, gates, pickups,
  markers, celebrations, the town-at-a-time gate.
- A second park / clean-up rounds in the new district.
- Car-speed changes, timers, minimaps, fast travel, route hints, district
  names, or any written text.
- Duck scattering, duck audio, duck reactions of any kind; shop interiors;
  bridges, tunnels, or multi-level anything.
- The carried sedan/parked-strip 0.041 geometry cosmetic (stays documented; its
  own track).
- Procedural or seeded town generation; a third district.
- Any persistence between sessions.

## Flagged Assumptions

- The exact grid rows, lot coordinates and prop offsets are plan-level
  (measure-first); this spec fixes the **shape** (two rings, one shared
  junction, 4 houses + shop + pond green) and the contents.
- The pond-green tile character and its derivation rules are the plan's pick,
  under FR6's "never a `P` tile" constraint.
- The third mover's model (likely the van — already precached) is a plan pick;
  the lane-bias contract already covers overtaking, but must be **re-pinned for
  three movers** on the bigger graph.
- Sploosh provenance (CC0 clip vs. synthesized) is the plan's call; if a clip,
  the transcoding recipe and `src/assets/audio/README.md` row are mandatory.
- Shop GLB lands in the 40–80 KiB band *if* the Suburban contract holds;
  measured before mounting, and if it lands bigger the budget note says so.
- Worst-case-window measurement point: the junction view (both districts'
  edges visible). That number, not the idle view, is what gets recorded.