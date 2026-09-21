# Track Spec: v1 Playtest Slice (MVP)

## Overview
Build the complete, deployable v1 playtest slice of Tiny Town Explorers
defined in conductor/product.md: an offline-first 3D toy-car sandbox PWA
for ages 3–5, ready for a real-kid playtest via a public Cloudflare Pages
URL. Architecture follows modular managers over plain TypeScript with
direct three.js (no frameworks); the town is hand-authored typed map data;
assets are real Kenney CC0 kits from day one.

## Functional Requirements

**FR1 — Project scaffold:** Vite 8 + TypeScript 7 strict + pnpm 12.4
(corepack-pinned); Vitest 5, Biome 2.5, vite-plugin-pwa 1.3; scripts
`dev / build / preview / check / typecheck / test`; clean build and
precache manifest from the first commit.

**FR2 — Town:** 6×6 toy-track tile grid (road network = pathing graph)
with ~10–14 house lots, a park corner, and crashable props (hydrants,
poles) — all defined as typed TypeScript map constants and rendered from
data via Kenney GLBs.

**FR3 — Tap-to-move:** raycast against the infinite ground plane;
newest-tap-wins pointer handling; expanding target ring on tap; 0.5-unit
dead-zone → bounce & honk; road-hop pathing (grid search over tiles) then
obstacle-aware straight-line final stretch over grass; smooth turn +
constant-speed drive.

**FR4 — Collisions:** hitboxes from map data for buildings/props;
bounce-and-resume response — squish animation, bonk sound, brief
bounce-back, auto-resume to the original target. No stuck states, ever.

**FR5 — Vehicles:** four drivable vehicles (fire, ice cream, garbage,
police) switchable via HUD buttons (≥72px targets); tap-to-swap poof
morph; per-vehicle ability one-shots (spray burst, jingle + floating
cones, gulp, siren boop + star particles); speed-pitched engine loops.

**FR6 — Fire mission:** FSM (IDLE → MISSION_SPAWNED → DRIVING_TO_MISSION →
MISSION_ACTIVE → MISSION_COMPLETE); fire spawns at a random house ≥2
houses from the previous one after a 60–90s calm gap; smoke + flame
visuals + alarm chime; tapping the house/bubble pans the camera and
morphs the active car into the fire truck; proximity reveals the hose
button; each tap fires a 1–2s spray burst (3–4 bursts extinguish, flames
shrink per tap, burst interruptible by driving away); confetti + smiling
sun resolution.

**FR7 — Helper hand:** after 10s of inactivity mid-mission, a hand traces
the route and performs one demo tap, then waits 10s+ before repeating.

**FR8 — Audio:** Web Audio with first-tap unlock; corner mute icon;
kid-safe master gain cap; synthesized ice-cream jingle (oscillators);
CC0 one-shots; every sound paired with a visual counterpart.

**FR9 — HUD & parent panel:** vehicle buttons, mute button; hold-3s
filling-ring gate opens a zero-text parent panel (SFX/music toggles,
helper-hand toggle, attribution behind the gate).

**FR10 — Camera:** fixed orthographic ~45° tilt tracking the active car;
medium framing (car ≈15–20% of viewport height, next 2–3 houses visible);
frustum refits to any orientation/resize.

**FR11 — PWA & deploy:** manifest (standalone, theme #87CEEB,
orientation any, 192/512 icons); workbox precache via vite-plugin-pwa;
one-time animated add-to-home-screen hint for parents; git-connected
Cloudflare Pages auto-deploy from main.

**FR12 — Assets:** Kenney Toy Car Kit + City Kit (Suburban) GLBs
committed and optimized; shared texture/material setup per product
guidelines.

## Non-Functional Requirements
- **Performance:** start with a generous triangle budget (~50k), profile
  on iPad-9th-gen-class hardware, ratchet down only on measured need;
  60fps target; ≤100ms visible feedback for every touch.
- **Zero text** anywhere in-game; **zero persistence**.
- **TDD scope (workflow.md):** pathfinding, input resolution, FSM,
  mission pacing, and audio scheduling are test-first; scene/asset/
  visual code is manual-verified.
- **Quality gates:** biome clean, `tsc --noEmit` strict, no lint errors.

## Acceptance Criteria
1. On an iPad-class tablet via the Cloudflare Pages URL: page loads,
   first tap unlocks audio.
2. Tapping anywhere routes the car roads-first then grass; mash-tapping
   never stalls or confuses it.
3. All four vehicles drive with distinct abilities and engine voices.
4. A fire mission completes end-to-end without adult help; fires migrate
   around town with calm gaps.
5. Every collision auto-resumes; no stuck, no penalty, no failure state.
6. Helper hand demos one tap after 10s idle mid-mission.
7. Parent panel opens only via hold-3s gate; toggles work; panel is
   textless.
8. PWA installs to home screen and plays fully offline after first load.
9. `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` all green.
10. Logic modules (pathfinding, input, FSM, pacing) at ≥80% coverage.

## Out of Scope
- Missions 2–4 (ice cream delivery, park cleanup, lost puppy) — only
  their free-play ability one-shots exist in v1.
- AI or parked traffic cars; any save/persistence; in-game text;
  app-store packaging; volume slider (mute + cap only); camera gestures.
