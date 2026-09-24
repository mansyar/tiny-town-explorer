# Spec: Game Controller Extraction

## Overview
`src/main.ts` is 1,253 lines — nearly double the next-largest file in `src/` —
and it is the only place in this codebase holding real game rules that no test
reaches. Three tracks in a row have classified it as "exempt DOM glue" (the
line appears in `docs/playtest.md`'s acceptance rows and in three archived
plans), and that classification has quietly stopped being true: `absorb()`
encodes park-pickup semantics, `serveArmedNow()` arbitrates serve-arming across
the fleet and the serve gate, `deliverPuppy()` sequences the hop-out and the
door run, and `onSirenCast()` latches the puppy's answer. Every one of those is
a rule a child's play depends on.

This track extracts those rules and the per-frame orchestration into
`src/game/game.ts` (`createGame()`), written red/green and unit-tested, and
leaves `main.ts` as boot plus DOM wiring. **Behavior is frozen**: zero
child-visible change of any kind.

One defect rides along because it sits on code being moved: the park litter
field allocates GPU resources every round and never releases them.

## Context
- The mission stack is already well factored — `missionFsm`, `missionMarkers`
  and `missionCelebration` are one tested framework the four missions configure
  as data, and `missionRegistry` owns tick/tap ordering. What is missing is the
  layer *above* it: the orchestrator that owns session state and drives the
  framework, which today lives inline in `main.ts` behind the glue exemption.
- The characterization method this track uses is the one
  `mission-framework-consolidation_20260922` proved: pin current behaviour with
  a harness first, then move code under it.
- Historical records stay as written (the `mission-stack-cleanup` precedent):
  `docs/playtest.md` and `conductor/archive/*` are not rewritten.

## Functional Requirements

- **FR1 - Game controller module.** `src/game/game.ts` exports `createGame()`,
  a `createX()` factory beside `scene.ts`, `camera.ts` and `renderLoop.ts`. It
  owns the mission registry contributions, `tickMissions`/`tickPacers` and the
  four per-mission ticks, `absorb`, `serveArmedNow`, `pressAbility`/
  `applyAbilityEvent`/`onSirenCast`, `activate`/`swapVehicle`, `deliverPuppy`,
  `startPark`/`startPuppy`, `lightFire`/`lightOrder`, `tickHelperHand`,
  `demoSiren`, and `tapAt`'s mission-and-drive half, together with the session
  state those close over.

- **FR2 - Grouped narrow ports.** `createGame()` takes a deps object holding
  `audio`, `hud`, `scene` and `camera`, each a narrow interface declaring only
  the members the controller actually calls — the convention
  `MissionCelebrationDeps`, `createVehicleHud({onSelect,onAbility,onMute})` and
  `createParentPanel({onToggle})` already establish. Controller tests run
  against fakes; no three.js and no Web Audio in the unit-test environment.

- **FR3 - The controller owns the world.** Model library, town mount, vehicle
  motor and actor lifecycle (including `swapVehicle`), traffic system and
  actors, pond watcher and ducks, parked/traffic shadows, and every mission
  subsystem and feedback object (target ring, ability FX, fire FX, order
  marker, litter field, paw/heart markers, both pup instances, sun, helper
  trace and hand). The `scene` port is minimal — object `add`/`remove` only. The
  "build the replacement before removing the old one, so no frame is empty"
  ordering in `swapVehicle` is preserved exactly.

- **FR4 - Live boot window preserved.** `createGame()` returns a usable game
  immediately and performs the async mounting internally. `advance(delta)` is
  safe to call before mounting resolves, holding the current
  `motor`/`actor`/`traffic`/`pond` undefined guards. `main.ts` starts the
  render loop as soon as `createGame()` returns, so the sky is on screen while
  the models stream in — byte for byte as today.

- **FR5 - Frame ordering preserved.** The camera target is set inside the
  vehicle frame and `rig.update` runs after the game frame; `followSun` keeps
  its position in that order so the shadow map stays texel-still and the camera
  never lags a frame. The HUD ability-busy edge (the `fleet.isBursting()`
  comparison) keeps firing exactly as it does now.

- **FR6 - Tap surface stays split at the router.** `main.ts` keeps
  `createInputRouter` and translates a `pointerdown` into the controller's tap
  entry point, passing both the routed destination and where the finger
  actually landed. The point-versus-aim contract — which is what stops a cone
  beside an ordered house stealing a serve, or a hydrant beside a burning one
  stealing the hose — is unchanged. Honks and the helper hand's activity reset
  are on the same surface.

