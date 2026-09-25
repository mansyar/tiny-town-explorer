# Tiny Town Explorers — Technology Stack

> Versions verified 2026-09-21. Pin with caret ranges + committed pnpm
> lockfile; run `pnpm up --latest` only at milestone boundaries.

## Language
- **TypeScript 7.x (native compiler), strict mode.** Latest compatible
  major; chosen over plain JS for a growing gameplay codebase. If a
  tooling incompatibility surfaces during scaffolding, fall back to the
  5.9.x line and record it here.

## Build & Bundling
- **Vite 8.3** — dev server, HMR, hashed production bundles.
- **vite-plugin-pwa 1.3** — generates the service worker and auto-precaches
  the build manifest via workbox. Replaces the GDD's hand-maintained
  `ASSETS_TO_CACHE` array (whose all-or-nothing `cache.addAll` was a
  single-404 offline failure waiting to happen).
- **Node.js 24** — the current machine's runtime (v24.16.0); documented
  here as the project requirement. No engines pinning to older LTS.

## Rendering
- **three.js 0.186 (npm ESM)** — WebGL2 renderer, orthographic camera,
  GLTFLoader for Kenney GLB assets. No React/three wrappers; direct
  three.js for tight frame-budget control. The town alone measured 16.2k
  triangles (10 houses, the road grid and props). The full built scene with the
  fleet mounted measured **37,904 triangles per frame including the shadow-map
  pass**, across 134 draw calls and 106 meshes (2026-09-22), and **37,802
  triangles across 133 draw calls** when re-measured for the consolidation
  track (2026-09-22, all four missions plus the unified sparkle, same
  shadow-inclusive method) — inside the spec's ~50k budget, so nothing needed
  ratcheting down. Frame rate was judged on  the iPad 9th-gen floor in the Phase 8 playtest.
- **Second mission (added 2026-09-22):** the ice-cream order marker is 212
  triangles of primitives (5 meshes, 3 shared `MeshBasicMaterial`s) — no new
  GLB, no new texture, no new kit — measured from the geometries rather than
  estimated. The cone handoff reuses the existing `cones` burst pool, so the
  37,904-triangle scene above stays inside its budget; a second mission FSM
  costs no rendering time of its own.
- **Mission framework consolidation (added 2026-09-22):** the four missions no
  longer hand-roll their FSMs, marker wiring or celebrations — one framework
  (`missionFsm`, `missionMarkers`, `missionCelebration`) is configured per
  mission as data. It costs no rendering time of its own, and the unified
  completion sparkle is a **plan inside the existing `abilityFx` burst pool**
  (`sparkle`: 10 bits, pink, chunkier and thrown higher than the confetti it
  lands beside) rather than a particle system of its own — its pool is built on
  first use, costs +10 draw calls while its bits live, and nothing once they
  fade, so the re-measured scene above is the whole delta. The framework runs entirely in the simulation step: one FSM with
  guarded transitions and a completion linger, one marker layer, one
  celebration table.
- **Game controller extraction (added 2026-09-25):** the layer above the
  mission framework is now `src/game/game.ts` — `createGame()` owns the model
  library, the town mount, the motor and the actor lifecycle (including
  `swapVehicle`), the traffic system and its actors, the pond, and every mission
  subsystem and feedback object, together with the session rules they close
  over (`absorb`, `serveArmedNow`, `pressAbility`, `onSirenCast`, `activate`,
  `deliverPuppy`, `startPark`/`startPuppy`, `lightFire`/`lightOrder`,
  `tickHelperHand`, `demoSiren`, the pacers and the four per-mission ticks). It
  reaches the page through four grouped narrow ports — `GameAudio`, `GameHud`,
  `GameScene` (object `add`/`remove` only) and `GameCamera` — so the controller
  is unit-testable with fakes and no WebGL, Web Audio or DOM. `main.ts` is the
  edge alone: renderer, camera rig, parent panel, hold gate, install hint,
  input router, audio construction and first-gesture unlock, plus the wiring;
  it went from 1,253 lines to 236, and `import.meta.env.DEV` and
  `window.location.search` stay there (FR9), with the dev calm-gap override
  passed in as data. The edge's whole surface is
  `{ advance, tapAt, honk, noteActivity, selectVehicle, pressAbility,
  carPosition, activeVehicle, setHelperEnabled, ready, driven }` — two entries
  beyond the plan's four were provably required, because the input router and
  the vehicle HUD both stay at the edge. `GameCamera` is the one port that grew
  with the frame: it now carries `setTarget` and `followSun` alongside its
  `facing` slice, and deliberately has no `update`, so the rig's easing stays
  at the edge and the camera can never lag a frame behind the car. Costs
  nothing at runtime: the same objects, the same calls in the same frame order,
  and `game.ts` measures 94.5% statements / 86.6% branches against the 794-test
  suite the track started from, plus 48 new controller cases (842 total).
