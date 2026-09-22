# Acceptance sweep and the device pass

What the spec promised, what has been proven, and what only a real tablet can
answer. Written so the device work is **one sitting** rather than a series of
trips.

## The criteria

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| AC1 | Page loads and the first tap unlocks audio | **Met, pending a device ear** | Deployed at `tiny-town-explorer.pages.dev`; built output boots with WebGL 2.0, all eight clips fetched, unlock wired to the first `pointerdown`. Whether it is *audible* on iOS is the one thing no desktop can answer. |
| AC2 | Tapping routes roads-first then grass; mash-tapping never stalls or confuses | **Met** | `pathfinder` and `inputRouter` at 100% statements and branches (16 + 18 tests), a tap mid-route replaces it, and the car was driven to reachable tiles across the town without clipping. |
| AC3 | All four vehicles drive with distinct abilities and engine voices | **Met** | `vehicleSystem` 18 tests (registry, per-vehicle casts, engine-rate curve); each burst and the engine loop confirmed in the browser. |
| AC4 | The fire mission completes without adult help, fires migrate with calm gaps | **Met** | `missionManager` 13 + `firePacer` 11 tests; driven frame by frame end to end; then played by hand by the reviewer, who confirmed the whole loop. |
| AC5 | Every collision auto-resumes; never a stuck or penalised state | **Met** | Phase 4 verification: bonk, squish to 0.75/1.15, automatic resume, nose resting exactly on the wall at a 0.0003 gap. |
| AC6 | The helper hand demos one tap after ten idle seconds mid-mission | **Met** | `helperHand` 13 tests; driven frames showed the trace at 9.98 s and its demo tap at 11.78 s, then no repeat. |
| AC7 | Parent panel only via the three-second hold; toggles work; panel is textless | **Met** | `holdGate` 12 tests; browser: a two-second hold stayed shut, three seconds opened it, both toggles worked, and the reviewer ran the same pass by hand. |
| AC8 | Installs and plays fully offline after the first load | **Partly proven — needs the device** | The service worker registers, controls the page and populates a cache in the built output, and the deployed `/sw.js` serves correctly. Install plus airplane mode is the device step below. |
| AC9 | `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` all green | **Met** | Biome 71 files clean, `tsc --noEmit` clean, 361 tests across 28 files. |
| AC10 | Logic modules (pathfinding, input, FSM, pacing) at ≥80% coverage | **Met** | `pathfinder` 100%, `inputRouter` 100%, `collision` 100%, `vehicleSystem` 100% statements, `mission` package 97% (`firePacer` and `helperHand` 100%). The scene, asset and DOM layers are exempt and verified by hand, as `conductor/workflow.md` sets out. |

## The performance budget

The spec asks for a start around 50k triangles, ratcheting down only on measured
need. Measured on the built scene, with the shadow-map pass included in the
count:

| | |
| --- | --- |
| Triangles per frame | **37,904** |
| Draw calls | 134 |
| Meshes in the scene | 106 |
| Pixel ratio | 1.5 (capped at 2 on Retina) |

That is inside budget with headroom, and the shadow pass means the visible
geometry is below the figure. The frame rate itself is the device's to judge;
there is nothing on a desktop that answers it honestly.

## The device pass — one sitting

Do this on the iPad, in order. It covers AC1's audible half, AC8 and the frame
rate.

1. **Load it and let it finish.** Open `https://tiny-town-explorer.pages.dev`.
   Wait for the town to stop streaming in — the first load has to complete once
   for the offline pillar to work at all.
2. **Sound.** Tap the road once. You should hear the tap and, as the car pulls
   away, the engine note. If there is nothing, tap once more: browsers refuse to
   start audio before a gesture.
3. **Drive it properly.** Tap far across the town, tap again mid-route, drive
   into a cone and into a wall, and tap the car itself for the honk. The car
   must always end up driving again — nothing should leave it stuck.
4. **Switch through all four vehicles.** Watch each morph: the puff, the new
   engine note, and pressing the ability button for each (water fan, cones,
   siren wash, gulp).
5. **Play a mission through.** Wait out the calm gap for the fire, tap the
   burning house, drive over, get close, spray it out. Confetti and the sun
   should land. The ability button stays away until the truck is beside the
   fire — that is the hose arriving with proximity, not a missing button.