- **FR7 - Litter field disposal contract (bug fix).** `createLitterField()`
  allocates fresh `SphereGeometry`, `ConeGeometry`, `IcosahedronGeometry` and
  `MeshLambertMaterial` per piece per round, and `startPark()` calls
  `scene.remove(litterField.object)` with no release anywhere in
  `parkLitterFx.ts` — so every park round orphans its GPU buffers for the rest
  of the session. `LitterField` gains a `dispose()` that releases what it
  allocated, and `startPark()` calls it on the outgoing field before
  replacement. Scoped to this one allocator: `ModelLibrary.instantiate()` shares
  via `clone(true)` so vehicle morphing is not a leaker, and every other FX
  object is built once at boot.

- **FR8 - `main.ts` is rules-free glue.** It keeps container lookup, renderer
  creation, `createScene()`, `createTownGrid()`, the camera rig and
  ResizeObserver, the parent panel, hold gate and install hint, the input
  router and DOM listeners, audio construction and the first-gesture unlock,
  and the wiring that connects them to the controller. It contains no game
  rules.

- **FR9 - Environment reads stay at the edge.** `import.meta.env.DEV` and
  `window.location.search` remain in `main.ts`; the dev-only calm-gap override
  is still resolved through the existing pure `calmGapOverride()` and passed
  into the controller as data, so `window` and `import.meta` never enter the
  controller's tests.

## Non-Functional Requirements

- **NFR1 - Zero behavior change.** The five frozen suites (`missionStateMatrix`,
  `missionAbortParity`, `missionBusy`, `missionFocus`, `missionMarkers`) pass
  **unmodified** except mechanically forced import-path renames. Nothing
  child-visible moves by a pixel, a frame or a millisecond.

- **NFR2 - TDD, scoped as logic-bearing.** The controller is logic-bearing under
  `workflow.md` Guiding Principle 3: red/green before implementation, >80%
  coverage on `game.ts`. `main.ts` remains exempt as glue. This deliberately
  retires the blanket "main.ts is exempt DOM glue" claim.

- **NFR3 - Characterization first.** A harness is written and captured against
  today's `main.ts` *before* anything moves: `advance(delta)` driven frame by
  frame with scripted taps and ability presses, snapshotting every observable
  side effect — audio calls, HUD calls, scene adds and removes, and mission
  state transitions. It must be green before extraction begins and green after.

- **NFR4 - No stack change.** No dependency or tooling changes;
  `tech-stack.md` is untouched except for prose naming a moved identifier.

- **NFR5 - Docs discipline.** Live docs (`README.md`, live sections of
  `tech-stack.md`, code comments) describe the new shape; historical records
  stay as written.

- **NFR6 - Gates green.** `pnpm check && pnpm typecheck && CI=true pnpm test`.

## Acceptance Criteria

- **AC1** `main.ts` holds no game rules and lands at roughly 200 lines or
  fewer. A search in `main.ts` for `absorb`, `serveArmedNow`, `deliverPuppy`,
  `onSirenCast`, `swapVehicle`, `tickPacers` or `tickMissions` returns nothing.

- **AC2** `src/game/game.ts` exists with `createGame()` and grouped narrow
  ports; each port interface declares only the members the controller calls.

- **AC3** The characterization harness is committed in a state captured before
  the move, and passes unchanged after it — covering `absorb`, `swapVehicle`,
  the ability path, `tickHelperHand`, the puppy door run and the pre-mount boot
  window.

- **AC4** `LitterField` exposes `dispose()`; `startPark()` calls it on the
  outgoing field; a test pins that replacing a field releases the previous
  field's geometries and materials and that a disposed field is never updated.

- **AC5** Boot behaviour is unchanged: the render loop starts before mounting
  resolves and the sky is visible while models stream in.

- **AC6** The five frozen suites are green and unmodified beyond forced renames
  (diff-reviewable).

- **AC7** All three gates green; `game.ts` exceeds 80% statements and branches.

- **AC8** `?calmGap=2` still shortens the gap in dev, and a production build
  carries no trace of it (grepped in `dist`).

## Out of Scope
- The spawn-window triangle overage (56,232 against the ~50k heuristic) and
  every lever listed for it. Separate track.
- The session sticker board. Separate track.
- Any child-visible change, including a loading affordance during the boot
  window.
- Pooling the litter primitives as shared singletons. `dispose()` is this
  track's fix; pooling is a different idea for a different day.
- Changes to `inputRouter.ts`, `vehicleMotor.ts`, `trafficBrain.ts`, the
  mission framework (`missionFsm`/`missionMarkers`/`missionCelebration`), or
  the five frozen suites beyond forced renames.
- Rewriting historical records (`docs/playtest.md`, `conductor/archive/*`).
