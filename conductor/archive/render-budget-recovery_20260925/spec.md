# Track: Render Budget Recovery

- **Type:** Performance Refactor
- **Status:** Approved
- **Branch:** `track/render-budget-recovery`

## Overview

The second district's current fresh-spawn measurement is **56,232 triangles / 237 draw calls**, exceeding the project's approximately **50,000-triangle heuristic**. The iPad sitting currently feels smooth, but the overage is a documented performance risk and was explicitly deferred by the previous controller-extraction track.

This track reduces the measured render cost without removing visible town content or changing the child-facing experience.

The work begins with a controlled investigation of camera-only/progressive rendering. three.js already performs frustum culling by default, and this repository has no explicit `frustumCulled = false`, so custom visibility filtering must be measured rather than assumed. If that approach is insufficient, the implementation may use behavior-preserving rendering optimizations such as reducing redundant draw work, merging compatible static geometry, or tightening shadow/render passes.

## Context

- The game is a Vite + TypeScript + three.js PWA with direct WebGL rendering.
- `src/main.ts` owns the browser edge; `src/game/game.ts` owns the controller and frame.
- The camera is a fixed orthographic rig that follows the active car.
- The sun shadow frustum already follows the car and is texel-snapped.
- The town currently contains six parked cars and three wandering civilian cars.
- The current representative measurements are recorded in `docs/playtest.md` and `conductor/tech-stack.md`.

## Goals

1. Make the worst documented fresh-spawn window at or below 50,000 triangles using the established measurement method.
2. Do not increase draw calls as a trade for lower triangle counts.
3. Preserve the current town lineup, art, missions, traffic, camera feel, and input behavior.
4. Establish a repeatable measurement trail for future rendering changes.

## Functional Requirements

### FR1 — Reproducible performance baseline

- Measure representative fresh-spawn, transit-peak, settled-junction, mission-active, and traffic-active views.
- Use the existing `renderer.info.render` method, including the shadow pass and consistent camera/pixel-ratio conditions.
- Record triangles, draw calls, visible mesh count, and the exact scene/camera state.
- Do not compare against a different counting method or cherry-pick a quiet frame.

### FR2 — Camera visibility investigation

- Verify that ordinary town, vehicle, effects, and shadow objects participate in three.js frustum culling.
- Measure whether objects outside the current orthographic camera window are already excluded.
- Investigate incorrect or oversized bounds, disabled culling, and unnecessary shadow-pass work.
- A custom camera-visibility layer is allowed only if measurements show a meaningful benefit.
- Any custom visibility scheme must avoid per-frame whole-town traversal costs that could erase the gain.

### FR3 — Minimal behavior-preserving optimization

- Select the smallest optimization that closes the measured gap.
- Prefer implementation-level techniques such as merging compatible static geometry, reducing redundant draw calls, removing unnecessary shadow casters or duplicate render work, and other equivalent rendering changes.
- Preserve the current six parked cars, three wanderers, four playable vehicles, current art, mission markers, pond, traffic, shadows, and route behavior.
- Do not solve the problem by deleting visible town content or reducing traffic.

### FR4 — Visual and gameplay continuity

- No visible popping or disappearing as the camera crosses the town.
- Mission targets, paw/heart/order/litter markers, traffic, pond effects, and target rings remain visible whenever their gameplay state requires them.
- Existing marker draw-order exceptions and shadow semantics remain unchanged.
- Camera follow order, frame order, input routing, collision behavior, and mission behavior remain unchanged.

### FR5 — Frame-budget contract

- The worst documented fresh-spawn window measures **at or below 50,000 triangles**, using the established counting method.
- No representative window materially regresses in triangles or draw calls.
- Draw calls do not increase as a trade for lower triangle counts.
- Final before/after measurements are recorded honestly in `conductor/tech-stack.md` and `docs/playtest.md`.

### FR6 — Verification and quality gates

- Add repeatable measurement/diagnostic support without shipping a debug overlay to children.
- Logic-bearing changes follow the project's TDD workflow.
- Existing `pnpm check`, `pnpm typecheck`, `CI=true pnpm test`, and production build gates remain green.
- The final result receives a desktop playthrough and an iPad 9th-generation device pass.

## Non-Functional Requirements

- No new text, persistence, missions, or written UI.
- No new runtime dependency or asset pack.
- Offline PWA behavior and precache completeness remain valid.
- No tech-stack change without updating `conductor/tech-stack.md` first and explaining the deviation.
- Resource ownership and disposal remain correct.
- Performance measurements must be reproducible by another contributor.

## Acceptance Criteria

1. A baseline report identifies the current worst window and its contributors.
2. The camera-only/culling experiment reports whether built-in culling already handles the proposed case and whether custom visibility provides measurable benefit.
3. The final worst window is **at or below 50,000 triangles** with no draw-call regression.
4. The town retains its current six parked cars, three wanderers, art, missions, and traffic behavior.
5. No mission marker, shadow, pond effect, or traffic object disappears or pops at the camera boundary.
6. Existing gameplay, input, camera, collision, audio, and offline behavior remain intact.
7. `pnpm check`, `pnpm typecheck`, `CI=true pnpm test`, and `pnpm build` pass.
8. Desktop and iPad 9th-generation verification are recorded, including before/after measurements.
9. The live technical ledger and playtest documentation reflect the actual shipped result.

## Out of Scope

- New missions, a third district, or a second park.
- Removing parked cars or wanderers.
- Lower-detail replacement of visible vehicles or changes to their art direction.
- First-load bundle splitting, PWA installation redesign, or service-worker strategy.
- Camera gestures or new player controls.
- Persistence or a sticker board.
- Unrelated cleanup of the controller or mission dependency cycle.

## Design Notes

- three.js frustum culling is a hypothesis to verify, not a new assumption to build on.
- The primary target is the render budget, not perceived smoothness alone; the iPad pass remains a separate user-facing gate.
- The implementation must be allowed to conclude that manual camera visibility is unnecessary if profiling proves built-in culling already provides the available win.