- **Park clean-up and lost puppy (added 2026-09-22):** primitives plus one
  newly mounted vendored GLB — measured from the geometries, not estimated.
  Litter is eight pieces of tied bag (90 triangles each) or crumpled paper
  (20 each), about 400 triangles a round by mix; the puppy is 232 triangles
  of primitives with 4 shared `MeshLambertMaterial`s (inside its 200–300
  contract); the dumpster is the City Kit (Roads) `dumpster.glb` already
  vendored at scaffold (234 triangles, 35.9 KiB), mounted as the park
  landmark — no new art files. Together under ~1,200 triangles over the
  standing 37,904-triangle scene, leaving >10k headroom to the 50k spec
  budget. The paw/heart markers and celebration FX are primitives reusing
  the marker and burst patterns of the first two missions, and both mission
  FSMs cost no rendering time of their own.
- **Static parked cars (added 2026-09-22):** six cars on the street kerbs, four
  Car Kit models (sedan, hatchback-sports, van, suv) added to the registry and
  precached, plus one merged blob-shadow mesh. Measured by counting GL draws per
  frame on the running game — the same method as the 37,802-triangle baseline
  above — with the cars absent from the map and then present:

  | Scene | Draw calls | Triangles/frame |
  | --- | --- | --- |
  | No parked cars | 138 | 38,310 |
  | Cars casting real shadows (the bug below) | 245 | 59,768 |
  | **Shipped: cars with blobs only** | **171** | **51,130** |

  So the six cars and their blob cost **+33 draw calls and +12,820 triangles**
  over the no-car scene, against the +32 the plan expected — the plan's estimate
  was sound. Six instances are sedan ×2 + hatchback ×2 + van + suv = **12,796
  triangles**; an earlier note in this track claimed 52,056 by multiplying the
  four-*model* sum by six, and that figure was wrong.

  The first measurement found a real fault rather than confirming the plan: the
  model library sets `castShadow` on every mesh it prepares and no placement
  could opt out, so each car was drawn twice — paying in full the shadow pass
  FR7 exists to avoid, while its blob double-darkened ground that already had a
  real shadow on it. `ModelPlacement.castsShadow` now lets a placement say no,
  and the 245 → 171 draw-call drop is that fix measured.

  **Budget note, stated plainly:** the scene now measures **51,130 triangles per
  frame against the spec's ~50k budget — about 1.1k over**, the first time this
  project has been over the line. The cars cost what four extra models cost; at
  0.55 fit their art is *smaller* than the town's houses, which is why six of
  them are affordable at all. Levers, in the order I would pull them: drop to
  four cars on the four roomiest kerbs (−2 models, about −4.1k triangles), or
  use the Car Kit's lower-detail karts for two of the six. Nothing needs
  ratcheting down for the floor device until a playtest says otherwise, but the
  number is over budget and should not be presented as inside it.