6. **The parent panel.** Hold the gear for three seconds — it must not open
   sooner — then toggle sound and the hand off and on, and close it.
7. **Install it.** Share → *Add to Home Screen*, then open it from the icon. It
   should come up full screen with no browser chrome around it, and the
   add-to-home-screen hint should not appear at all now that it is installed.
8. **Go offline.** Turn on airplane mode. Close the app fully and open it again
   from the home screen. It must start and play. *(This is AC8.)*
9. **Watch the smoothness.** Not a number — a judgement, made while the town is
   busiest: the moment a fire appears, and the moment a vehicle morphs. Note any
   stutter there and where you saw it.
10. **Rotate once** mid-mission. The camera refits and the HUD stays clear of the
    home bar and the notch.

### What to report back

- Anything that stuttered, and what was happening when it did.
- Anything that was silent that should have made a sound.
- Anything that felt fiddly to hit, especially the small gear.
- Anything a small child would have got wrong.

### If the app looks stale after a deploy

Close it fully and open it again — do not just switch away. An open app keeps
the old service worker until it is restarted, so a freshly deployed change can
be invisible until then. This is normal for an offline-first app, not a bug.

## The ice-cream delivery mission (track `ice-cream-delivery_20260922`)

The second mission: a house orders ice cream, the kid takes the truck over and
serves one cone. Same pillars, same shape as the fire mission — an order waits
forever, driving away only disarms the serve, and the town runs one mission at a
time, whichever kind.

*The v1 table above is that sweep's record, so its counts read as they did
then; the suite has grown since — see AC7 below.*

