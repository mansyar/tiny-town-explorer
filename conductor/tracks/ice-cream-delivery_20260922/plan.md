# Plan: Ice Cream Delivery Mission

## Phase 1 – Mission logic (TDD)

- [ ] Task: Ice-cream order FSM (mirrors fire `idle→spawned→driving→active→complete`)
  - [ ] Write failing tests for spawn/respond/serve/update, patient-forever spawn, drive-away disarm, single-serve → complete + 2.5s linger → idle
  - [ ] Implement to pass (new `iceCreamMission.ts` or parallel manager; `SERVE_RANGE = 1.9`)
  - [ ] Refactor + coverage (>80% logic module)
- [ ] Task: Order pacer (60–90s calm gap, ≥2-unit separation, never same house twice)
  - [ ] Write failing tests (gap range, busy pauses, house-distance preference + fallback)
  - [ ] Implement to pass (`iceCreamPacer.ts` mirroring `firePacer.ts`)
  - [ ] Refactor + coverage
- [ ] Task: Shared busy gate (fire ⇄ ice-cream mutual exclusion)
  - [ ] Write failing tests (either mission busy pauses both pacers; spawn rejected while busy)
  - [ ] Implement to pass (caller-owned `busy` helper or pacer coordination)
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 – Serve-gating rules (TDD)

- [ ] Task: Jingle-then-serve gating
  - [ ] Write failing tests (serve available only when: ice-cream truck active + jingled since spawn + within serve range; morphing away abandons jingle; re-jingle re-arms)
  - [ ] Implement to pass (vehicle/mission glue, reuses `iceCream` cast `jingle` + `cones`, burst untouched since `seconds: 0`)
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 – Order signal + celebration visuals (manual-verify, exempt from TDD)

- [ ] Task: Ordering-house marker (bouncing cone + music-note, 48px readable, 72px tap target on house unchanged)
  - [ ] Implement marker + spawn/despawn with FSM; record manual verification steps
- [ ] Task: Serve affordance (target ring when armed) + serve FX (cone handoff poof)
  - [ ] Implement; record manual verification steps
- [ ] Task: Celebration (reuse confetti + cheer + sun FX, single-serve beat)
  - [ ] Wire to `complete`; record manual verification steps
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 – Wiring (mixed: logic TDD, glue manual)

- [ ] Task: `main.ts` integration (spawn/respond/serve/update tick, serve-range distance, jingle cue scheduling)
  - [ ] Write failing tests for tick wiring decisions (logic parts only); implement; manual-verify spawn → jingle → drive → serve → celebrate
- [ ] Task: Input routing (tap ordering house = respond when `spawned`, serve when `active` + armed; tap truck ability = jingle; newest-wins preserved)
  - [ ] Tests for routing decisions; implement; manual-verify on touch
- [ ] Task: Helper-hand reuse (10s idle → trace + demo tap on ordering house, cooldown ≥10s)
  - [ ] Tests for `missionActive` + `destination` wiring; implement; manual-verify
- [ ] Task: Audio (spawn jingle cue once, serve `gulp`-or-`cheer` pairing per sound+visual rule, mute/cap respected)
  - [ ] Implement; manual-verify with sound on/off
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 – Verification + docs

- [ ] Task: Full gates (`pnpm check`, `pnpm typecheck`, `CI=true pnpm test`, coverage >80% logic)
- [ ] Task: Device pass (signal → jingle → drive → serve → celebrate → calm gap; fire ⇄ ice-cream never overlap; 10s helper demo)
- [ ] Task: Update `docs/playtest.md` with AC1–AC7 results
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
