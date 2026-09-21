# Vendored art — Kenney CC0 kits

Every model here is **CC0 1.0** (public domain) Kenney art. Attribution is not
required by the licence, but provenance is recorded so the kits can be
re-downloaded, upgraded, or audited later.

| Kit | Version | Downloaded | Source |
| --- | --- | --- | --- |
| Toy Car Kit | 1.2 | 2026-09-21 | https://kenney.nl/assets/toy-car-kit |
| City Kit (Suburban) | 2.0 | 2026-09-21 | https://kenney.nl/assets/city-kit-suburban |

Each kit's `LICENSE.txt` is the copy shipped inside its archive.

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

All 197 models are committed (8.2 MiB) as an art library for later phases.
Nothing unused reaches the build: models are referenced through
`?url` imports in `src/game/assets/modelRegistry.ts`, and Vite emits only the
files that are actually imported. Verify with:

```bash
pnpm assets:measure         # heaviest models, per-kit totals, budget check
```
