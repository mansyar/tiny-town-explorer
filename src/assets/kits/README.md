# Vendored art — Kenney CC0 kits

Every model here is **CC0 1.0** (public domain) Kenney art. Attribution is not
required by the licence, but provenance is recorded so the kits can be
re-downloaded, upgraded, or audited later.

| Kit | Version | Downloaded | Source | Role |
| --- | --- | --- | --- | --- |
| Toy Car Kit | 1.2 | 2026-09-21 | https://kenney.nl/assets/toy-car-kit | vehicles (its track pieces are a raised toy race track, **not** street paving) |
| City Kit (Suburban) | 2.0 | 2026-09-21 | https://kenney.nl/assets/city-kit-suburban | houses, driveways, paths, fences, trees |
| City Kit (Roads) | 2.0 | 2026-09-21 | https://kenney.nl/assets/city-kit-roads | the road grid: flat 1×1 tiles, junctions, crossings, poles, signs, lights |
| Car Kit | 3.1 | 2026-09-21 | https://kenney.nl/assets/car-kit | the fleet's service vehicles: fire truck, garbage truck, police car (the whole 50-model kit is vendored as an art library) |

Each kit's `LICENSE.txt` is the copy shipped inside its archive.

The road grid uses City Kit (Roads) rather than the Toy Car Kit's track pieces
because the track pieces are 0.30-thick raised slabs with striped side walls —
measuring them is what showed they would render as a guarded race track rather
than streets. See `conductor/tracks/v1-playtest-slice_20260921/kit-mount-measurements.md`.
All other models here are kit art; the one exception is the ice-cream truck, which
this project authored — see "The one authored model" below.

## The one authored model

No Kenney kit ships an ice-cream truck, so `car-kit/ice-cream-truck.glb` is
original work by this repository, produced by `scripts/blender-ice-cream-truck.py`
— a deterministic Blender 5.2 recipe that re-runs headless. It is **not** Kenney
art and is not covered by the kits' CC0 licence; it is the project's own asset.

It lives in the Car Kit folder and packs with `--kit=car-kit` because it is
authored to that kit's measured contract and UV-maps onto that kit's palette
atlas, so the whole fleet shares one texture. The measured contract, the axis
convention, the palette texels and the node-name contract are recorded in
`conductor/tracks/v1-playtest-slice_20260921/kit-mount-measurements.md`.

## Why the files are "packed"

Kenney ships each GLB with its palette as an *external* reference
(`Textures/colormap.png`). A bundler cannot honour that: the sibling PNG is
never emitted, and the hashed output URL has no such neighbour, so the texture
would 404 in a production build.

`scripts/pack-glb-assets.ts` rewrites each model's BIN chunk to carry the
palette inline, so every model is one self-contained file the service worker can
precache by itself. Packing also renames the palette to
`<kit>/colormap` — both kits call their palette `colormap`, and three names a
texture from that field, so without the prefix a runtime texture cache could
hand one kit's palette to the other kit's models.

Packing runs **at scaffold time**, not per build: the packed GLBs are the
committed artifacts. To add a kit, download and unzip it, then:

```bash
node scripts/pack-glb-assets.ts "<kit>/Models/GLB format" src/assets/kits/<kit-id> --kit=<kit-id>
```

## Cost

All 343 models are committed (~17 MiB) as an art library for later phases.
Nothing unused reaches the build: models are referenced through
`?url` imports in `src/game/assets/modelRegistry.ts`, and Vite emits only the
files that are actually imported. Verify with:

```bash
pnpm assets:measure         # heaviest models, per-kit totals, budget check
```
