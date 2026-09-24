# Plan: Game Controller Extraction

> Phase tags: **(TDD)** = logic-bearing, red-then-green required.
> **(manual-verify)** = visual/asset/UI-glue, exempt from red/green per
> `workflow.md` Guiding Principle 3. **(mixed)** = both inside one phase.
> Every phase ends with the workflow's verification and checkpoint protocol.
>
> Every logic-bearing task is one red/green pair and one commit: the cases are
> written first and confirmed failing, then the move lands and they pass. That
> ordering *is* the freeze proof — each case is derived line-by-line from
> today's `main.ts`, so a move that changes behaviour turns it red.
>
> Phases 2-3 leave a deliberate intermediate surface on `createGame()` (the
> `world` it builds, plus the rule functions already moved) that Phase 4 closes
> to the final `{ advance, tapAt, honk, noteActivity }`. Every intermediate
> state compiles, runs and passes; the temporary handle is named and removed,
> not left to rot.
>
> `main.ts` carries no unit-test twin at any checkpoint: it is workflow-exempt
> UI glue (Guiding Principle 3) and it needs DOM and WebGL to even load. The
> behaviour of anything that changes there is pinned where it becomes
> reachable — `game.test.ts` from Phase 2 on — plus the manual verification
> steps each phase records.

## Phase 1 - Litter field disposal contract (TDD)

- [x] Task: `LitterField.dispose()` and the replacement call (FR7, AC4) `ea3cfb8`
  - [x] Write failing tests in `parkLitterFx.test.ts`: `dispose()` releases every geometry and material the field allocated; a disposed field is never updated by `update()`; `startPark()`'s replacement path calls `dispose()` on the outgoing field before the `scene.remove` (red first)
  - [x] Implement `dispose()` on `LitterField` and call it from `startPark()` on the outgoing field, right after the `scene.remove`, mirroring `ModelLibrary.dispose()`'s ownership convention
  - [x] Refactor + coverage (the primitives stay workflow-exempt visual code; the disposal contract itself covered at 100%)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 - The controller seam: ports and world ownership (TDD)

- [ ] Task: Narrow port interfaces and `createGame()` over the world (FR1, FR2, FR3, FR4)
  - [ ] Write failing tests in `game.test.ts`: `createGame()` returns a usable game without awaiting anything; `advance(delta)` is safe to call before mounting resolves and holds the pre-mount `motor`/`actor`/`traffic`/`pond` guards; the `scene` port is used for `add`/`remove` and nothing else; each of `GameAudio`, `GameHud`, `GameScene`, `GameCamera` declares only the members the controller calls (AC2) (red first — `src/game/game.ts` does not exist)
  - [ ] Declare the four port interfaces and `createGame()` in `src/game/game.ts`, and move the world construction and the async mounting inside it — model library, town mount, vehicle motor and actors, traffic system and actors, pond watcher and ducks, parked/traffic shadows, and every mission subsystem and feedback object
  - [ ] Refactor + coverage (>80% statements and branches on `game.ts`)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 - The session rules move in (TDD)

- [ ] Task: Pickup, spawn and the mission frame (FR1)
  - [ ] Write failing tests in `game.test.ts`: `absorb` keeps its three rules — the first drive-over piece responds the park mission and morphs the fleet, a sweep voices one gulp for the group while each drive-over piece earns its own, and completion fires exactly once at the last piece; `startPark`/`startPuppy`/`lightFire`/`lightOrder` open a round atomically; the four per-mission ticks run in the registry's stable pass order; the pacers keep the shared calm gap and the never-twice rule, and a busy mission pauses every pacer (red first)
  - [ ] Move `absorb`, `startPark`, `startPuppy`, `lightFire`, `lightOrder`, `headToGarbageTruck`, `tickFireMission`, `tickOrderMission`, `tickParkMission`, `tickPuppyMission`, `tickPacers`, `activate`, `swapVehicle`, and the leaf `firePoint`/`distanceToFire`/`orderPoint`/`distanceToOrder`/`nearestLitterPoint`/`distanceToLitter`/`ownerPoint` helpers into `game.ts`
  - [ ] Refactor + coverage
- [ ] Task: Ability, siren, helper hand and the tap surface (FR1, FR6)
  - [ ] Write failing tests in `game.test.ts`: `pressAbility` dispatches each vehicle's cast, arms serve on a jingle, and counts a hose burst only when the hose is in reach; `onSirenCast` latches the puppy's answer exactly once; `swapVehicle` builds the replacement before removing the old one so no frame is empty; `tickHelperHand` demos exactly one tap then cools down, and points at the siren button when that is the focus; `serveArmedNow` is true only for the ice-cream truck, after a jingle, inside `SERVE_RANGE`; `tapAt(target, aim)` answers missions against the **aim** and drives to the **target**, so a cone beside an ordered house cannot steal a serve nor a hydrant beside a burning one the hose; `deliverPuppy` hops out, runs to the door, then celebrates (red first)
  - [ ] Move `pressAbility`, `applyAbilityEvent`, `onSirenCast`, `tickHelperHand`, `demoSiren`, `serveArmedNow`, `tapAt`, `answerMissions`, `deliverPuppy`, `advanceDoorRun`, `clearPuppyStage`, and the mission registry contributions into `game.ts`
  - [ ] Refactor + coverage
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 - Frame, thinning, freeze proof and docs (mixed)

- [ ] Task: The frame and the camera order (FR5, AC5)
  - [ ] Write failing tests in `game.test.ts`: the camera target is set inside the vehicle frame and the rig update runs *after* the game frame; `followSun` keeps its slot so the shadow map stays texel-still and the camera never lags a frame; the HUD ability-busy edge (the `fleet.isBursting()` comparison) fires exactly as today; the render loop starts before mounting resolves so the sky is on screen while the models stream in (red first)
  - [ ] Move `advance`, `tickMissions` and `tickVehicle` into `game.ts`, and close `createGame()`'s API to `{ advance, tapAt, honk, noteActivity }` — dropping the temporary `world` and rule handles
  - [ ] Refactor + coverage
- [ ] Task: Thin `main.ts` and move env reads to the edge (FR8, FR9)
  - [ ] Leave only container lookup, renderer creation, `createScene()`, `createTownGrid()`, camera rig and ResizeObserver, parent panel, hold gate and install hint, input router and DOM listeners, audio construction and first-gesture unlock, and the wiring between them. `import.meta.env.DEV` and `window.location.search` stay here, with `calmGapOverride()` resolved and passed in as data (manual-verify: `?calmGap=2` still shortens the gap in dev)
  - [ ] Confirm `main.ts` lands at roughly 200 lines or fewer and that a search in it for `absorb`, `serveArmedNow`, `deliverPuppy`, `onSirenCast`, `swapVehicle`, `tickPacers`, `tickMissions` returns nothing (AC1)
- [ ] Task: Freeze proof and docs sweep (NFR1, NFR5, AC6, AC8)
  - [ ] Confirm the five frozen suites are green and unmodified beyond forced renames, diff-reviewable (AC6)
  - [ ] Run `game.test.ts` and confirm every case still passes with no edit — the contract is unchanged by the move (AC3)
  - [ ] Confirm `?calmGap=2` works in dev and a production build carries no trace of it — grep `dist` (AC8)
  - [ ] Update live docs (`README.md`, live `tech-stack.md` prose) to the new shape; leave `docs/playtest.md` and `conductor/archive/*` as written (NFR5)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
