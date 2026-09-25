# Render Baseline and Culling Finding

**Date:** 2026-09-25
**Branch:** `track/render-budget-recovery`

## Method

The dev-only `window.__tteRenderMetrics` probe samples `renderer.info.render` after each WebGL frame. Each named window records:

- triangles and draw calls after the current render, including the shadow pass;
- camera focus at the start of the window;
- zoom, pixel ratio, and shadow-map mode as comparison settings.

The controlled desktop pass used the Vite development server in Chromium at a 1280×720 viewport with device pixel ratio 1. The shadow map was enabled. The mission sample used the existing dev-only `?calmGap=2` override; production pacing was not changed.

## Controlled results

| Window | Samples | Peak triangles | Peak calls | Context |
| --- | ---: | ---: | ---: | --- |
| Fresh spawn | 361 | 53,068 | 235 | DPR 1, shadow pass on |
| Transit peak | 602 | 53,214 | 236 | DPR 1, shadow pass on |
| Settled after transit | 360 | 51,724 | 213 | DPR 1, shadow pass on |
| Dev-paced mission-active | 361 | 57,434 | 251 | DPR 1, shadow pass on, `?calmGap=2` |

The historical 56,232 / 237 figure remains the project’s reference measurement; this report intentionally records a fresh, reproducible browser context rather than mixing counting conditions.

## Culling investigation

The dev inventory at a loaded mission state reported:

```text
meshes:              341
visible in hierarchy: 288
frustumCulled=false:    0
estimated triangles:  47,208
```

A one-second reference render in the same state measured 52,696 triangles and 221 calls. The rendered triangle count is expected to exceed the rough authored estimate because the counter includes the shadow pass. The important findings are:

1. no scene object explicitly disables frustum culling;
2. the renderer submits substantially fewer calls than the visible mesh inventory;
3. three.js view-frustum culling is already doing meaningful work.

## Decision

Do **not** add a custom camera-only visibility layer in this track. The evidence does not show meaningful headroom, and a per-frame manual traversal would add cost and risk camera-edge popping, marker loss, and shadow discontinuity. The next phase should measure a behavior-preserving geometry/draw/shadow lever against this baseline instead.

## Notes

## Shadow-pass candidate investigation

The dev probe also toggled named shadow groups without changing the source. With the normal 8-unit extent, disabling road and non-car prop casters reduced a fresh-spawn sample from 55,150 / 240 to 51,230 / 186. Tightening the extent to 7 was close but remained above the target in some fresh-load windows. A 5.5-unit extent plus the hero vehicle opt-out produced a repeatable margin without removing any scene content.

The selected production changes are:

- road placements: `castsShadow = false`;
- non-car prop placements: `castsShadow = false`;
- hero vehicle actors: `castsShadow = false`;
- `SUN_SHADOW_EXTENT`: `8 → 5.5`.

The visual comparison retained house shadows, vehicle grounding, the shop/pond composition, and the existing parked/traffic blob-shadow language. No road, prop, car, traffic, or mission object was removed.

## Shipped candidate measurements

Measured from the actual source path after the changes, in Chromium at 1280×720 / DPR 1:

| Window | Samples | Peak triangles | Peak calls |
| --- | ---: | ---: | ---: |
| Fresh spawn | 361 | 48,463 | 180 |
| Transit peak | 605 | 46,477 | 176 |
| Settled junction | 361 | 45,797 | 154 |
| Dev-paced mission-active | 361 | 49,080 | 203 |

The headless browser reported an unrelated `Unable to decode audio data` console message while loading the audio samples; it did not prevent WebGL rendering or the measurement probe.
The probe is development-only and exposes no child-visible UI.

## Phase 3 release verification

The final quality-gate run was `pnpm check; pnpm typecheck; $env:CI="true"; pnpm test; pnpm build`: Biome checked 154 files, TypeScript passed, all 851 tests across 67 files passed, and the PWA build generated 49 precache entries / 4,238.99 KiB. The existing JavaScript chunk-size warning was unchanged.

A controlled Playwright/Chromium replay at 1280×720 / DPR 1 reproduced the shipped fresh-spawn result of 48,463 triangles / 180 calls after the authored town and seeded traffic settled. Real road-route windows measured 48,709 / 199, 48,343 / 198, 46,473 / 174, and 41,829 / 132; the recorded settled-junction reference remains 45,797 / 154. The desktop and physical iPad 9th-generation visual/gameplay checks were confirmed by the owner, including all four missions, traffic, parked cars, pond effects, target rings, bonks, shadows, rotation, and airplane-mode offline play.

The production preview service worker controlled the page and a reload succeeded after the preview server was stopped, confirming cache-backed offline startup. The dev-only probe was absent from production.