### The criteria

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| AC1 | The ordering house shows a bouncing cone + note icon, with one soft jingle cue | **Met, pending a device ear** | `orderMarker` 4 tests (the bounce rests at the base and returns every cycle, the sway never leaves ±0.09) plus the desktop pass: the marker floats over the ordered lot, bounces, and clears on serve. The cue is one synthesized jingle per order, fired off a state edge (`orderFlow`: "owes the jingle cue on the frame the order opens, and only that frame"). Audibility still needs a human ear. |
| AC2 | The ability tap emits jingle + cones; serve arms only on the active ice-cream truck, jingled, within 1.9 units | **Met** | `serveGate` 8 tests, `iceCreamMission` 8, `orderFlow` routing 15. Desktop pass: jingled, drove off to 4.25 units → `armed: false`; drove back → `armed: true` with **no** second jingle. |
| AC3 | Tap on the ordering house while armed → serve → confetti + cheer + linger → idle | **Met, pending a device ear** | Desktop pass: the tap while `active` + armed took the order to `complete`, cleared the marker and fired cones, confetti and the sun; the next order followed the calm gap. `iceCreamMission` pins the 2.5s linger back to `idle`. |
| AC4 | The order waits forever; driving away disarms but keeps the order | **Met** | Desktop pass: the marker stayed over the house with the truck 4.25 units away, and an unanswered order held the town ~95s without resolving. `orderFlow` also pins "never mistakes an abandoned order for a served one". |
| AC5 | No spawn while a mission runs (either kind), calm gap 60–90s honoured | **Met** | `missionBusy` 5 tests plus both pacers' gap rules (`firePacer` 11, `iceCreamPacer` 11). In the running app: with the fire pacer at its shipped gap and an unanswered order holding the town, no fire appeared for ~95s. |
| AC6 | The helper hand demos once after 10s idle mid-mission, then cools down | **Met** | `helperHand` 13 tests and `missionFocus` 7 (which mission it points at). Desktop pass: the hand traced the route and its demo tap on the ordering house answered the order for real — the gesture a finger would have made. |
| AC7 | `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; logic coverage >80% | **Met** | Biome 88 files clean, `tsc --noEmit` clean, **433 tests across 36 files** (the review that followed the sweep added tests for the shared calm-gap pacer and for tap aims). `game/mission` at 97%+ statements, with `orderFlow`, `missionFocus`, `serveGate`, `helperHand`, `iceCreamMission`, `iceCreamPacer`, `calmGapPacer`, `missionBusy` and `firePacer` all at 100% statements. `main.ts` stays exempt DOM glue. |

### How the desktop pass was driven

The visual half of the pass ran in the real render loop (headless Chromium against
the dev server), driven the way a finger drives it: real `pointerdown`s on the
canvas for the taps and real clicks on the HUD. To reach an order in seconds
rather than in a calm gap, the order pacer's clock was temporarily run twelve
times fast and the fire pacer left at its shipped pace; the entry file was then
restored byte for byte (diffed against `HEAD` — empty) and every gate re-run
clean. Nothing shipped in this track depends on that acceleration.

### The ice-cream device pass — five minutes

The v1 sitting above still stands for the town, the vehicles, the parent panel
and offline play. This is what the second mission adds.

1. **Wait out a calm gap.** After the previous mission goes quiet, an order
   arrives 60–90 seconds later. Look for the cone + note bobbing over a house —
   and listen for one jingle as it appears.
2. **Answer it.** Tap the marked house. The car becomes the ice-cream truck and
   drives itself over, with the icon still bouncing.
3. **Jingle on the way.** Tap the ability button while still travelling: you
   should hear the jingle and the cones drop, but see no ring at the house yet.
   Nothing may look armed until the truck is beside it.
4. **Serve.** Beside the house the ring blooms once on the lot. Tap the house:
   one cone changes hands with cones + confetti + the smiling sun + a cheer.
5. **Drive off mid-order.** Start a fresh order, then tap across town instead of
   serving. The order must stay put, and coming back must re-arm serve without
   another jingle.
6. **Leave it alone.** Mid-order, don't touch the screen for ten seconds: the
   hand traces the route and taps the house once, and does not repeat inside ten
   seconds.
7. **Never both at once.** Play a fire mission through. No order may appear
   until it is done and the gap has passed — and the same the other way round.
8. **Mute and unmute.** Repeat 1 and 4 with the sound toggled off, then on: the
   jingle, the cone handoff and the cheer should all go quiet and come back.

### What to report back (ice-cream)

- Anything silent that should have made a sound, and anything harsh.
- Any serve tap that honks, or that does nothing, instead of serving.
- Whether the cone icon reads at a glance from across the room.
- Anything a small child would have got wrong.

### Issues the desktop pass turned up, and what became of them

Both were found by the pass and both are fixed in the review that followed it:

- **The hose button never hid.** `.hud-button--ability.is-hidden` was toggled
  but had no CSS rule anywhere, so the v1 promise "the ability button *is* the
  hose button, so it only exists once the car is close enough" never happened on
  screen. Fixed: out of reach the button now fades out and stops taking taps,
  while an open ice-cream order keeps it visible — that jingle is how the kid
  answers an order, from any distance. Worth a glance on the device: while a
  fire is burning and the truck is far away, the ability button should be gone,
  and it should come back as the truck arrives.
- **A serve tap could honk instead of serving.** A tap snapped to any prop
  within 0.45 units *before* the 0.5-unit dead-zone check, so a tap on a marked
  house with a cone beside it could resolve onto the cone and, when the parked
  truck was inside 0.5 of that prop, honk rather than serve (reproduced once on
  the desktop pass). Fixed: the router now reports both the snapped destination
  and where the finger actually landed, and both missions are answered against
  the aim. Still worth a tap or two on the device where a cone sits beside an
  ordered house: a serve must always be a serve.

## Park clean-up and lost puppy (track `park-cleanup-lost-puppy_20260922`)

The third and fourth missions: litter you collect by *driving over it*, and a
lost pup found with the siren, carried home and delivered to its door. Four
missions now share one town, drawn so the same one never repeats back to back.

### The criteria

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| AC1 | Litter spawns bouncing in the park and on the kerbs; a tap on a piece morphs to the garbage truck and drives there | **Met** | `parkMission` 9 tests ("answers only a tap that lands on a piece, and only once"; a miss is ignored) and `parkLitter` 7 (the eight fixed slots — five park, three kerb). Desktop and iPad: pieces bounce, tap → poof-morph → truck drives. |
| AC2 | Driving over litter collects it with a gulp; the ability press sweeps a nearby cluster; the park empties either way | **Met** | `parkPickup` 14 tests (0.6-unit drive-over, ≥150 ms per-piece gulp cadence, 1.5-unit sweep at ≥0.5 s voiced once for the group). iPad: gulp rhythm on a run, one gulp per sweep, emptied both ways. |
| AC3 | Last piece cleared → confetti + cheer + sun → idle → calm gap | **Met** | Celebration reuses the fire recipe; `missionRotation` 12 + the calm-gap pacers hold the 60–90 s gap. Confirmed on the desktop drive and the iPad sitting. |
| AC4 | Puppy spawns hidden — no marker, one whine, the police HUD button pulses | **Met** | `puppyMission` spawn state; `startPuppy` whine + `setPolicePulse` (feat `f333325`). iPad: the pulse reads as an invitation and never competes with the ability button. |
| AC5 | Siren → yip + paw marker blooms, and the helper hand retargets to it | **Met** | `puppyMission` siren latch-once; `missionFocus` 13 tests (four-way retarget) + `helperHand` 13. Confirmed: yip + paw + hand trace; a second press blooms nothing. |
| AC6 | Driving over the puppy picks it up with a yip; the heart marker appears only then | **Met** | `puppyMission` pickup/deliver gates; two pup instances (roof rider, door runner). Confirmed both passes: roof hop with yip, heart only once aboard. |
| AC7 | Tapping the owner house in range delivers with confetti + cheer → idle | **Met** | `resolvePuppyTap` "deliver only when carrying, on the house, and in range" (1.9 units) plus the disarm-on-leave test; door run → confetti confirmed desktop and iPad. |
| AC8 | Four missions never overlap; the 60–90 s calm gap holds; no mission repeats back to back | **Met** | `missionBusy` 5, `missionRotation` 12 (pool of four; the next draw excludes the one just played), both pacers' gap rules. |
| AC9 | One marker at a time in both missions; after 10 s idle the hand demos the current step once | **Met** | paw clears when the pup boards, so heart and paw never coexist; litter focus only while the round waits. Both drives saw the hand demo exactly once per idle stretch, then cool down. |
| AC10 | `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; logic coverage >80% | **Met** | Biome 106 files clean, `tsc --noEmit` clean, **516 tests across 43 files**; every NFR4-named module ≥94.5% statements, and `game/mission` excluding the three workflow-exempt visual files computes to **98.18%** (649/661). `main.ts`/`vehicleHud.ts` stay exempt DOM glue. |
| AC11 | iPad pass — both missions audible and completable hands-on (bark, gulp, cheer), and again with sound off | **Met** | One LAN sitting on the iPad: park and puppy each completed with sound on (bark, gulp rhythm, both cheers) and again muted with every cue reading visually; the desktop half rode the Phase 5 browser drive. |

