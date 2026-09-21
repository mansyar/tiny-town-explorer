# Kit mount measurements (road grid)

Numbers below were sliced out of the committed kit GLBs, not estimated.
Reproduce with:

```bash
blender --background --python scripts/blender-analyze-kit.py
```

The script prints `RECON_JSON <table>` on its last line: per-piece extents,
distinct modelling planes on the run axis, and every palette texel grouped by
face orientation with the area and bounds it occupies.

## Why the road grid is City Kit (Roads), not Toy Car Kit track

The plan originally read "Kenney track tiles as road grid" and named two kits
(FR12). Measuring the Toy Car Kit's track pieces killed that idea:

| Piece | Extents (x, y, z, kit units) | What it actually is |
| --- | --- | --- |
| `track-road-narrow-straight` | 1.00 × **0.30** × 4.40 | raised 0.30 slab, road surface on top, **striped orange/white side walls** |
| `track-narrow-corner-small` | 2.70 × 0.30 × 2.70 | same raised slab, pegged |
| `track-road-narrow` | 1.00 × 0.30 × 1.00 | plain pad, base at z = 0 (a *different* seating frame) |

A 0.30-thick segment fenced by striped walls is a slot-car/race track, not a
street: mounting it as the town's roads produces a raised racetrack with guard
rails and a stepped join against flat lots. It also needed a 4.00 assembly pitch
with 0.20 pegs, a +1.00 lift on connectable pieces, and vehicles riding at +0.30.
A Blender-authored junction piece was started on that basis (recipe, renders,
GLB gates) and abandoned once this was clear — the rendered fit showed walls
running through a town street.

**City Kit (Roads)** replaces it for the grid. Measured contract:

| Quantity | Value | Source |
| --- | --- | --- |
| Tile pitch | **1.00 × 1.00** | `road-straight`, `road-intersection`, `road-crossroad`, `road-end`, `road-crossing`, `road-driveway-*` all 1.00 × 0.02 × 1.00 |
| Seating | **base z = 0.00, surface z = 0.02** | every piece spans z 0.00…0.02 |
| Junction T | `road-intersection`, 1 × 1 | exactly the piece the two tees needed |
| Junction 4-way | `road-crossroad`, 1 × 1 | available if the map grows one |
| Bend | `road-curve`, **2 × 2** | a sweeping bend covering four tiles, x/y −1.00…1.00 |
| Ground / raised tiles | `tile-low` (z 0…0.02), `tile-high` (z 0…0.25) | base at z = 0, texel `(208,192)` |
| Props | `electricity-pole` 0.59 × 0.52 tall; `construction-cone` 0.08³; `construction-barrier`, `light-square`, `light-curved`, `traffic-light`, `road-sign-*`, `dumpster` | the spec's "poles" prop exists here |
| Triangles | 44 (straight) / 84 (T) / 116 (4-way) / 308 (2×2 bend) / 416 (pole) | measured |

Consequences for the wiring task:

- **The town's `tileSize: 1` needs no change.** The authored 6×6 map maps 1:1
  onto these tiles, so no global kit scale, no per-family lift table: every
  piece stands on z = 0 like the vehicles do, and vehicles ride at +0.02.
- Triangle cost drops against the toy track (44 vs 304 per straight), so the
  ~25k town projection in the tech-stack budget note only improves.
- `road-curve` covering 2×2 means a curved corner occupies four tiles; the map
  can either use `road-intersection`-style square bends or be reshaped to give
  the curve room. Decide when wiring, with the corner tiles rendering first.
- The spec's crashable **hydrants** still have no kit model (Roads has poles,
  cones, signs, lights, dumpster). Either substitute a present prop or author
  one later; not settled here.

## Palette texels (512 × 512 `colormap` per kit)

| Kit / role | Texel | Where it shows |
| --- | --- | --- |
| Roads: asphalt | (144, 64) | road surface, the dominant up-face area on every road piece |
| Roads: pavement/kerb | (16, 64) | 0.20 area of a 1×1 straight — the sidewalk strips |
| Roads: road marking | (240, 243) | 0.20 area of a straight, 0.04 of a 4-way |
| Roads: centre line | (208, 64) | 0.02 area of a straight |
| Roads: ground tile | (208, 192) | entire `tile-low` / `tile-high` top |
| Electric pole | (240, 217), (176, 115), (368, 242) | pole wood, crossarm, insulator details |
| Toy Car Kit: asphalt | (112, 12) | *retired for roads* — the toy track's surface |

Each kit keeps its own palette image, and packing namespaces the texture per kit
(`city-kit-roads/colormap`, `city-kit-suburban/colormap`,
`toy-car-kit/colormap`), so all three share one uploaded texture each and can
never be mixed up.
