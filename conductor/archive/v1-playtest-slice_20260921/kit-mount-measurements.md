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

## The vehicle fleet's frame and scale (Phase 5)

The v1 fleet is not one kit. Three of the four service vehicles come from
**Car Kit** (`src/assets/kits/car-kit/`); the Toy Car Kit supplies the slice's
stand-in `vehicle-truck`. Their authored frames differ, and a difference like
this is invisible in a render but decides whether a car drives cab-first and on
its wheels, so both were sliced out of the committed GLBs:

| Model | Extents (x, y, z) | Ground | Facing |
| --- | --- | --- | --- |
| `car-kit/firetruck` | 1.50 × 1.70 × 3.40 | `min y = 0.000` | **+z** — `grill` at z = +1.58, `wheel-front-*` at +0.96, `wheel-back-*` at −0.66 |
| `car-kit/garbage-truck` | 1.60 × 1.60 × 3.45 | `min y = 0.000` | **+z** — `wheel-front-*` at +1.11, `wheel-back-*` at −0.51 |
| `car-kit/police` | 1.50 × 1.30 × 3.10 | `min y = 0.000` | **+z** — `grill` at +1.43, `wheel-front-*` at +0.81, `wheel-back-*` at −0.81 |
| `toy-car-kit/vehicle-truck` | 0.525 × 0.525 × 0.863 | `min y = 0.000` | **−z** — `wheel-fl`/`wheel-fr` at −0.244, `wheel-bl`/`wheel-br` at +0.256 |

Three consequences, each measured rather than assumed:

1. **Car Kit art is authored about 4× the town's scale.** Every Car Kit vehicle is
   3.1–3.45 long against the Toy Car Kit truck's 0.863. On a 1.00 tile pitch that
   is three and a half tiles of vehicle, so the Car Kit family is scaled at mount
   time rather than re-authored.
2. **Car Kit art faces +z; the Toy Car Kit faces −z.** `+z` is the car's nose
   (`headingFor`/`facingOf`), so Car Kit models mount at yaw 0 and the Toy Car
   Kit's truck at π — which is all `MODEL_FACING_YAW` ever meant.
3. **Both kits stand on their origin** (`min y = 0.000`), so the actor's existing
   seating step is already correct for the fleet.

### The fleet's fit

The car's footprint is a fixed contract: a capsule `CAR_RADIUS` = 0.26 wide
(0.525 measured) by `CAR_HALF_LENGTH` = 0.43 long (0.863 measured). A kit model
is fitted to it — scaled uniformly to **0.86 long**, the largest size that still
keeps the nose inside the capsule. `car-kit/firetruck` at that fit is
0.380 × 0.430 × 0.860: narrower than the old truck, but never longer than the
collision shape that stops it, so it cannot clip a wall.

### The Car Kit palette is a gradient atlas

`car-kit/colormap.png` is **512 × 512** — sixteen 32-pixel columns by sixteen
32-pixel rows of cells — and each cell holds a *vertical gradient* rather than
one flat swatch (the City Kits' flat swatches are a different format). A colour
is therefore a *point*, not a cell, so the authored ice-cream truck pins each
material to an explicit texel sampled from this image and verified in the render.

| Material | Colour | Sampled at (px) |
| --- | --- | --- |
| Body (pink lower) | `#FF8AAE` | (495, 391) |
| Trim (cream upper, bumper, roof cap) | `#F6F6F9` | (431, 262) |
| Accent (awning, cherry) | `#E1473E` | (175, 470) |
| Glass (windows) | `#C2DDFA` | (48, 16) |
| Hub (blue wheel centres) | `#A0A8C9` | (336, 272) |
| Tyre / grille | `#36363A` | (175, 383) |
| Cone (waffle) | `#DBA33D` | (431, 472) |
| Yellow (roof band, headlights) | `#FFE44B` | (112, 400) |
| Vanilla (soft-serve swirl) | `#FDE4C7` | (144, 144) |

### The authored ice-cream truck (Phase 5)

No Kenney kit ships an ice-cream truck, so that one fleet member is authored by
`scripts/blender-ice-cream-truck.py` (Blender 5.2, headless, deterministic) and
packed into `src/assets/kits/car-kit/` with `--kit=car-kit` so it shares the kit's
palette atlas.

| Model | Extents (x, y, z) | Ground | Facing | Nodes | Packed |
| --- | --- | --- | --- | --- | --- |
| `car-kit/ice-cream-truck` | 1.840 x 2.780 x 3.440 | `min y = 0.000` | +z | 25 | 66.3 KiB |

Axis convention, measured rather than assumed: Blender's glTF importer maps
glTF +Z onto Blender -Y, and the kit's own firetruck confirms it (its grill sits
at Blender y = -1.575, its front wheels at -1.56, its rear wheels at +0.06). The
recipe therefore authors the truck nose-forward at +Y, where it is easy to read,
and turns the finished assembly 180 degrees about Z before export, so the shipped
GLB faces glTF +Z exactly like the kit's vehicles and mounts at the same yaw.

Node-name contract (one node each, `getObjectByName`-safe):
`ice_cream_body_lower`, `ice_cream_body_upper`, `ice_cream_roof_band`,
`ice_cream_roof_cap`, `ice_cream_windshield`, `ice_cream_cab_window_left`,
`ice_cream_cab_window_right`, `ice_cream_serving_window`, `ice_cream_awning`,
`ice_cream_menu`, `ice_cream_grille`, `ice_cream_headlight_left`,
`ice_cream_headlight_right`, `ice_cream_bumper`, `ice_cream_roof_cone`,
`ice_cream_roof_scoop`, `ice_cream_roof_cherry`, `ice_cream_wheel_front_left`,
`ice_cream_wheel_front_right`, `ice_cream_wheel_back_left`,
`ice_cream_wheel_back_right`, `ice_cream_hub_front_left`,
`ice_cream_hub_front_right`, `ice_cream_hub_back_left`,
`ice_cream_hub_back_right`.
