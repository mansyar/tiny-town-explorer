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
| Tile pitch | **1.00 × 1.00** | `road-straight`, `road-intersection`, `road-crossroad`, `road-end`, `road-crossing`, `road-driveway-*` all 1.00 × 1.00 in plan |
| Seating | **base z = 0.00, asphalt z = +0.01, kerb top z = +0.02** | distinct levels on every road piece |
| Junction T | `road-intersection`, 1 × 1 | exactly the piece the two tees needed |
| Junction 4-way | `road-crossroad`, 1 × 1 | available if the map grows one |
| Bend | `road-bend-square`, **1 × 1** | square-elbow corner that seams flush in a single tile |
| Ground / raised tiles | `tile-low` (z 0…0.02), `tile-high` (z 0…0.25) | base at z = 0, texel `(208,192)` |
| Props | `electricity-pole` 0.59 × 0.52 tall; `construction-cone` 0.08³; `construction-barrier`, `light-square`, `light-curved`, `traffic-light`, `road-sign-*`, `dumpster` | the spec's "poles" prop exists here |
| Triangles | 44 (straight) / 60 (square bend) / 84 (T) / 116 (4-way) / 308 (2×2 sweep) / 416 (pole) | measured |

## Orientation (measured, not guessed)

The recon now reports, per palette swatch, **which bounding-box edges its faces
reach** — that list *is* a piece's orientation:

| Piece | Asphalt swatch reaches | Means at yaw 0 | Tris |
| --- | --- | --- | --- |
| `road-straight` | west + east | band runs **east–west**, 0.60 wide, centred | 44 |
| `road-bend-square` | west + south | elbow turning **west → south**; kerb wraps the outer north/east sides | 60 |
| `road-intersection` | west + east + south | east–west through with a stem toward **south** | 84 |
| `road-crossroad` | all four | 4-way | 116 |
| `road-end` | **east** only | dead end opening **east** | 42 |

Two consequences the wiring depends on:

- **Yaw direction.** A positive `rotation.y` turns a model *counterclockwise*
  on a north-up map — verified against three.js itself (yaw `+pi/2` carries
  model-east onto world-north, i.e. `-z`). So a bend authored covering west +
  south is yaw 0 for the (5,0) corner and each quarter turn moves the elbow one
  corner round; the dead-end piece, authored opening east, needs yaws a quarter
  turn away from the town's `+z`-facing helper.
- **Corners need no map reshaping.** The measured square bend covers a single
  tile, so the earlier worry about `road-curve` eating 2 × 2 is moot: ring
  corners mount `road-bend-square` (60 triangles) instead of the sweeping
  `road-curve` (308).

Consequences for the wiring task:

- **The town's `tileSize: 1` needs no change.** The authored 6×6 map maps 1:1
  onto these tiles, so no global kit scale, no per-family lift table: every
  piece stands on z = 0. Vehicles should ride at **+0.01** (the asphalt), not
  +0.02 (the kerb top).
- Triangle cost drops against the toy track (44 vs 304 per straight).
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