### How the desktop pass was driven

Same shape as the ice-cream pass: the real render loop in the browser, driven
with real inputs — the Phase 5 verification played both missions end to end
(including the muted beat), and the Phase 6 gate sitting confirmed the gates
around it. Nothing needed accelerating this time: both missions draw from the
rotation whenever the town is idle, so a patient session reaches them in
shipped time.

### The park and puppy device pass — one sitting

The v1 and ice-cream sittings above still stand for town, vehicles, panel and
offline play. What these two missions add, on an iPad over a LAN dev server:

1. **Wait for the park chime.** Litter bounces on the two park tiles and the
   ring-road kerbs; the dumpster sits on the park's south-east corner.
2. **Tap a piece, then drive.** Poof-morph to the garbage truck; a run over
   litter gulps per piece — a rhythm, not a stutter.
3. **Sweep once.** The gulp ability near a cluster voices the group once and
   empties it; the last piece anywhere → confetti + cheer + sun.
4. **Wait for the whine** (never the same mission twice back to back): no paw
   marker, and the police button breathes — an invitation, not an alarm.
5. **Siren → yip + paw**, pulse stops; idle ten seconds and the hand retargets.
6. **Board and deliver.** Drive close: the pup hops aboard with a yip and a
   heart. Tap the owner house in range: the door run, then cheer + confetti.
7. **Mute and replay one of each.** Every cue must still read — poof, gulp
   burst, pulse, paw, heart, confetti. Silence, never confusion.

### What to report back (park and puppy)

