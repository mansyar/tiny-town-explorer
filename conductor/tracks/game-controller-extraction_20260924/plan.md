# Plan: Game Controller Extraction

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> **(characterization)** = pins existing behaviour green-by-construction — the
> tests must pass before *and* after a move, so there is no red phase.
> Every phase ends with the workflow's verification and checkpoint protocol.
>
> `main.ts` deliberately has no unit-test twin: its behaviour is pinned by the
> Phase 1 characterization harness (AC3), and every rule it used to hold moves
> into `game.ts` under `game.test.ts`. At each phase checkpoint, treat the
> harness as `main.ts`'s corresponding test file.

## Phase 1 - Recording seam and characterization goldens (characterization)

- [ ] Task: Narrow port interfaces and in-place adapters (FR2, NFR3)
  - [ ] Declare `GameAudio`, `GameHud`, `GameScene` and `GameCamera` in `src/game/game.ts` — types only, each declaring just the members the controller will call (FR2)
  - [ ] Build adapter objects in `main.ts` over the concrete collaborators and re-point the existing inline calls through them; no logic moves, no behaviour change (manual-verify: the dev server plays exactly as before through all four missions)
- [ ] Task: Characterization harness over the port boundary (NFR3, AC3)
  - [ ] Drive `advance(delta)` frame by frame with scripted taps and ability presses in the real render loop — headless Chromium at the dev server, the method every prior desktop pass used
  - [ ] Record ordered side effects through recording adapters: audio calls, HUD calls, scene adds and removes, mission state transitions
  - [ ] Cover `absorb`, `swapVehicle`, the ability path, `tickHelperHand`, the puppy door run, and the pre-mount boot window
  - [ ] Capture and commit the goldens from today's behaviour
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 - Litter field disposal contract (TDD)

- [ ] Task: `LitterField.dispose()` and the replacement call (FR7, AC4)
  - [ ] Write failing tests in `parkLitterFx.test.ts`: `dispose()` releases every geometry and material the field allocated; a disposed field is never updated; `startPark()`'s replacement path calls `dispose()` on the outgoing field (red first)
  - [ ] Implement `dispose()` on `LitterField` and call it from `startPark()` before the `scene.remove`
  - [ ] Refactor + coverage (the primitives stay workflow-exempt visual code; the disposal contract itself covered at 100%)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 - `createGame()` and world ownership (TDD)

- [ ] Task: `createGame()` skeleton, deps and live boot window (FR1, FR3, FR4)
  - [ ] Write failing tests in `game.test.ts`: `createGame()` returns a usable game without awaiting; `advance(delta)` is safe before mounting resolves and holds the pre-mount guards; the world (model library, town, vehicle motor and actors, traffic, pond, shadows, every mission subsystem and feedback object) is owned inside; the `scene` port is used for `add`/`remove` only (red first)
  - [ ] Implement `createGame()` over the grouped narrow ports, moving world construction and async mounting inside
  - [ ] Refactor + coverage (>80% statements and branches on `game.ts`)
- [ ] Task: Camera and shadow-sun frame ordering (FR5, AC5)
  - [ ] Write failing tests: the camera target is set inside the vehicle frame and `rig.update` runs after the game frame; `followSun` keeps its slot so the shadow map stays texel-still; the HUD ability-busy edge fires exactly as today (red first)
  - [ ] Implement that ordering through the `camera` port
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 - Mission and frame orchestration (TDD)

- [ ] Task: Move the mission ticks and the pacers (FR1)
  - [ ] Write failing tests: `tickMissions`/`tickPacers` and the four per-mission ticks run in the registry's stable pass order; the shared calm gap and the never-twice rule hold; a busy mission pauses every pacer (red first)
  - [ ] Move `tickMissions`, `tickPacers`, `tickFireMission`, `tickOrderMission`, `tickParkMission`, `tickPuppyMission` and the registry contributions into `game.ts`
  - [ ] Refactor + coverage
- [ ] Task: Move the pickup, spawn and helper rules (FR1)
  - [ ] Write failing tests: `absorb` keeps the rule that the first drive-over piece responds the mission and morphs the fleet, that a sweep voices one gulp for the group, and that completion fires exactly once at the last piece; `startPark`/`startPuppy`/`lightFire`/`lightOrder` open a round atomically; `tickHelperHand` demos exactly one tap then cools down (red first)
  - [ ] Move `absorb`, `nearestLitterPoint`, `distanceToLitter`, `ownerPoint`, `serveArmedNow`, `firePoint`, `distanceToFire`, `orderPoint`, `distanceToOrder`, `startPark`, `startPuppy`, `lightFire`, `lightOrder`, `tickHelperHand`, `demoSiren` into `game.ts`
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 - Ability, morph, puppy and tap surface (TDD)

- [ ] Task: Move the ability and morph path (FR1, FR3)
  - [ ] Write failing tests: `pressAbility` dispatches each vehicle's cast, arms serve on a jingle, and counts a hose burst only when the hose is in reach; `onSirenCast` latches the puppy's answer exactly once; `activate`/`swapVehicle` build the replacement before removing the old one so no frame is empty (red first)
  - [ ] Move `pressAbility`, `applyAbilityEvent`, `onSirenCast`, `activate`, `swapVehicle` into `game.ts`
  - [ ] Refactor + coverage
- [ ] Task: Move the tap surface and the puppy delivery (FR6)
  - [ ] Write failing tests: `tapAt(target, aim)` answers missions against the **aim** and drives to the **target**, so a cone beside an ordered house cannot steal a serve nor a hydrant beside a burning one the hose; `honk(at)` and the activity reset sit on the same surface; `deliverPuppy` hops out, runs to the door, then celebrates (red first)
  - [ ] Move `tapAt`, `answerMissions`, `deliverPuppy`, `advanceDoorRun`, `clearPuppyStage`, `headToGarbageTruck` into `game.ts` and expose the tap surface to `main.ts`
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6 - `main.ts` thinning, freeze proof and docs (mixed)

- [ ] Task: Thin `main.ts` and move env reads to the edge (FR8, FR9)
  - [ ] Leave only container lookup, renderer creation, `createScene()`, `createTownGrid()`, camera rig and ResizeObserver, parent panel, hold gate and install hint, input router and DOM listeners, audio construction and first-gesture unlock, and the wiring between them. `import.meta.env.DEV` and `window.location.search` stay here, with `calmGapOverride()` resolved and passed in as data (manual-verify: `?calmGap=2` still shortens the gap in dev)
  - [ ] Confirm `main.ts` lands at roughly 200 lines or fewer and that a search in it for `absorb`, `serveArmedNow`, `deliverPuppy`, `onSirenCast`, `swapVehicle`, `tickPacers`, `tickMissions` returns nothing (AC1)
- [ ] Task: Freeze proof and docs sweep (NFR1, NFR5, AC3, AC6, AC8)
  - [ ] Re-run the characterization harness and diff the goldens — zero drift
  - [ ] Confirm the five frozen suites are green and unmodified beyond forced renames, diff-reviewable (AC6)
  - [ ] Confirm `?calmGap=2` works in dev and a production build carries no trace of it — grep `dist` (AC8)
  - [ ] Update live docs (`README.md`, live `tech-stack.md` prose) to the new shape; leave `docs/playtest.md` and `conductor/archive/*` as written (NFR5)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
