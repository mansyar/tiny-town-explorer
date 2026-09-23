# Spec: Light Wandering Traffic

## Overview

product.md's roadmap names **light wandering traffic** as the town's next
liveliness step after static parked cars — "the natural reason a car would ever
move". This track ships it: two ambient civilian cars trundle the road network
for the whole session, drawn from the same Car Kit family the parked cars use.

The town gains movement without gaining pressure. The movers are strictly
ambient: they never answer a tap, never claim a mission target, never make a
sound, and never punish — meeting one is the same gentle comedy as meeting a
cone. The kid's car bonks, squishes, honks and carries on, and the NPC drives
away untouched. The kid stays the only agent in town; the camera and the engine
voice never leave the kid's car.

Movement reuses what the pathfinder and `vehicleMotor` already are: the
authored road grid *is* the traffic graph, and the motor is instance-based
precisely so a second car can run one. The work concentrates in three seams:
per-car speed options in the motor, a lane discipline that makes head-on passes
clear, and a dynamic obstacle feed so movers can bonk each other and the kid.

**Budget is part of the feature, not a follow-up.** The scene measures 51,130
triangles / 171 draws — the first-ever overage against the ~50k heuristic,
documented in `tech-stack.md` with its levers. This track pulls lever one (six
parked cars → four) and pays the movers out of it, with a must-not-grow contract
(NFR2): the measured line may hold at today's numbers or improve, never
regress, and everything is measured, not estimated.

## Functional Requirements

- **FR1 — Two movers, two models.** Two wandering cars from the two lightest
  Car Kit civilian models (sedan, hatchback-sports) — the same family and fit
  as the parked cars so a mover passing a parker reads as one town. Each is
  authored as data in `townMap.ts`: deterministic model id, start road tile,
  start yaw, fixed lateral bias, cruise speed. No RNG at mount.
