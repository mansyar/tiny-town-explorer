# T-junction mount measurements (Blender Phase 1 recon)

Gate 1.1 of the `threejs-blender-asset` skill: a written measurement table
before any geometry is authored. Every number below was sliced out of the
committed kit GLBs, not estimated.

Reproduce with:

```bash
blender --background --python scripts/blender-analyze-kit.py
```

The script prints `RECON_JSON <table>` on its last line: per-piece extents,
distinct modelling planes on the run axis (the mate contract), and every
palette texel grouped by face orientation.

## Module contract — `track-road-narrow-straight`

| Quantity | Value (kit units) | Source |
| --- | --- | --- |
| Extreme span, end to end | 4.40 | extents y\[−4.20, +0.20] |
| **Body** length (road surface) | **4.00** | planes at y = −4.0 and y = 0.0 are full-width, 0.20 in from each extreme |
| **Assembly pitch** | **4.00** | bodies meet flush; the pegs overlap underneath |
| Peg (connector tongue) length | 0.20 per end | planes y = −4.2/−4.17/−4.1 and mirrored |
| Peg taper (across run) | 0.30 → 0.2414 → 0.10 | cross extents at 0.10 / 0.03 / 0.00 from the end |
| Peg thickness | 0.05 (z −1.00…−0.95) | z extents on the peg planes |
| Overall width | 1.00 (x −0.50…+0.50) | extents |
| Asphalt band width | 0.60, centred | up-face areas: asphalt 2.40 / 0.80 kerb over a 4.00 × 1.00 top |
| Kerb strip width | 0.20 per side | as above |
| Road surface height | z = −0.70 | top plane |
| Body base | z = −1.00 | bottom plane (slab thickness 0.30) |
| Triangles | 304 | measured |

So one junction arm must present, at the pitch line 4.00 from the junction
centre: a 1.00 × 0.30 body end plus a 0.20 × 0.05 tapering peg, and a 0.60-wide
asphalt band centred with 0.20 kerbs either side.

## Seating frame (the anti-pattern the skill warns about)

The kit has **two different seating frames**:

| Piece family | Base plane (z) | Road surface (z) |
| --- | --- | --- |
| Connectable track (`…-straight`, `…-curve`, `…-corner-small`) | **−1.00** | −0.70 |
| Plain tile (`track-road-narrow`) | **0.00** | +0.30 |
| Vehicle (`vehicle-racer`) | **0.00** (wheels) | 0.45 tall |

Both families draw the same 0.30-thick slab, 1.00 apart in height. Placing a
connectable piece naively puts its surface 0.70 *below* the world floor and its
body a full unit under the ground; it needs a **+1.00 kit-unit lift** to share
the tile family's ground plane.

Consequence for wiring (recorded here so the renderer task cannot miss it): the
track base sits on the ground (y = 0), the road surface lands at y = +0.30, and
**a vehicle must ride at +0.30, not 0**, or it sinks into the asphalt. The
authored T-junction must sit in the connectable family's frame (base z = −1.00)
so it inherits the same lift as the straights it joins.

`corner-small` turns within 2.70 × 2.70 rather than 4.00, which confirms the kit
is pegged toy track rather than a rigid square grid: neighbouring pieces are
joined by their own pegs and their bodies meet, so an authored piece only has to
honour the pitch and the arm profile, not a global cell size.

## Palette texels to reuse (512 × 512 `colormap`, sRGB PNG)

Colors below are Blender's linear samples, listed for sanity; the **texel
coordinates are the contract**, because the new piece must be pixel-identical to
the family and reuses the same palette image.

| Role | Texel | u, v | Linear rgb | Where the kit uses it |
| --- | --- | --- | --- | --- |
| Asphalt | (112, 12) | 0.2188, 0.0234 | 0.353, 0.376, 0.471 | road band (largest up area) |
| Kerb / light edge | (304, 12) | 0.5938, 0.0234 | 0.757, 0.757, 0.847 | flanking strips, piece underside |
| Marking white | (304, 115) | 0.5938, 0.2246 | 0.973, 0.973, 0.984 | 0.40 area of up-facing detail |
| Accent orange | (304, 243) | 0.5938, 0.4746 | 0.980, 0.420, 0.255 | 0.40 area of up-facing detail |
| Side warm | (304, 174) | 0.5938, 0.3417 | 0.871, 0.357, 0.290 | side faces |
| Side light | (304, 46) | 0.5938, 0.0917 | 0.820, 0.820, 0.886 | side faces |
| Underside warm | (304, 140) | 0.5938, 0.2754 | 0.827, 0.333, 0.306 | downward faces (largest) |
| Underside dark | (176, 12) | 0.3438, 0.0234 | 0.243, 0.255, 0.302 | recessed underside detail |

Style read: a dark blue-grey asphalt band, light blue-grey kerbs and bevels,
warm orange sides and underside, near-white and orange accents — a chunky
plastic toy piece, no gradients, no texture beyond flat swatches.

## Occupant (for clearance, not the mount)

`vehicle-racer`: 0.525 wide × 0.875 long × 0.45 tall, 1,076 triangles, wheels
resting at z = 0. A junction is flat, so no overhead clearance applies; the
number matters for lane width only, and 0.875 of car against a 1.00-wide piece
(0.60 asphalt) is the kit's own scale statement — the car nearly fills the road,
which is the look to preserve.

## Open question carried into authoring

The straight's up-facing detail includes 0.40 area of marking white and 0.40 of
accent orange, which the plane data does not localise. The first Blender render
of the kit's straight (Phase 3 reference render, doubled as the style gate's
accepted neighbour) will show where those sit, before the T-junction's surface
detail is finalised.
