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