- **FR2 — Always on the move.** Each mover endlessly drives between random
  road-tile destinations chosen through the existing BFS `roadRoute`, picking a
  fresh destination on arrival. Targets come from an injectable seeded RNG with
  a fixed production seed, so the traffic choreography is reproducible every
  session and tests script it exactly. Cruise speed is a calm trundle (~50–60%
  of the kid's `DRIVE_SPEED`), one distinct speed per car so the pair never
  marches in lockstep.
- **FR3 — Lane discipline.** Each car holds a fixed lateral bias off the tile
  centre line (car A one way, car B the other), sized from the **widest fitted
  model** so any two movers clear each other on straights in both directions —
  head-on and overtaking alike. The bias is derived and measured (like the
  parked cars' kerb band), and tests pin the clearance contract, not the raw
  constant.
- **FR4 — One collision language: bump, squash, squeeze past.** Everything in
  town is crashable; traffic joins that language and never adds a solid:
  - **Kid meets mover:** the kid squishes, bonks, honks and auto-resumes
    exactly as with cones and parked cars; the mover drives on untouched; no
    kid leg is ever abandoned.
  - **Mover meets mover:** same crashable treatment via a **dynamic obstacle
    feed** (each mover sees the other's current footprint). Junction crossings
    resolve as a toy squash-and-squeeze, silent — no honk. Lane bias (FR3)
    keeps the common straight passes bump-free.
  - **Nothing blocks:** movers are never solid, so
    `puppySpots.isScoopable`'s "only buildings block" invariant, pickup radii
    and door runs are untouched.
- **FR5 — Dynamic obstacle feed.** `createVehicleMotor` grows one minimal
  option — a supplier of live crashable obstacles (stable per-mover ids) — so
  the kid's motor and each mover see moving footprints per frame. Existing
  motor behaviour and tests are unchanged; the `passed`-set bump-once-then-pass
  semantics apply to movers exactly as to props, reset per new route.
- **FR6 — Invisible to input.** A tap on or near a mover resolves to the ground
  point under the finger — no prop snap, no toot, no bob, no mission answer —
  parked-car parity (`FR6` of Static Parked Cars). A mover can never eat or
  claim a mission target: it does not collect litter, cannot carry a pup,
  cannot answer a door.
- **FR7 — Silent.** No engine loops, no horns, no new audio bytes. The engine
  voice stays the kid's alone (it is tied to the kid's motor rate).
- **FR8 — Blob shadows that follow.** Movers stay out of the shadow-map pass
  (`castsShadow: false`) and carry sun-aligned blob quads in the parked cars'
  visual language — the same offset shape and sign convention from `scene.ts`'s
  sun — but following rather than static: **one merged dynamic mesh for both
  blobs** (1 draw call), translated with its car per frame, never in collision
  or taps.
- **FR9 — Untangled from the hero car.** Traffic runs in a self-contained
  `trafficSystem` module (own motors, actors, route AI, blob mesh) ticked once
  per frame from the render loop. The kid's closures — camera target, engine
  voice, morph logic, HUD — do not learn that a second car exists; NPCs are
  excluded from `swapVehicle`, camera follow, engine audio and bonk counters.
- **FR10 — Budget lever: six parked cars → four.** The two parked cars on the
  roomiest kerbs are removed (lever one as documented in `tech-stack.md`),
  freeing ≈4.1k triangles and ≈10 draws to pay for the movers. The result is
  **measured** (`pnpm assets:measure` + the GL-counter method the baseline
  used) and recorded in `tech-stack.md`.

## Non-Functional Requirements

- **NFR1 — Pillars:** zero text, zero failure, pure agency, offline-first. A
  mover never blocks, punishes, claims a tap or ends a route. Traffic is
  scenery that happens to move.
- **NFR2 — Performance, measured; must not grow.** With 4 parked + 2 movers the
  scene targets **≤ the current measured line (51,130 triangles / 171 draws)**
  — ideally ≤50k — and every number is measured, never estimated. Per-car cost
  expectation: ≈2.1k triangles / ≈5 draws for a mover (parked cars' measured
  band) plus its blob triangles in one shared draw. If the net still exceeds
  the ~50k heuristic, `tech-stack.md` states it plainly with the new measured
  line; the iPad device pass remains the fps gate, judged at 60fps on the
  baseline iPad within noise of the pre-track figure.
- **NFR3 — TDD scope:** route choice (seeded, endless), lane-bias clearance,
  cruise speeds, the dynamic obstacle feed, bump semantics and the
  traffic/hero isolation rules are logic-bearing → red-first tests, >80%
  coverage on the logic. Actor mounting, blob rendering and motion feel are
  manual-verify per `workflow.md`'s exemption.
- **NFR4 — Determinism & offline:** fixed-seed choreography every session; two
  models already precached — zero new precache entries, zero new bytes. The PWA
  payload is unchanged.
- **NFR5 — No mission rule changes:** pacing, gates, pickups, markers,
  celebrations, helper hand and calm gaps are untouched. Traffic keeps driving
  through every mission; crashability is what guarantees no errand can fail.
- **NFR6 — Tap responsiveness:** the tap → route → drive path gains no awaits
  and no per-frame cost beyond two more `update` calls and one mesh
  translation; the 100ms response target stands.

## Acceptance Criteria

- **AC1:** Two cars trundle the road network all session — endless seeded
  random routes on the road graph, always moving, and any head-on or overtaking
  pass on a straight clears without overlap.
- **AC2:** Driving into a mover squishes, bonks, honks and resumes; the mover
  drives on untouched; no leg is ever abandoned. Mover-meets-mover squashes
  silently and both carry on.
- **AC3:** A tap on or near a mover drives to the finger's ground point with no
  snap; the mover never reacts and never claims a mission target.
- **AC4:** All four missions complete with traffic driving — pacing, gates,
  pickups, markers and celebrations unchanged — and no puppy spot ever becomes
  unreachable.
- **AC5:** Two parked cars are gone; triangles/draws/precache measured and
  recorded in `tech-stack.md` at ≤ the current 51,130/171 line (or the honest
  new number with its note).
- **AC6:** Movers are silent, out of the shadow-map pass, carry following
  sun-aligned blobs in one merged mesh, and the engine voice still tracks only
  the kid's car.
- **AC7:** `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; >80%
  coverage on the logic touched.
- **AC8:** iPad pass — town reads alive at play distance, bonks feel funny not
  scary, missions unaffected, fps unchanged from the pre-track figure within
  noise, works offline.

## Design Decisions (locked with the planner)

| Decision | Chosen | Why, and what it cost |
| --- | --- | --- |
| Interaction | Bonk & carry on (crashable) | Zero-failure pillar and the town's existing collision language; reuses the crashable-prop path. Right-of-way AI would make the kid wait — the one thing the pillars forbid. |
| Scale | Two movers | "Light" per the roadmap; two is alive without crowding a ~20-tile road graph. Cost: the town's liveliness ceiling is modest by design. |
| Models | Two lightest civilians (sedan, hatchback-sports) at the parked cars' 0.55 fit | Zero new art/bytes; a mover passing a parker reads as one family. The two lightest models also make the budget swap favourable against the two dropped parked cars (≈−4.1k out, ≈−3.9k in — near-neutral, must-not-grow contract holds). |
| Routing | Endless seeded random BFS routes | The authored road grid *is* the traffic graph; `roadRoute` runs unmodified. A fixed production seed gives the "beloved toy" familiarity of the same town every session. |
| Lane discipline | Fixed opposite lateral biases per car | Head-on passes and overtakes clear structurally on 0.60-wide straights without any right-of-way logic. Cost: it is a toy's lane rule, not a traffic-code lane rule — acceptable at this camera and age. |
| Mover ↔ mover | Same crashable language via the dynamic feed | Junction crossings on a tiny grid cannot be routed away; squash-and-squeeze is on-voice and one code path serves kid↔mover and mover↔mover. Cost: `passed`-set ghosting after a bump (reset per route) is accepted as part of the toy's rules. |
| Speed | ~50–60% of `DRIVE_SPEED`, distinct per car | The kid must always win a race (pure agency — never outrun, never chased), and staggered speeds break up meeting patterns. Cost: `DRIVE_SPEED`/`TURN_RATE` grow per-instance options in the motor. |
| Sound | Silent | The engine loop is the kid's car's character voice; two more would muddy the mix and the kid-safe cap. Motion and blobs carry presence. |
| Shadows | Sun-aligned blobs, one merged dynamic mesh | The parked cars' language (and their shadow-pass leak was the measured lesson); one draw for both. |
| Budget | Drop 2 parked (lever one) + must-not-grow contract | The scene is already 1.1k over the heuristic. Swapping the two dropped cars for the two lightest movers holds the line honestly; `tech-stack.md` records measured numbers and revises the heuristic rather than calling overage "inside budget". |
| Isolation | Self-contained `trafficSystem`; hero closures untouched | `main.ts`'s camera/audio/morph closures stay single-car by construction. Cost: one tick call and one feed supplier in the composition root. |
| Missions | Traffic keeps driving | Crashability is the whole guarantee; coupling to the mission FSMs would add states and transitions no pillar needs. |

## Out of Scope

- Right-of-way AI, traffic lights, stop signs, indicators, headlights, turn
  signals, or NPCs yielding to the kid.
- NPC reactions to ability casts (sirens clearing the road, honk-backs), NPC
  audio of any kind.
- Any mission interaction: traffic never carries, collects, delivers, or
  triggers anything.
- Despawning, parking behaviour, kerb pauses, or cars leaving/entering at the
  map edge.
- New art, textures, Blender work, new audio bytes, or precache growth.
- Persistence, camera changes, kid-car speed changes, and any change to tap
  semantics beyond the snap exclusion shared with parked cars.
- Rebalancing or removing more than the two parked cars named in FR10.

## Flagged Assumptions

- The "two lightest models" claim and the ≈−3.9k mover cost come from the
  parked-cars band (2.1k avg); the plan measures each model with
  `pnpm assets:measure` and, if the swap is less favourable than assumed, holds
  the must-not-grow contract and records the honest number.
- The lateral-bias constant is derived from the widest fitted model (sedan
  half-width 0.162 at 0.55 fit, per the parked-cars measurements) in the plan;
  tests pin the clearance contract.
- `passed`-set ghosting after a bump (kid and movers alike) resets per new
  route; a bump-then-drive-through moment later in a route is accepted toy
  behaviour, not a bug.
- Cruise speeds (~0.8–1.0 against the kid's 1.6) are starting points to tune by
  feel in the device pass.
- Which two parked cars go is the plan's pick (FR10's "roomiest kerbs"); the
  kerb reservation's declared list and the `townMap` rows shrink accordingly.