- **Light wandering traffic (added 2026-09-23):** two ambient civilian cars
  (Car Kit sedan and hatchback-sports — the same two models the parked-cars
  budget lever freed) drive the ring for the whole session on seeded endless
  BFS routes at 0.8 and 1.0 units/s, holding opposite lanes (bias **0.136**
  since 2026-09-24 — the original derivation, 0.177 = widest fitted half-width
  0.1618 + half the 0.03 pass clearance, is superseded by the lane-narrowing
  trade below). As shipped (2026-09-23), a known cosmetic at the tightest: the
  sedan mover's swept reach (0.3388 from the centre line) edged 0.041 into the
  parked cars' strip (near edge 0.2982) on same-side passes. **Fixed
  2026-09-24** by the trade below: swept reach 0.29776 now sits 0.00047 inside
  the strip — the clip is gone, and the overlap moved to mover↔mover straight
  passes (measured band 0.0152 / 0.05153). Silent
  (FR7), crashable like a cone (FR4), absent from the mission seam and the
  tap router (FR6), mounted through `vehicleActor` at the parked cars' 0.55
  fit with one merged following blob mesh. Measured on the running game at
  the fresh-spawn view (the GL-counter method above): the assembled scene
  (4 parked + 2 movers + blob meshes) is **175 draw calls and 51,192
  triangles per frame**, against the parked-cars gate's 171 / 51,130.

  **Budget note, stated plainly:** the scene is **+4 draw calls and +62
  triangles over the previous shipped line**. The swap itself is neutral —
  the same six civilian models and the same twelve blob triangles — but two
  actor-mounted movers cost a few more draws than their placement-mounted
  twins, and the moving blobs need their own mesh. The plan pre-decided the
  FR10 escape (drop to two parked cars) for any overage; the owner chose on
  2026-09-23 to keep all six civilian cars and carry this honest overage
  instead, and the iPad device pass decides whether it matters. Precache
  stays at **48 entries** and **4,191.87 KiB** (was 4,186.67 — +5.20 KiB of
  bundle code, zero new asset files: the movers ride art the town already
  precached).

  **Lane-narrowing trade (recorded 2026-09-24 ahead of the code change, per
  workflow Guiding Principle 2; the measured figures below come from
  `same-side-traffic-clearance_20260924`'s Phase 1 and replace the
  pre-implementation estimates):** the lanes narrowed — bias 0.177 → **0.136**,
  re-derived from fit data as *parked-cars strip near edge 0.29824
  (`PARKED_CAR_KERB_OFFSET` 0.46 − widest fitted half-width 0.16176) − that
  same half-width = 0.136470…, rounded down* (swept reach **0.29776** —
  0.00047 inside the strip). The 0.041 same-side clip is gone: the worst
  per-seat clip was 0.0405 (sedan mover past the sedan seat) and every seat
  now clears. The trade reverses: the old derivation (half-width + half the
  0.03 pass clearance) and the kerb-kiss contract (`TRAFFIC_KERB_SLACK`,
  "wheels kiss the kerb strip, never the kerb top") are **retired** — with
  `TRAFFIC_PASS_CLEARANCE` (0.03) — superseded by one contract: *no mover
  footprint point reaches past 0.29824 from the centre line toward parking*
  (pinned in `trafficBrain.test.ts`'s AC1 suite — every straight and every
  authored seat, plus the waypoint poses of seeded corner drives; at the bend
  itself a rotating footprint can pass ~0.02 wider, where no seat stands).
  Mover↔mover straight passes now interpenetrate by a measured
  band — **0.0152** between the authored sedan↔hatchback pair, **0.05153**
  widest-vs-widest (pinned as the literals `AuthoredPairSquash` 0.015 /
  `WidestPairSquash` 0.052; well inside the ≈0.1 line where squash stops
  reading as comedy). Accepted, on the record: movers already "squash past
  each other as comedy" and are silent, crashable and non-blocking, while a
  mover clipping a *stationary* parked car reads as a bug. The 0.60
  carriageway still has no room for two lanes and parking — the overlap moved
  to where the town's comedy covers it.

