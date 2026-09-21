# Spec: Ice Cream Delivery Mission

## Overview

Second mission for Tiny Town Explorers (after the fire FSM in `v1-playtest-slice`). One house orders ice cream, signaled by a bouncing cone + music-note icon (readable at 48px) plus a soft jingle cue. The kid taps the ice-cream truck ability (jingle), drives to the house, taps the house to serve, and gets a confetti + cheer celebration. Single delivery per cycle with a 60–90s calm gap like fire; fire and ice-cream missions never overlap.

## Functional Requirements

- **FR1 – Order signal:** When the mission spawns, the ordering house shows a bouncing cone + music-note icon above it and a soft jingle cue plays once (sound + visual pair, zero text).
- **FR2 – Jingle-then-serve flow:**
  1. Kid taps the ice-cream truck's ability → `jingle` + `cones` events fire (existing free-play cast reused).
  2. Kid drives to the ordering house (tap-to-move, road-hopping, existing motor/path).
  3. Within `SERVE_RANGE` (1.9, same as `HOSE_RANGE`) the serve affordance arms (target ring); tap on the house serves one cone.
- **FR3 – Mission FSM:** `idle → spawned → driving → active → complete`, mirroring `missionManager.ts`:
  - `spawned` waits indefinitely (patient forever, no fail state).
  - Driving away from `active` disarms serve but never cancels the mission (same interrupt semantics as hose).
  - `complete` lingers ~2.5s (confetti + cheer + sun), then returns to `idle`.
- **FR4 – Pacing:** 60–90s randomized calm gap after the previous mission (either kind) goes quiet; never spawns while any mission runs; never picks the house that just ordered (≥2 units away preferred, fallback to any other house — same rules as `firePacer.ts`).
- **FR5 – Mutual exclusion:** Fire and ice-cream share one "mission busy" gate; both pacers pause while either mission is active.
- **FR6 – Helper hand reuse:** 10s idle → route trace + single demo tap on the ordering house, then ≥10s cooldown (`helperHand.ts` unchanged API, new `missionActive` + `destination` wiring).
- **FR7 – Celebration:** Reuse confetti + cheer + sun FX from the fire mission; single-serve so one tap visibly matters.

## Non-Functional Requirements

- **NFR1 – Pillars:** Zero text, zero failure, pure agency, offline-first (no new assets that break precache budget).
- **NFR2 – Performance:** Stays inside the 50k-tris frame budget (current ~37.9k); icon is a low-poly cone + sprite note, no new GLBs.
- **NFR3 – Feedback latency:** Tap → ring/sound ≤100ms; jingle cue on spawn ≤1 frame after state change.
- **NFR4 – TDD scope:** Mission FSM, pacer, serve-gating rules test-first with >80% logic coverage; icon/FX/scene wiring manual-verify per `workflow.md`.
- **NFR5 – Audio:** Reuses `jingle`, `tap`, `cheer`; respects unlock/mute/sound-cap policy.

## Acceptance Criteria

- **AC1:** House with order shows bouncing cone + note icon; jingle cue audible once.
- **AC2:** Ability tap emits jingle + cones; serve arms only when ice-cream truck is active, jingled, and within 1.9 units.
- **AC3:** Tap on ordering house while armed → serve → confetti + cheer + linger → idle.
- **AC4:** Order waits forever; driving away disarms but keeps the order.
- **AC5:** No spawn during fire mission and vice versa; calm gap 60–90s honored.
- **AC6:** Helper hand demos once after 10s idle mid-mission, then cools down.
- **AC7:** `pnpm check`, `typecheck`, `CI=true pnpm test` green; logic coverage >80%.

## Out of Scope

- Multi-drop routes, continuous queues, melting/fail timers.
- New vehicle models, new audio clips, sticker board, traffic/parked cars.
- Persistence of orders across sessions (zero-persistence pillar stands).
- Generalizing `missionManager.ts` beyond a second parallel FSM + shared busy gate (full mission-framework refactor is a later track).
