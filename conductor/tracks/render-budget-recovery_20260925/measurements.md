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

- The headless browser reported an unrelated `Unable to decode audio data` console message while loading the audio samples; it did not prevent WebGL rendering or the measurement probe.
- The probe is development-only and exposes no child-visible UI.