- Anything silent that should have sounded, or the bark reading harsh.
- Any gulp that stutters at close range, or a sweep that misses a visible piece.
- Whether the police pulse reads as "someone needs help" at a glance.
- Anything a small child would have got wrong — especially reaching the
  siren before finding the pup.

### Issues the passes turned up

None. The desktop drive and the iPad sitting both completed both missions
clean on the first try; nothing was found to file or fix.

*One defect in these two missions was found later, by the consolidation
track's walkthrough — two hiding spots and the paw marker's draw order. See
"Issues the pass turned up (framework consolidation)" below.*

## Mission framework consolidation + unified completion sparkle (track `mission-framework-consolidation_20260922`)

The refactor that the ice-cream and park/puppy specs both deferred: the four
missions' hand-rolled FSMs, marker wiring and celebration handling were
consolidated behind one tested framework (`missionFsm`, `missionMarkers`,
`missionCelebration`) that each mission configures as data. One child-visible
addition rides with it — a unified completion sparkle — and one correction came
out of verifying it (the lost puppy, below).

### The criteria

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| AC1 | All four missions run end to end with no *unintended* visible change; the only difference is the completion sparkle | **Met** | Every mission's public API was left byte-identical and `main.ts`'s registry/tick/tap paths are untouched, so the Phase 1 characterization matrix, the abort-parity harness and the frozen `missionBusy`/`calmGapPacer`/`missionFocus` suites are the acceptance gate — all green and unmodified. Walkthrough run by the track owner against the dev server (`?calmGap=2`, below); it is also what surfaced the puppy correction. |
| AC2 | `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green | **Met** | Biome 118 files clean, `tsc --noEmit` clean, **621 tests across 50 files** (598 at the Phase 4 checkpoint; the review pass below added 4 net). |
| AC3 | State matrix: no marker visible or tappable outside its own mission and state | **Met** | `missionStateMatrix` 10 tests — flame only while bursts remain, cone exactly while the order is open, field exactly while the clean-up runs, paw/heart never both; every off-mission tap resolves `ignore`. |
| AC4 | Abort parity: teardown in every state leaves no orphan marker | **Met** | `missionAbortParity` 18 tests — each mission drained from every state to a pristine idle down *both* routes: the shipped linger, and `abort()`, which the review exposed on all four mission APIs so the `onAbort` hooks stopped being dead configuration (see the review pass). |
| AC5 | `missionBusy` / `calmGapPacer` / `missionFocus` tests pass unmodified | **Met** | Zero edits to those three suites; no file outside `src/game/mission/` changed except `main.ts`. |
| AC6 | Sparkle fires exactly once per completion, never in free play or at start | **Met** | `missionCelebration` 11 tests — exactly-once, tap-spam collapse, interruption during linger, silence in free play and at spawn, re-arm per run. |
| AC7 | Per-mission bespoke FSM/marker/celebration code is gone | **Met** | `completeElapsed`, `let state`, `toIdle` and `state = "<literal>"` now appear only inside `missionFsm.ts`; each mission file declares its stages and linger and delegates every verb to a guarded transition. |
| AC8 | Puppy visibility: spots clear of buildings and scoopable; paw drawn over occluders | **Met** | `puppySpots` 10 tests (every spot clear of every house footprint and within the drive-over radius of a legal car position; the two pre-fix positions pinned as rejected) and `puppyMarker` 3 (paw draws over town geometry, heart keeps normal depth testing). |

### The performance budget, re-measured

The crash the sparkle was budgeted against (NFR3) was a new draw-call hotspot.
Re-measured the same way as the v1 figure — the built scene in the real render
loop, shadow-map pass included:

| | v1 sweep | Consolidation |
| --- | --- | --- |
| Triangles per frame | 37,904 | **37,802** |
| Draw calls | 134 | **133** |
| Meshes in the scene | 106 | 148 |
| Pixel ratio | 1.5 | 1.5 |

The sparkle rides the existing `abilityFx` burst pool and adds no persistent
geometry, so the four-mission scene lands *at or below* the v1 figures — a
mission framework and an extra completion burst between them cost two fewer
draw calls than the v1 build. The review re-checked that claim live rather
than trusting the table: with nothing else changed, one sparkle took the frame
from **144 draw calls to 154**, and back to **144** once its bits finished
(pixel ratio 1.5, through a temporary probe that was then removed). Absolute
figures drift with wherever the camera happens to be and which mission is in
flight, which is why the table compares like-for-like *method* rather than
moment-to-moment; the sparkle's own cost is the +10, its plan is built only the
first time it fires, and it is invisible once the burst is over. Meshes are counted here by walking the scene
graph for every mesh, so that column reads higher than the v1 table's 106,
which predates the order marker, the litter field, the puppy instances and the
paw/heart markers; the numbers NFR3 actually names are the triangles and draw
calls.

### The review pass

A principal-engineer review ran over the whole track — 2,599 added and 256
removed lines across 23 files, read file by file — and found no Critical or
High issues: two Medium, five Low. All were fixed in the review commit.

- **The sparkle was a second confetti burst** (Medium). It fired on the
  `'confetti'` channel, so this track's one child-visible difference was
  confetti twice at the same spot. `abilityFx` now carries a `sparkle` plan of
  its own — fewer but chunkier bits, thrown higher, pink rather than gold —
  with a test pinning the distinctness. Looking at it settled the design: the
  first cut was near-white and vanished against the road, so it was retuned
  before the commit rather than shipped on the strength of the plan table.
- **`abort()` was unreachable** (Medium). The FR6 deliverable had no caller
  anywhere in `src/`, so three missions' `onAbort` hooks were configuration
  nothing could reach and the parity harness still pinned the linger as its
  stand-in. It is now exposed on all four mission APIs and driven from every
  state (`missionAbortParity`, 18 tests).
- Low: the FSM's unused `tap()` seam deleted, so the description matches the
  code (the one-transition lock is update-scoped); two inert `armIn`
  declarations removed from the marker adapters, since both arms are range
  wires rather than state rules; `markerTap` returns `O | 'ignore'`, dropping
  its type assertion; a dead clause removed from the FSM's celebration guard;
  and `createMissionFsm` now refuses a config whose initial or celebrating
  state is undeclared instead of failing silently.
- One finding was **left alone deliberately**: `FIRE_FLAME.showIn` is not read
  by `main.ts`, but wiring it into the fire tick would run `extinguish()`
  during the celebration and cut the smoke 2.5 s early. That is a visible
  change, so the flame's real rule stays where it is — with `fireFx` — and the
  adapter keeps the describing field only.

### How the pass was driven

The walkthrough runs at shipped pacing, which is 60–90 s of calm gap between
missions. To make a four-mission sitting possible at all, `main.ts` reads a
dev-only `?calmGap=<seconds>` query parameter (60–90 s replaced by, say, 2 s).
It is an affordance rather than a second pacing rule: it can only *shorten* the
gap (capped at the shipped maximum), it leaves the busy pause and the
never-twice-in-a-row rule untouched, it is read behind `import.meta.env.DEV`,
and a production build carries no trace of it — verified by building and
grepping `dist` (44 precache entries, 3,398.82 KiB).

The scene figures above came from the same method the v1 sweep used: the real
render loop in the browser, reading `renderer.info.render` between frames via a
temporary probe in the entry file, which was then restored byte for byte
(`git diff` on `main.ts` empty) and every gate re-run clean. Nothing shipped
depends on the probe or on the accelerated gap.

### Issues the pass turned up (framework consolidation)

One, in the lost-puppy mission, and it was two faults at once:

- **Two hiding spots put the pup inside a house.** `spot-garden` sat in
  `house-4`'s lot and `spot-verge` in `house-5`'s — inside the 0.86-tile
  footprint a house is scaled to, so the 0.2-unit pup stood in a wall. The
  garden one was worse than invisible: hemmed by adjacent houses whose gaps are
  narrower than the car, no legal car position came within the drive-over
  radius, so the errand could never be finished and the town's busy gate held
  shut for the rest of the session. **Fixed:** hiding spots now pass two tested
  rules — clear of every building's capped footprint, and *scoopable* (a legal
  car position within the pickup radius) — and the two lot spots moved to the
  kerb of the street each house faces. The two park hides were already honest
  and stayed.
- **The paw marker — the mission's only ground-level marker — could be hidden
  by the very prop the pup hides behind.** The order cone and the delivery
  heart float above the roofline at 1.7 units; the paw sat on the grass at
  0.06, and the camera's tilt (about 35° of elevation, not the 45° the comment
  claimed) means a house hides ground well past its own footprint. **Fixed:**
  the paw print now draws after the scene with depth testing off, so it reads
  over a house, a tree or the dumpster; the heart keeps normal depth testing
  and a test pins that asymmetry.

Spec and plan for the track carry the change as FR7/AC8, with the marker-visual
line in "Out of Scope" carrying an explicit exception — the fault broke the
zero-failure pillar rather than changing a look. Nothing device-specific was
touched, so the sittings above still stand as written.

## Static parked cars (track `parked-cars_20260922`)

Six cars park on the town's kerbs, from four Car Kit models, on the kerbs whose
house walls measure wide enough to hold them. They are **crashable rather than
solid**: drive into one and the truck squishes, honks and carries on, so a car
is never a wall a small child can get stuck behind. They are also not tappable —
a tap beside a car means the ground beside it, never the car's centre.

### The criteria

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| AC1 | Six cars, four models, parallel to the kerb on straight segments only, seated on the kerb top, overlapping no house, prop, car or spawn capsule | **Met** | `parkedCars` 14 + `parkedCarsPlacement` 10 tests (kerb eligibility derived from each house's measured wall; every car on a `straight` tile; centre-line samples along every street leg collected, not just stopped at the first offender). Desktop and iPad: six cars, four shapes, each lying along its street. |
| AC2 | A centre-line drive along every street never bonks a car; a leg ending beside one still completes | **Met** | Tested per street tile and along every leg; confirmed on the desktop drive — the centre-line pass touched nothing. |
| AC3 | Driving into one squishes, bonks, honks and resumes; never strands a leg; never makes a pup unreachable | **Met** | `collision` 100% with the box shape, `vehicleMotor` box-hitbox suite; desktop drive: head-on bonk and graze both honked and re-routed to the tap, no leg abandoned. |
| AC4 | A tap on a car drives to the finger's ground point with no snap, and the car never reacts | **Met** | `inputRouter` 4 tests (no `propId`, ground point kept; cones and poles still snap). Confirmed on the iPad: tapping beside a car sends the truck to the tap. |
| AC5 | Cars absent from the shadow-map pass; blobs sun-aligned, merged into one mesh, grounded without z-fighting, reading as the same shadow family as the houses' | **Met** | Measured: 245 → 171 draw calls once the cars stopped casting (below). `parkedShadows` 13 tests, including the offset asserted *away from the sun* rather than against a constant. iPad: blobs read as shadows, not holes. |
| AC6 | Kerb reservation holds both ways; litter still varies its kerbside lots by seed | **Met** | `kerbReservation` 11 + `kerbInvariant` 3 + `parkLitter` 5 (four lots for three pieces; the same seed reproduces, different seeds vary). Missions played with the cars present on both passes. |
| AC7 | All four missions complete untouched on the shipped map | **Met** | No mission file changed except `parkLitter`'s candidate filter; missions played through on the device sitting with the cars standing. |
| AC8 | `pnpm check`, `pnpm typecheck`, `CI=true pnpm test` green; >80% coverage on the logic touched | **Met** | Biome 129 files clean, `tsc --noEmit` clean, **712 tests across 57 files**; `parkedShadows.ts`, `collision.ts`, `inputRouter.ts`, `kerbReservation.ts`, `parkSlots.ts` and `townMap.ts` at 100%, `townTypes.ts` 95%+ branch. |
| AC9 | Triangles/frame, draw calls and precache entries/KiB measured and recorded in `tech-stack.md` with the budget note | **Met** | `tech-stack.md` carries the three-way measurement and the over-budget note; `pnpm build` 48 entries / 4,186.67 KiB. |
| AC10 | iPad pass — cars read as parked cars at play distance, blobs read as shadows, missions unaffected, fps unchanged, all four GLBs present offline | **Met** | One sitting: cars read as parked cars and the blobs as shadows, no new stutter while the town was busiest, and all four car models load with the network off. |

### How the desktop pass was driven

The drive-through was driven in the real render loop in the browser at the dev
server: a head-on bonk and a graze at the six cars, then a centre-line run along
every street, then taps beside a car. All clean.

The performance figures came from counting GL draws per frame — the same method
the earlier sweeps used, but reached differently and more honestly than before:
a hook on the WebGL draw calls installed *from the browser*, needing **no source
edit at all** (the v1 and consolidation sweeps each needed a temporary probe in
the entry file, restored afterwards). The control run — the same page with the
six parked cars temporarily removed from the town map — did need a source edit,
which was reverted and verified with `git diff --exit-code` on `townMap.ts`
before anything else was done.

### The performance budget, re-measured

| | No parked cars | As first shipped | **Shipped** |
| --- | --- | --- | --- |
| Triangles per frame | 38,310 | 59,768 | **51,130** |
| Draw calls | 138 | 245 | **171** |

So the six cars and their merged blob cost **+33 draw calls and +12,820
triangles** over the car-free scene — against the +32 draws and +12,808
triangles the spec predicted before implementation. The middle column is not a
variant that shipped: it is what the scene actually cost while the cars were
casting a real shadow *as well as* their blob, which the measurement is what
found.

**Stated plainly: 51,130 triangles per frame is about 1.1k over the spec's ~50k
heuristic — the first time this project has been over that line.** The frame rate
is unchanged on the floor device in this sitting, so nothing needs ratcheting
down yet; `tech-stack.md` lists the levers (four cars on the roomiest kerbs, or
lower-detail karts for two of the six) for whenever a sitting says otherwise.
The no-car baseline also drifted for the first time here — 138 draws / 38,310
triangles against the 133 / 37,802 recorded before this track — because the park
track's trees, dumpster and props landed in between.

### The parked-cars device pass — one sitting

The v1 sitting above still covers town, vehicles, panel and offline play. What
six parked cars add, on an iPad:

1. **Load it and look down a street.** Six cars, four shapes, each sitting on
the kerb *beside* a house rather than in the road, each lying along its own
street.
2. **Drive into one.** It should squish, honk, and carry on to where you tapped
— never stop the truck, never leave it stuck inside the car.
3. **Graze one.** Same again, clipping a corner.
4. **Drive the middle of every street.** The centre line must be clear; nothing
should bonk.
5. **Tap the ground just beside a car.** The truck should head for your finger,
not for the car's centre, and the car itself must not react.
6. **Look at the shadows.** Each car's shadow should fall to the same side as
the houses' — away from the sun — and read as a shadow rather than a dark patch
floating under the car.
7. **Play a mission through** with the cars standing, including the park
clean-up, whose kerbside litter must never sit inside a car.
8. **Go offline** (airplane mode, app closed and reopened) and confirm the four
car models still appear — they are 783.6 KiB of the precache.

### What to report back (parked cars)

- Any car that reads as "in the way" rather than "parked" — a kerb that leaves
  it looking abandoned mid-road.
- Any bonk that felt unfair, or any leg that seemed to give up beside a car.
- Whether the blobs still read as shadows at an angle, or from the far side of
  the town.
- Anything a small child would have got wrong driving past a car.

### Issues the pass turned up

Nothing visible, and that is the interesting part: the desktop drive and the
iPad sitting both came back clean, while the *measurement* found the fault this
track had shipped with.

- **The cars were in the shadow-map pass after all.** FR7 says they carry a blob
  *instead of* a real shadow, and the reason given is the cost — six more casters
  means re-rendering the town per frame into the 1024 map. But the model library
  sets `castShadow` on every mesh it prepares and no placement could opt out, so
  each car was drawn twice and its blob double-darkened ground a real shadow
  already covered. Nothing about the picture said so; the draw-call count did
  (245 where the plan predicted ~165). **Fixed:** `ModelPlacement.castsShadow`,
  with the cars the only placement that says no — the 245 → 171 drop is that fix
  measured. Tests were written red first for both halves (the layout contract and
  the renderer honouring it).
- **Two claims were corrected rather than shipped.** The spec's budget row said
  "delta ~600 triangles, budget ~52k", and an interim note in this track put the
  six cars at 52,056 triangles; both were written before anything was measured.
  The real figures are +12,820 and 12,796 respectively — the earlier one had
  multiplied the four-*model* sum by six — and the spec now records the measured
  numbers beside its (correct) prediction.
