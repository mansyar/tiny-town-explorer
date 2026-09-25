# Implementation Plan: Render Budget Recovery

## Scope Guardrails

- Preserve the current six parked cars, three wanderers, four playable vehicles, art, missions, traffic, camera feel, and input behavior.
- Measure before optimizing; do not assume custom camera visibility is better than three.js frustum culling.
- Prefer behavior-preserving rendering changes over removing visible content.
- No new missions, district, persistence, sticker board, runtime dependency, or asset pack.

## Phase 1 — Baseline and culling evidence [checkpoint: 5e94020]

- [x] Task: Establish a reproducible render-measurement contract `cc4afed`
  - [x] Write failing tests for the logic that classifies and records a measured render window, including camera state, shadow-pass inclusion, triangles, and draw calls.
  - [x] Implement the smallest non-production measurement helper or dev-only harness needed to collect the existing `renderer.info.render` data.
  - [x] Measure fresh-spawn, transit-peak, settled-junction, mission-active, and traffic-active states using one consistent method.
  - [x] Record the baseline, command, viewport assumptions, and scene-state differences in the track artifacts.
- [x] Task: Investigate camera-only and built-in frustum culling `5e94020`
  - [x] Verify the current scene's culling behavior and object bounds; confirm there are no hidden `frustumCulled` exceptions.
  - [x] Compare total scene inventory with objects actually submitted in the camera and shadow passes.
  - [x] Run a controlled manual-visibility experiment only if the baseline shows culling is not already handling the dominant cost.
  - [x] Reject any approach that adds per-frame traversal or causes visible popping, marker disappearance, or shadow discontinuity.
  - [x] Record the result and select the smallest viable optimization lever.
- [x] Task: Record the selected rendering strategy `5e94020`
  - [x] Document why the selected lever is preferable to deleting visible cars, traffic, or art.
  - [x] Update `conductor/tech-stack.md` before implementation if the chosen design changes the recorded rendering approach.
  - [x] Task: Phase Verification & Checkpoint (Refer to `workflow.md`) [checkpoint: `5e94020`]

## Phase 2 — Minimal behavior-preserving optimization [checkpoint: 5e94020]

- [x] Task: TDD the chosen optimization contract `5e94020`
  - [x] Write failing tests for any logic-bearing visibility, grouping, merge, shadow-caster, or draw-work rules.
  - [x] Run the tests and confirm the expected red phase before implementation.
  - [x] Implement the minimum code needed to satisfy the approved contract.
  - [x] Run the focused tests green, then refactor and verify coverage remains above the project threshold.
- [x] Task: Integrate the optimization with the existing scene `5e94020`
  - [x] Preserve the current six parked cars, three wanderers, four playable vehicles, town art, mission markers, pond, and shadows.
  - [x] Preserve camera follow/frame ordering, input routing, collision, traffic, mission, and audio behavior.
  - [x] Verify resource ownership, cloning, teardown, and disposal for any changed scene objects.
  - [x] Re-measure all representative windows; confirm the worst fresh-spawn window is at or below 50,000 triangles and draw calls do not increase.
- [x] Task: Phase Verification & Checkpoint (Refer to `workflow.md`) [checkpoint: `5e94020`]
  - [x] List changed code files and verify required test coverage for each.
  - [x] Announce and run the exact automated test command.
  - [x] Present the detailed desktop manual-verification plan and wait for explicit user feedback.
  - [x] Attach the verification report to the final functional commit with Git notes.

## Phase 3 — Full player and release verification

- [x] Task: Run automated quality gates
  - [ ] Run `pnpm check`.
  - [ ] Run `pnpm typecheck`.
  - [ ] Run `CI=true pnpm test`.
  - [ ] Run `pnpm build` and verify the PWA output remains complete and offline-capable.
- [ ] Task: Complete the desktop gameplay sweep
  - [ ] Verify spawn, transit, and junction rendering windows.
  - [ ] Drive through all four missions with the existing traffic and parked cars.
  - [ ] Confirm camera edges, markers, pond effects, target rings, bonks, shadows, and newest-tap behavior.
  - [ ] Record before/after measurements and any visual differences.
- [ ] Task: Complete the iPad 9th-generation pass
  - [ ] Load the built/previewed app and check first-load behavior.
  - [ ] Drive both districts and all four missions.
  - [ ] Check the busiest spawn/transit moments for stutter and confirm the game remains calm and responsive.
  - [ ] Rotate the device and confirm safe areas, HUD placement, and camera framing.
  - [ ] Confirm the game still plays after going offline.
- [ ] Task: Finalize the technical record
  - [ ] Update `conductor/tech-stack.md` with the shipped before/after figures and the selected lever.
  - [ ] Update `docs/playtest.md` with desktop and device verdicts.
  - [ ] Reconcile any build/precache figures changed by the track.
  - [ ] Task: Phase Verification & Checkpoint (Refer to `workflow.md`)
  - [ ] Commit the final plan status and attach the auditable verification report.

## Workflow Notes

- Every logic-bearing implementation task follows Red → Green → Refactor.
- Scene, visual, asset, and UI changes are manually verified as required by `conductor/workflow.md`.
- Each task follows the standard commit, Git-note, plan-status, and plan-update lifecycle.
- Phase verification pauses for explicit user feedback before a phase checkpoint is finalized.
