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
  three.js for tight frame-budget control (15k-tri budget, iPad 9th-gen
  floor).

## Audio
- **Web Audio API, no wrapper library** — synthesized ice-cream jingle via
  oscillators; CC0 samples decoded to AudioBuffers. First-tap unlock,
  master gain kid-safe cap, audiocontext unlock on first pointerdown.

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
- **Kenney CC0:** Toy Car Kit (vehicles; its track pieces are *not* road
  paving — see the measurement note below), City Kit (Suburban) 2025 remake
  (single-texture-map houses ≈ free palette atlas), City Kit (Roads) — the
  road grid — and Nature Kit for future greenery. GLB preferred; pack into
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
- **Roads (the current grid):** 1.00 × 1.00 tile pitch, base z = 0.00 and
  surface z = +0.02, so mounted tiles need no lift and `tileSize: 1` needs no
  rescaling; `road-curve` covers 2 × 2; props stand on z = 0.
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

## Open Compatibility Notes (verify at scaffold)
- vite-plugin-pwa 1.x peer range vs Vite 8.
- Vitest 5 peer range vs Vite 8.
- TypeScript 7 interop with Vite's transformer; `tsc --noEmit` gate in CI
  either way.
