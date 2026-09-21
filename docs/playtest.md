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
   should land.
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
