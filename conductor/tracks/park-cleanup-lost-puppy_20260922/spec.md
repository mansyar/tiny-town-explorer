# Spec: Park Clean-Up & Lost Puppy Missions

## Overview

The two remaining roadmap missions, shipped together because they share every
piece of infrastructure the ice-cream track built: the town-at-a-time gate, the
calm-gap pacer, the helper hand and the tested tap-routing seam.

**Clean Up the Park** sends the garbage truck to collect litter bouncing on the
park's two tiles and along the ring-road kerbs, collected by *driving over it* —
the first mission whose verb is driving rather than tapping. **Lost Puppy** sends
the police car to answer a whine with its siren, find where the puppy hides,
carry it home and deliver it to the owner's door.

Three missions now share one town, so pacing gains exactly one new rule: never
the same mission twice in a row.

## Functional Requirements

### Clean Up the Park

- **FR1 – Spawn:** 8 litter pieces bounce gently — 5 on park tiles (1,1)/(2,1),
  3 kerbside on lot tiles bordering the ring road. Each is a small primitives
  build (tied bag, crumpled paper) with lit flat colours, readable at 48px. The
  park corner also gains the vendored `dumpster.glb` as its trash landmark: no
  new asset, only one already-shipped GLB mounted.
- **FR2 – Respond:** tapping any litter piece morphs the fleet to the garbage
  truck and drives there — the same respond gesture the ordering-house tap uses,
  as `resolveParkTap` beside the other two resolvers.
- **FR3 – Drive-over pickup:** the truck collects every piece within
  `PICKUP_RADIUS` (0.6) of its centre as it passes, one `gulp` per piece
  rate-limited to ≥150 ms so a run of pickups is a rhythm rather than a stutter,
  each piece leaving a small `poof`.
- **FR4 – Ability sweep:** the garbage truck's existing `gulp` cast additionally
  sweeps every piece within `SWEEP_RADIUS` (1.5) at the press, one `gulp` for the
  group, ≥0.5 s cadence. An assist, not the verb: a kid who never presses it
  still finishes by driving.
- **FR5 – Completion:** the last piece gone → confetti + cheer + sun, ~2.5 s
  linger, then idle.

### Lost Puppy

- **FR6 – Spawn:** the puppy waits at one of 3+ authored hiding spots (behind
  the park trees, beside the dumpster, behind a house's garden, on the far
  verge), each ≥2 tiles from the owner house and reachable over the town's own
  pathing. No marker yet: one soft whine plays and the police button on the HUD
  pulses — the only way a quiet town says "someone needs the police".
- **FR7 – The siren is the search:** pressing the police car's ability (its
  existing `siren` cast, untouched) makes the puppy yip back and blooms a
  bouncing paw-print marker over its hiding spot, retargeting the helper hand.
  With no puppy mission running, the siren is exactly today's free-play siren.
- **FR8 – Pickup:** driving within `PICKUP_RADIUS` of the puppy makes it hop
  aboard on its own — no tap to aim — with a happy yip and a small pup icon
  riding on the car while it is a passenger. The paw marker clears.
- **FR9 – One marker at a time:** the owner house's heart marker appears only
  once the puppy is aboard, so there is never more than one next thing on screen.
- **FR10 – Homecoming:** within `DELIVERY_RANGE` (1.9, the shared mission range)
  of the owner house, a tap on the house delivers the puppy — it hops out and
  runs to the door — then confetti + cheer + sun, ~2.5 s linger, then idle. The
  owner house is drawn from the houses ≥2 tiles from the hiding spot, using the
  fire pacer's existing distance rule.

### Shared

- **FR11 – Pacing:** the device-verified 60–90 s calm gap and the
  town-at-a-time gate are unchanged; one new rule — the next mission is drawn
  from the other two, so a mission never repeats back to back. No mission spawns
  while any other runs.
- **FR12 – Helper hand:** 10 s idle → route trace + one demo tap on the *current
  step's* target — litter (park respond), the siren button (before the puppy is
  found), the paw spot, or the owner house — with the ≥10 s cooldown and
  unchanged `helperHand` API. `missionFocus` grows from two missions to three yet
  still resolves exactly one destination.
- **FR13 – Mission registry seam:** adding a third mission must not add a third
  copy of the tick/tap block in `main.ts`. A thin registry takes per-mission
  `{ tick, tap, focus }` contributions behind the single existing pass.
  Deliberately bounded: a seam, not a rewrite of the FSM modules.
- **FR14 – Puppy visual:** primitives-built pup (~200–300 triangles, no new GLB,
  no Blender step, ≤4 shared materials), lit flat colours from the City Kit
  palette in the same `MeshLambertMaterial` family the town's props use.
