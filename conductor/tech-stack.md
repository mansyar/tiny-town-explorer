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
- **Kenney CC0:** Toy Car Kit (vehicles + track tiles = road grid),
  City Kit (Suburban) 2025 remake (single-texture-map houses ≈ free
  palette atlas), Nature Kit. GLB preferred; consolidate into
  shared palette atlas / packed GLB at scaffold time.

## Authoring original 3D assets (added 2026-09-21)
_Deviation note: the Toy Car Kit has no T-junction or cross piece, so the
road grid cannot be built from kit art alone. Rather than adding a third
kit, original pieces are authored to the kit's measured module contract._

- **Blender 5.2.0 LTS via the CLI, build-time only.** Never a runtime or
  shipped dependency; the exported GLB is the artifact. Every piece is
  produced by a checked-in Python recipe run headless
  (`blender --background --python scripts/blender-<name>.py`) so it stays
  regenerable — no hand-sculpting, and no hand-patching of exported files.
- **Measure the mount before drawing.** `scripts/blender-analyze-kit.py`
  slices the kit's own vertices and palette; the resulting table for the
  current piece lives in the track folder
  (`t-junction-recon.md`), and the numbers below come from it.
- **Module contract (Toy Car Kit road family).** Assembly pitch 4.00; arm
  profile 1.00 wide × 0.30 thick slab plus a 0.20 × 0.05 tapering peg; road
  surface at the top of the slab, kerbs 0.20 per side of a 0.60 asphalt
  band.
- **Seating frames differ per family, so every mounted model carries an
  explicit offset.** Connectable track hangs with its base at kit z =
  −1.00 and needs a +1.00 lift; plain tiles and vehicles stand on kit z =
  0. Vehicles then ride on the road surface (+0.30), not the ground plane.
  Ground contact is verified in the running app, never only in renders.
- **Style = the kit's own palette.** Original pieces UV-map onto the kit's
  `colormap.png` swatches (asphalt `(112,12)`, kerb `(304,12)`, side and
  underside warm/light tones) and are exported with the palette as an
  external `Textures/colormap.png` reference, then run through
  `scripts/pack-glb-assets.ts` like any kit model. Flat swatches only — no
  gradients or baked shading.
- **Node-name contract.** Anything the runtime must find by name uses
  `<piece>_<part>` and is listed in the recipe's header comment; renaming
  one is a breaking change.
- **Verified by renders, not viewport screenshots.** Each recipe renders
  stills from the ride angle plus a fit render with the occupant, and the
  style gate compares the new piece beside accepted kit neighbours.
- **Budget:** a piece stays under ~150 KB and should stay in the same
  triangle band as its neighbours (the straight is 304 triangles).

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
