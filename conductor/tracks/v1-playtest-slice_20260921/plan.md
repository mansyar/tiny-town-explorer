# Implementation Plan: v1 Playtest Slice (MVP)

> Track: v1-playtest-slice_20260921 · Spec: `spec.md` (this track) ·
> Workflow: `conductor/workflow.md` · TDD scope: logic-bearing modules
> only (Red→Green tasks); visual/scene/asset work records manual
> verification intent in its task summary.

## Phase 1 — Project Scaffold & Toolchain

- [x] Task: Initialize Vite 8 + TypeScript 7 strict project with pnpm 12.4 [e12ea79]
    - [ ] package.json with `packageManager` field (corepack), deps:
          three, vite, vite-plugin-pwa, vitest, @biomejs/biome
    - [ ] tsconfig strict, vite.config.ts, index.html shell (touch-action
          none, theme #87CEEB), .gitignore
    - [ ] Scripts: dev / build / preview / check / typecheck / test
    - [ ] Verify peer ranges (vite-plugin-pwa vs Vite 8, Vitest 5 vs
          Vite 8); if deviation, STOP → update tech-stack.md with dated
          note (workflow rule 7)
- [x] Task: Configure Biome 2.5 + Vitest 5 (biome.json, vitest.config.ts) [23e1871]
- [x] Task: vite-plugin-pwa skeleton — manifest (standalone, orientation
      any, 192/512 placeholder icons), autoUpdate registration [3c41783]
- [x] Task: Render-loop smoke test — three.js scene boots, empty town
      ground renders in dev and preview builds [d6df284]
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 — Town Data, World & Camera

- [ ] Task: TDD TownGrid module (Red→Green)
    - [ ] Test: typed map constants parse into tile grid, lots, props,
          spawn points from a single hand-authored 6×6 layout
    - [ ] Test: adjacency queries (tile neighbors, lot lookup by point,
          props by proximity radius)
- [ ] Task: Render town from data — Kenney track tiles as road grid,
      houses on lots, park corner, hydrants/poles (visual; manual verify:
      layout matches authored map, no z-fighting)
- [ ] Task: CameraRig — orthographic ~45° tilt, medium framing (car ≈15%
      of viewport height), smooth follow, frustum refit on any
      orientation/resize (manual verify on portrait + landscape)
- [ ] Task: Asset pipeline — download/commit Kenney Toy Car Kit + City
      Kit (Suburban) GLBs, GLTF loader with shared material setup,
      measure initial triangle count (start ~50k budget)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 — Input & Tap-to-Move

- [ ] Task: TDD InputRouter (Red→Green)
    - [ ] Test: newest-tap-wins command supersession (mash safety)
    - [ ] Test: dead-zone classification (<0.5u → bounce-and-honk
          event, no path emitted)
    - [ ] Test: tap-to-prop snapping (within snap radius)
    - [ ] Test: ground-plane raycast projection
- [ ] Task: TDD Pathfinder (Red→Green)
    - [ ] Test: tile adjacency/BFS route over road grid
    - [ ] Test: nearest-road-point snap for grass taps
    [ ] Test: road-hop-then-grass path composition (waypoints + grass
          leg)
- [ ] Task: VehicleMotor waypoint follower — rotate-then-drive, constant
      speed, arrival radius (logic; extend TDD tests: arrival, rotation
      easing determinism)
- [ ] Task: Expanding target ring + drive feel polish (visual; manual
      verify: instant ring, smooth turn, constant speed)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 — Collisions: Bounce & Resume

- [ ] Task: TDD collision resolution (Red→Green)
    - [ ] Test: hitboxes derived from TownGrid map data
    - [ ] Test: circle-vs-AABB sweep along path → bonk event
    [ ] Test: auto-resume — after bonk, car still reaches original
          target (no stuck state)
- [ ] Task: Squish animation, bonk sound, bounce-back offset (visual;
      manual verify: comedic squash, no snag)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 — Vehicles & Abilities

- [ ] Task: TDD VehicleSystem (Red→Green)
    - [ ] Test: four-vehicle registry, active-vehicle switching state
    - [ ] Test: per-vehicle ability one-shot dispatch (spray burst,
          jingle+cones, gulp, siren) as typed events
    - [ ] Test: engine-loop pitch mapping (speed→playbackRate curve)
    - [ ] Test: burst audio scheduling (1–2s one-shots, interruptible)
- [ ] Task: AudioEngine — first-tap unlock, mute node, kid-safe gain
      cap, CC0 one-shot loading, oscillator jingle (jingle note
      scheduling covered by test above; wiring manual)
- [ ] Task: HUD vehicle switcher — 4 buttons ≥72px, active highlight
      (visual; manual verify with touch)
- [ ] Task: Poof morph + ability visuals — droplets, floating cones,
      star particles, siren flash (visual; manual verify)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6 — Fire Mission (FSM, Pacing, Effects)

- [ ] Task: TDD MissionManager FSM (Red→Green)
    - [ ] Test: IDLE→SPAWNED→DRIVING_TO_MISSION→ACTIVE→COMPLETE
          transitions and illegal-transition guards
    - [ ] Test: tap-to-swap morph trigger; proximity-reveal guard for
          hose button
    - [ ] Test: burst counter (3–4 taps → extinguished)
- [ ] Task: TDD fire pacing (Red→Green)
    - [ ] Test: calm-gap spawn timer (60–90s randomized)
    - [ ] Test: next house ≥2 houses from previous (map-aware choice)
    - [ ] Test: no spawn while mission active
- [ ] Task: TDD helper-hand idle logic (Red→Green): 10s inactivity
      mid-mission → single demo-tap event + ≥10s cooldown
- [ ] Task: Fire visuals — smoke puffs, flame mesh shrinking per burst,
      confetti + smiling sun, alarm chime, hose button (visual; manual
      verify full mission on tablet)
- [ ] Task: Helper hand trace animation (visual; manual verify timing)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 7 — HUD, Parent Panel & Polish

- [ ] Task: TDD hold-gate logic (Red→Green): 3s continuous hold → open
      event; release early → cancel; repeat fires only once
- [ ] Task: Parent panel UI — textless toggles (SFX, music, helper
      hand), attribution behind gate (visual; manual verify)
- [ ] Task: Mute button + add-to-home-screen animated hint, one-time
      per session (visual; manual verify)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 8 — PWA, Cloudflare Pages & Playtest Hardening

- [ ] Task: Finalize manifest + real 192/512 icons from Kenney art
- [ ] Task: Cloudflare Pages runbook (docs/cloudflare-pages.md): git
      connect steps, build command `pnpm build`, output `dist`; first
      deploy verified (manual)
- [ ] Task: Offline verification — load once, airplane-mode reload
      fully playable (manual)
- [ ] Task: Performance profile on iPad-class device — fps + triangle
      count measured; ratchet budget down only if needed; record
      numbers in tech-stack.md (manual)
- [ ] Task: Acceptance-criteria sweep (spec AC1–AC10) + fallout fixes
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) —
      includes playtest-link handoff
