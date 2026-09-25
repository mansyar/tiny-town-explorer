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