- **FR15 – Audio:** one new CC0 dog bark, transcoded to mono 44.1 kHz MP3 with
  loudness normalisation and provenance recorded beside the clip (the existing
  seven clips' pattern); `gulp` for pickups (the garbage truck's own voice);
  `cheer` + existing confetti/sun for both celebrations. All under the current
  first-tap unlock, mute and kid-safe cap.

## Non-Functional Requirements

- **NFR1 – Pillars:** zero text, zero failure, pure agency, offline-first.
  Nothing is ever lost, late, or penalised; litter never despawns with judgment.
- **NFR2 – Performance:** stay inside the 50k-triangle frame budget (37,904
  today) and the precache budget; litter, pup and the mounted dumpster are
  measured with `pnpm assets:measure` and the delta recorded in `tech-stack.md`.
- **NFR3 – Latency:** tap → visible response ≤100 ms; the paw marker blooms on
  the same frame the siren's state change lands.
- **NFR4 – TDD scope:** FSMs, pacers, pickup/sweep radii, tap routing, rotation
  and the registry test-first at >80% coverage; markers, pup mesh, FX and scene
  wiring manual-verify per `workflow.md`'s exemption.
- **NFR5 – Audio policy:** one clip added, no pack vendored, iOS-safe MP3, and
  no state signalled by sound alone.

## Acceptance Criteria

- **AC1:** Litter spawns bouncing in the park and on the kerbs; a tap on a piece
  morphs to the garbage truck and drives there.
- **AC2:** Driving over litter collects it with a gulp; the ability press sweeps
  a nearby cluster; the park empties either way.
- **AC3:** Last piece cleared → confetti + cheer + sun → idle → calm gap.
- **AC4:** Puppy spawns hidden — no marker, one whine, the police HUD button
  pulses.
- **AC5:** Siren → yip + paw marker blooms, and the helper hand retargets to it.
- **AC6:** Driving over the puppy picks it up with a yip; the heart marker
  appears only then.
- **AC7:** Tapping the owner house in range delivers with confetti + cheer →
  idle.
- **AC8:** Three missions never overlap; the 60–90 s calm gap holds; no mission
  repeats back to back.
- **AC9:** One marker at a time in both missions; after 10 s idle the hand demos
  the current step once.
- **AC10:** `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; logic
  coverage >80%.
- **AC11:** iPad pass — both missions audible and completable hands-on (bark,
  gulp, cheer), and again with sound off.

## Design Decisions (locked with the planner)

Recorded so the reasoning survives the implementation; each was chosen against
at least one alternative.

| Decision | Chosen | Why, and what it cost |
| --- | --- | --- |
| Puppy flow | Siren answers → pickup → deliver home | Reuses the ice-cream latches' shape (`serveGate`), giving a real errand; it is the longest chain in the game (3 kid actions), so the helper hand matters more here than anywhere else. |
| Pickup verb (park) | Drive-over, with the ability as a radius assist | The second mission's verb is a tap at range, the ice-cream one's is a tap on a house; a *driving* verb keeps the third distinct and never punishes imprecise aim. |
| Litter scope | Park tiles + ring-road kerbs | The park is only 2 tiles, too short an errand alone; kerbside pieces give the route length while the park stays the focal point. |
| Puppy's hiding | Authored spots, marker hidden until the siren | Makes the siren a real search tool and gives the police car a job; the helper hand covers a kid who never presses it. |
| Owner house | Any house ≥2 tiles from the hiding spot | Reuses the fire pacer's proven distance rule; the heart appears only once the puppy is aboard. |
| Puppy art | Primitives, no new GLB | The order marker's precedent (212 triangles of primitives): no Blender step, no new kit contract, offline budget untouched. |
| Puppy voice | A sourced CC0 bark, MP3-transcoded | Chosen over a synthesised yip (which `sirenSchedule`/the jingle prove would work and cost nothing) for warmth; the cost is a new asset with provenance and a licence check. |
| Pacing | Same 60–90 s gap, no back-to-back repeats | The device pass verified today's pacing; variety is added as one predicate rather than by re-tuning what already feels right. |
| Registry seam | In scope (FR13) | Adding mission #3 to a two-branch chain in `main.ts` is where duplication stops being tolerable — the same finding this project's last review left unfixed. Bounded on purpose. |

## Out of Scope

- A second puppy, puppy wandering, petting/feeding, or the puppy following the
  car after delivery.
- Litter anywhere outside the park and ring-road kerbs; any bin-sorting or
  recycling mechanic.
- New vehicle art, any new pack vendored, any music track.
- Persistence of either mission across sessions.
- A general mission-framework rewrite beyond FR13's seam, and the sticker board.
