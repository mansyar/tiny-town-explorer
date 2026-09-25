# Living Town Expansion Measurements

## Pre-change baseline

Captured on 2026-09-25 before implementation changes.

### Browser render method

- URL: `http://127.0.0.1:5173/`
- Runtime: Vite development server
- Browser: local Playwright Chromium 1243, headless capture
- Viewport: 1500 × 1050
- Device scale factor: 1
- Context: orthographic camera zoom 1, shadow pass enabled, focus `(-1.5, -2.5)`
- Capture order: fresh spawn, transit, settled junction, mission window
- No source changes were made during the capture.
- No page errors were reported.

| Window | Samples | Average triangles | Peak triangles | Average calls | Peak calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fresh spawn | 657 | 43,129.14 | 50,541 | 153.85 | 180 |
| Transit | 1,201 | 50,541.00 | 50,541 | 180.00 | 180 |
| Settled junction | 1,200 | 49,588.67 | 50,541 | 177.63 | 180 |
| Mission window | 1,200 | 47,030.43 | 48,453 | 171.47 | 175 |

Scene inventory at the end of the capture:

- Meshes: 317
- Visible meshes: 257
- Estimated triangles: 46,344
- Meshes with `frustumCulled = false`: 0

The representative maximum observed in this capture was 50,541 triangles and 180 draw calls. Post-change measurements must use the same viewport, DPR, shadow context, and capture order for an apples-to-apples comparison.

### Automated quality baseline

All commands completed successfully on the pre-change tree:

| Command | Result |
| --- | --- |
| `pnpm check` | Biome checked 156 files; no fixes |
| `pnpm typecheck` | `tsc --noEmit` passed |
| `CI=true pnpm test` | 67 files, 864 tests passed |
| `pnpm test -- --coverage` | 91.34% statements, 87.91% branches, 92.79% functions, 91.20% lines |
| `pnpm build` | 112 modules; PWA precache 49 entries, 4,240.07 KiB; existing chunk-size warning only |

Relevant traffic coverage at baseline:

- `trafficSystem.ts`: 98.24% statements, 66.66% branches, 94.44% functions, 97.95% lines
- `trafficBrain.ts`: 94.54% statements, 91.42% branches, 100% functions, 94.23% lines
- `trafficShadows.ts`: 97.67% statements, 83.33% branches, 100% functions, 97.61% lines
- `trafficActors.ts`: 0% statements; scene-mounting code without isolated unit coverage

## Comparison rule

After implementation, repeat the same browser capture and report absolute and percentage deltas for each window. Do not accept a result that exceeds the agreed representative budget without an explicit optimization or scope decision.

## Post-change measurement

Captured on 2026-09-25 after the ambient roster shipped, with the same method as the
pre-change capture: 1500 × 1050, DPR 1, zoom 1, shadow pass enabled, same capture
order (fresh spawn, road transit to spawn point 3, settled junction at spawn point 2,
mission window with a fire marker lit). No page or console errors.

### Baseline correction

The pre-change numbers above were captured with a route the camera never left, so
only the fresh-spawn window is comparable as recorded. For a like-for-like
comparison the same capture script was also run against `54f4901` (the merge of the
previous track) in a throwaway detached worktree, and that run is the "baseline
(re-measured)" column below.

| Window | Baseline (recorded) | Baseline (re-measured) | Post-change |
| --- | ---: | ---: | ---: |
| Fresh spawn — triangles / calls | 50,541 / 180 | 50,541 / 180 | 50,553 / 180 |
| Transit — triangles / calls | 50,541 / 180 | 61,259 / 248 | 63,745 / 254 |
| Settled junction — triangles / calls | 50,541 / 180 | 46,742 / 210 | 49,832 / 222 |
| Mission window — triangles / calls | 48,453 / 175 | 48,110 / 213 | 50,868 / 224 |

### Deltas against the re-measured baseline

| Window | Triangle delta | Draw-call delta |
| --- | ---: | ---: |
| Fresh spawn | +12 (+0.02%) | 0 (0.00%) |
| Transit | +2,486 (+4.06%) | +6 (+2.42%) |
| Settled junction | +3,090 (+6.61%) | +12 (+5.71%) |
| Mission window | +2,758 (+5.73%) | +11 (+5.16%) |

Scene inventory, baseline to post-change:

| Metric | Baseline | Post-change | Delta |
| --- | ---: | ---: | ---: |
| Meshes | 317 | 329 | +12 |
| Visible meshes | 263 | 275 | +12 |
| Estimated triangles | 46,344 | 49,428 | +3,084 |
| Meshes with `frustumCulled = false` | 0 | 0 | 0 |

The twelve new meshes are the SUV model (four) plus three merged meshes per
creature. The first pass of this measurement used unmerged creature primitives
(342 meshes, +25 draw calls in the worst window); the creatures now merge their
primitives per material through `mergeGeometries`, which halved the draw-call
cost at identical triangle counts and an identical picture.

### Recorded trade-off

The mission window peaks at 50,868 triangles, 1.7% over the approximately
50,000-triangle guide, and the transit window peaks at 63,745, but the re-measured
baseline for that same transit window is already 61,259 — the overshoot comes from
the route through the denser middle of town, not from the roster. The fresh-spawn
representative window, which is what the guide is anchored to, is unchanged.

Accepted cost of six ambient actors: +12 meshes, +3,084 estimated triangles, and at
most +12 draw calls in the worst window. The alternatives were dropping the SUV or
the creatures, and the specification requires both categories to survive, so the
roster was kept and the creature geometry was optimized instead. Frame rate on the
iPad 9th-generation floor device is the remaining gate for this trade-off.

