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
  completion sparkle rides the existing `abilityFx` burst pool rather than
  bringing a particle system of its own, so the re-measured scene above is the
  whole delta. The framework runs entirely in the simulation step: one FSM with
  guarded transitions and a completion linger, one marker layer, one
  celebration table.
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
  mounted `dumpster.glb` added ~51.6 KiB over the earlier 42-entry, 3.3 MiB
  baseline).
- Vitest 5 peer range vs Vite 8 — **verified**: 617 tests across 50 files
  (consolidation track; was 516 across 43 at the park/puppy track, 361 across 28
  before that).
- TypeScript 7 interop with Vite's transformer, `tsc --noEmit` gate — **verified**
  in both places; the native compiler runs the build's type-check step.