- **Second district (added 2026-09-24):** the town grows from the 6×6 ring into
  a figure-eight — two block loops meeting at one shared junction — with a
  Blender-authored corner shop at the junction corner (17 contracted `shop_*`
  nodes, 42.11 kB packed with the kit palette embedded), a pond green with
  three primitive ducks, four new houses and three garden lots, six parked
  cars (three per ring) and a third wanderer (the van). Measured on the
  running game with the GL-counter method (shadow-inclusive), windows sampled
  along a spawn→junction drive:

  | Window | Draw calls | Triangles/frame |
  | --- | --- | --- |
  | Fresh spawn (the old town's dense corner) | 237 | 56,232 |
  | Transit peak (tap FX alive) | 275 | 50,795 (avg) |
  | Junction, settled | 270 | 47,745 (avg) |

  **Budget note, stated plainly:** the worst window measured is the fresh
  spawn at **56,232 triangles per frame against the spec's ~50k heuristic —
  about 6.2k over**, carried honestly like the 51,192 line before it. The
  ortho camera's fixed window keeps expansion nearly per-frame-neutral (the
  junction window sits at 47.7k, *inside* the heuristic); what pushes the
  spawn window over is the old town's house cluster plus six cars and three
  movers in one frame. Levers if a playtest ever demands them: fewer parked
  cars, lower-detail karts for the movers, or a gentler spawn view. The
  shadow pass now frustum-follows the car (FR7, texel-snapped), so it costs
  the same on the bigger town. Precache grows to **49 entries / 4,236.32
  KiB** (+1 GLB, +44.45 KiB; zero new audio — the sploosh is synthesized).

- **Render budget recovery (added 2026-09-25; final verification 2026-09-25):**
  the second district's controlled DPR-1 browser baseline was **55,150
  triangles / 240 calls** at fresh spawn. The shipped optimization keeps the
  town content but removes roads and non-car props from the shadow-map pass,
  opts the hero vehicle out of its real shadow pass, and narrows the
  car-following sun shadow extent from **8 to 5.5 world units**. Re-measured
  through the dev post-render probe at 1280×720 / DPR 1: **48,463 / 180** at
  fresh spawn, **46,477 / 176** in transit, **45,797 / 154** at the settled
  junction, and **49,080 / 203** in a dev-paced mission window. The visual and
  device passes retained house shadows and the established blob-shadow
  language; no town content was removed and draw calls did not regress.
  Final quality gates: **852 tests across 67 files**, Biome and TypeScript clean;
  the production PWA build generated **49 precache entries / 4,238.99 KiB**.
  The development-only render probe is excluded from the production bundle.
  Physical iPad 9th-generation verification and cache-backed offline reopen
  were confirmed by the owner on 2026-09-25.

## Audio
- **Web Audio API, no wrapper library** — synthesized ice-cream jingle via
  oscillators; CC0 samples decoded to AudioBuffers. First-tap unlock,
  master gain kid-safe cap, audiocontext unlock on first pointerdown.
- **Audio assets are transcoded to MP3 (added 2026-09-21)** — the two CC0
  packs behind the one-shots (Kenney Impact Sounds and Interface Sounds) ship
  Ogg Vorbis only, and iOS Safari does not decode Ogg Vorbis, so the seven
  clips the game uses were transcoded to mono 44.1 kHz MP3 with loudness
  normalisation. The packs themselves are not vendored — only the clips, in
  `src/assets/audio/`, with their provenance recorded beside them. The car's
  engine loop comes from a third CC0 source (OpenGameArt's *Some sounds* by
  Ziph — a synthesized, deliberately cartoonish engine built to be pitch-bent by
  rpm), kept as WAV because MP3 encoder padding would leave a gap at the loop
  point. `setEngine` maps the motor's rate straight onto the loop's
  `playbackRate`, which is the speed-to-playbackRate curve the plan named — the
  earlier synthesized sawtooth is gone.
- **The bark (added 2026-09-22):** one new clip for the lost-puppy mission —
  "Barking of a Spitz" (BigSoundBank #0682, Joseph SARDIN, CC0), transcoded
  to mono 44.1 kHz MP3 with the same loudnorm recipe as the one-shots
  (16,989 B). The sound bank carries no license file to vendor, so its
  provenance lives in `src/assets/audio/README.md` as a table row plus a
  prose credit. Total: **nine clips, 384 KiB**.

## Package Management
- **pnpm 12.4** (installed: 12.4.1) — strict, fast, disk-efficient; pinned
  via the `packageManager` field + corepack so every machine and CI
  runner uses the identical toolchain.

## Testing
- **Vitest 5** — unit tests for the pure logic (pathfinding, FSM, tap
  resolution, audio scheduling); jsdom where DOM is unavoidable. No
  headless-WebGL in CI; rendering verified manually on target devices.

## Lint & Format
- **Biome 2.5** — single fast tool for lint + format (replaces the
  ESLint + Prettier pair); integrates with the Vite workflow.

## Assets
- **Kenney CC0:** Toy Car Kit (the slice's stand-in box truck; its track
  pieces are *not* road paving — see the measurement note below), City Kit
  (Suburban) 2025 remake (single-texture-map houses ≈ free palette atlas), City
  Kit (Roads) — the road grid — and **Car Kit** (the fleet's fire truck, garbage
  truck and police car, vendored whole as an art library). One model is authored
  rather than sourced: the **ice-cream truck**, built in Blender to the Car Kit's
  measured contract because no Kenney kit ships one. GLB preferred; packed into
  self-contained GLBs at scaffold time.

## Kit geometry is measured before mounting (added 2026-09-21)
_Deviation note: FR12 names two kits, and the plan read "track tiles as road
grid". Measuring the Toy Car Kit's track pieces showed they are 0.30-thick
raised slabs with striped side walls — a slot-car/race track, not streets —
so the grid moved to **City Kit (Roads)** (flat 1.00 × 1.00 × 0.02 tiles with
`road-intersection`/`road-crossroad` junctions). A Blender-authored T-junction
was started on the old assumption and deleted once a fit render showed walls
running through a town street. Full table:
`conductor/tracks/v1-playtest-slice_20260921/kit-mount-measurements.md`._

- **Measure first, then mount.** `scripts/blender-analyze-kit.py` (Blender
  5.2.0 LTS via the CLI, build-time only, never shipped) slices a kit's own
  vertices and palette: extents, the modelling planes on a piece's run axis
  (mate contract), and every palette texel grouped by face orientation with
  its area and bounds. Extents and triangle counts also come from
  `pnpm assets:measure` without Blender.
- **Roads (the current grid):** 1.00 × 1.00 tile pitch, base z = 0.00,
  asphalt z = +0.01 and kerb top z = +0.02, so mounted tiles need no lift and
  `tileSize: 1` needs no rescaling; ring corners use the 1 × 1
  `road-bend-square` (the 2 × 2 `road-curve` would eat four tiles); props stand
  on z = 0.
- **Seating is per piece family, so verify ground contact in the running
  app, never only in a render.** Vehicles ride on the road surface (+0.02),
  not the ground plane.
- **Style comes from the kit's own palette.** Any mounted or authored model
  UV-maps onto its kit's `colormap.png` swatches (flat swatches only, no
  gradients), and the packing step namespaces each kit's palette
  (`city-kit-roads/colormap`) so a runtime texture cache can never mix kits.
- **Budget:** individual pieces stay in their neighbours' band (roads: 44–308
  triangles; props up to ~420).

## Backend / Data
- **None.** Fully static PWA on any static host; no database, no server
  runtime, zero persistence (by design). Offline = workbox precache.

## Browser Targets
- iOS Safari 16+, current Chrome/Edge/Android; WebGL2 required;
  touch-first input (`touch-action: none`, pointer events).

## Compatibility Notes (closed 2026-09-22)
- vite-plugin-pwa 1.x peer range vs Vite 8 — **verified**: builds and precaches
  (44 entries, 3,398.82 KiB as of the consolidation track — the bark clip and
  mounted  `dumpster.glb` added ~51.6 KiB over the earlier 42-entry, 3.3 MiB
  baseline). The parked-cars track takes it to **48 entries, 4,186.67 KiB**: the
  four Car Kit cars (sedan 180.2, hatchback-sports 205.2, van 183.6, suv 214.7
  KiB) are 783.6 of the 787.9 KiB rise, and all four are in the precache
  manifest, so the game still plays offline with the cars present.
- Vitest 5 peer range vs Vite 8 — **verified**: 766 tests across 61 files
  (light-wandering-traffic track; was 712 across 57 at the parked-cars track,
  621 across 50 at the consolidation track, 516 across 43 at the park/puppy
  track, 361 across 28 before that).
- TypeScript 7 interop with Vite's transformer, `tsc --noEmit` gate — **verified**
  in both places; the native compiler runs the build's type-check step.
