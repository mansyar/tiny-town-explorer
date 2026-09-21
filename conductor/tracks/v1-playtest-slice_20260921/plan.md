# Implementation Plan: v1 Playtest Slice (MVP)

> Track: v1-playtest-slice_20260921 · Spec: `spec.md` (this track) ·
> Workflow: `conductor/workflow.md` · TDD scope: logic-bearing modules
> only (Red→Green tasks); visual/scene/asset work records manual
> verification intent in its task summary.

## Phase 1 — Project Scaffold & Toolchain [checkpoint: 4d3b0e3]

- [x] Task: Initialize Vite 8 + TypeScript 7 strict project with pnpm 12.4 [e12ea79]
    - [ ] package.json with `packageManager` field (corepack), deps:
          three, vite, vite-plugin-pwa, vitest, @biomejs/biome
    - [ ] tsconfig strict, vite.config.ts, index.html shell (touch-action
          none, theme #87CEEB), .gitignore
    - [ ] Scripts: dev / build / preview / check / typecheck / test
    - [ ] Verify peer ranges (vite-plugin-pwa vs Vite 8, Vitest 5 vs
          Vite 8); if deviation, STOP → update tech-stack.md with dated
          note (workflow rule 7)
- [x] Task: Configure Biome 2.5 + Vitest 5 (biome.json, vitest.config.ts) [23e1871]
- [x] Task: vite-plugin-pwa skeleton — manifest (standalone, orientation
      any, 192/512 placeholder icons), autoUpdate registration [3c41783]
- [x] Task: Render-loop smoke test — three.js scene boots, empty town
      ground renders in dev and preview builds [d6df284]
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
      [4d3b0e3]

## Phase 2 — Town Data, World & Camera

- [x] Task: TDD TownGrid module (Red→Green) [b1532b2]
    - [ ] Test: typed map constants parse into tile grid, lots, props,
          spawn points from a single hand-authored 6×6 layout
    - [ ] Test: adjacency queries (tile neighbors, lot lookup by point,
          props by proximity radius)
- [x] Task: Render town from data — Kenney track tiles as road grid,
      houses on lots, park corner, hydrants/poles (visual; manual verify:
      layout matches authored map, no z-fighting) [abd0953]
- [x] Task: CameraRig — orthographic ~45° tilt, medium framing (car ≈15%
      of viewport height), smooth follow, frustum refit on any
      orientation/resize (manual verify on portrait + landscape) [3151a39]
- [x] Task: Asset pipeline — download/commit Kenney Toy Car Kit + City
      Kit (Suburban) GLBs, GLTF loader with shared material setup,
      measure initial triangle count (start ~50k budget) [3cc6af0]
    - [x] Measured: 197 models / 74,329 tris committed (8.16 MiB); town
          projection ~25k tris (see note: contradicts tech-stack 15k)
    - [x] Gap: Toy Car Kit has no T-junction/cross piece for the two tees
          the authored map needs. Measured the track pieces and found the
          real problem: they are 0.30-thick raised slabs with striped side
          walls, i.e. a race track, not street paving. Superseded by the
          City Kit (Roads) decision below (`kit-mount-measurements.md`)
- [x] Task: Adopt City Kit (Roads) for the road grid (plan amendment,
      2026-09-21, replacing the planned Blender-authored T-junction)
      [23d24af]
    - [x] Downloaded, packed and committed all 95 models (palette embedded
          under `city-kit-roads/colormap`, 2.8 MiB); licence + provenance
          recorded in `src/assets/kits/README.md`
    - [x] Measured the mount with `scripts/blender-analyze-kit.py`: 1.00 x
          1.00 tiles, base z = 0.00 with the surface at +0.02, so the
          existing `tileSize: 1` map needs no rescaling and needs no
          per-family seating offsets; `road-intersection` is the T the two
          tees needed, `road-crossroad` the 4-way, `road-curve` a 2x2 bend;
          props include `electricity-pole` (the spec's pole)
    - [x] Abandoned the Blender-authored piece and deleted its artifacts
          (recipe, GLB, renders) once the rendered fit showed walls running
          through a town street; the skill's authoring conventions were
          dropped from tech-stack.md in favour of the measurement tooling
    - [ ] Outstanding: the spec's crashable **hydrant** still has no kit
          model (Roads has pole/cone/sign/light/dumpster) — substitute or
          author one when the collision phase lands
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
      [checkpoint: 13d2bad]
- [x] Task: Wire the kit models into the rendered town (was the implicit
      second half of 'Render town from data') [c70f12e]
    - [x] `townLayout.ts` — pure plan (no three.js) deciding what mounts where:
          road tile + yaw per derived shape, houses cycling the building
          registry and capped to their lot, props keyed to their kind
    - [x] `townRenderer.ts` — async mount, seats every model by measured
          bounding box and fits oversized kit buildings to their lot
    - [x] Orientation measured, not assumed: the recon tool now reports which
          tile edges each palette swatch reaches, which pins the bend's elbow
          (west + south), the tee's stem (south) and the dead end's opening
          (east); three.js confirmed positive yaw is counterclockwise
    - [x] Ground stays lawn quads — City Kit (Roads)' `tile-low` is pavement,
          and the town wants grass under its lots; ring corners use the 1 x 1
          `road-bend-square`, so no map reshaping for the 2 x 2 `road-curve`
    - [x] Spec gaps taken by real kit art: the crashable hydrant becomes a
          traffic cone (no Kenney kit ships a hydrant), documented in
          `townTypes.ts`
    - [x] Measured: 16,221 triangles / 79 meshes mounted, 19 models emitted and
          precached; `tech-stack.md`'s 15k figure replaced with the measured
          number and a ~20k projection including four vehicles
    - [ ] Deferred: vehicles do not exist yet (VehicleSystem is Phase 5), so
          nothing rides at the +0.01 asphalt level this task; wire them then
- [x] Task: Model-wiring Phase Verification & Checkpoint (Refer to
      workflow.md) [checkpoint: c70f12e]

## Phase 3 — Input & Tap-to-Move [checkpoint: a59a747]

- [x] Task: TDD InputRouter (Red→Green) [769880b]
    - [x] Test: newest-tap-wins command supersession (mash safety) —
          `latest()`/`isCurrent()`; a honk keeps its id but does not
          supersede, so feedback never abandons the chosen destination
    - [x] Test: dead-zone classification (<0.5u → bounce-and-honk
          event, no path emitted) — judged on the resolved target, so a tap
          on a prop under the car honks instead of shuffling on the spot
    - [x] Test: tap-to-prop snapping (within snap radius) — 0.45, nearest
          prop wins, collision radius still governs the bonk itself
    - [x] Test: ground-plane raycast projection — screen centre resolves to
          the camera's focus, screen-right lands camera-right (not mirrored),
          taps beyond the frustum stay finite, and a camera aimed at the
          horizon answers with a honk rather than nothing
    - [x] Wired to the pointer listener in `main.ts` once the motor landed; a
          tap outside the town now clamps to its edge (`TownGrid.bounds`), so
          no tap can send the car off the map
- [x] Task: TDD Pathfinder (Red→Green) [95e0cdc]
    - [x] Test: tile adjacency/BFS route over road grid — shortest *hops*, so a
          route cuts through the middle rather than going round the ring
    - [x] Test: nearest-road-point snap for grass taps — by road tile centre,
          matching the grid's own `worldToTile` rounding
    - [x] Test: road-hop-then-grass path composition (waypoints + grass
          leg) — waypoints at tile centres keep the car on the 0.60 asphalt
          through corners; the destination stays the raw tap point
    - [x] Extra: the authored map is pinned as fully connected (every road tile
          routes from the spawn point), and every waypoint lands on a road
    - [x] Wired: `main.ts` calls `findPath` per tap and hands the route to the
          motor; the target ring is the last consumer outstanding
- [x] Task: VehicleMotor waypoint follower — rotate-then-drive, constant
      speed, arrival radius (logic; extend TDD tests: arrival, rotation
      easing determinism) [a6283ca]
    - [x] Test: arrive-and-stop, waypoint cursor advance, supersession mid-route
    - [x] Test: rotate-then-drive holds the line — a 20° alignment tolerance
          left the car on an arc (≈1.3cm off) and transiently overshooting its
          heading, so the tolerance is one frame of turning instead
    - [x] Test: the kit's vehicles are authored facing −z (a truck's taller
          cargo half sits along +z) while town models face +z, so the model
          takes a half turn inside its holder or it drives cab-last
    - [x] Wire the phase's modules in `main.ts`: pointerdown → tapAt →
          isCurrent → findPath → setPath, with the rig following the car
    - [x] Fix found in the browser, not in a test: a tap outside the town
          resolved into the void and drove the car off the map. The grid now
          exposes its footprint and the router lands such taps on the edge —
          which is ring road all the way round, so they end on a street
    - [ ] The final stretch to a tap still crosses lots unopposed (a car can
          pass between or through houses): obstacle-aware pathing per FR3 and
          building hitboxes per FR4 arrive with the collision phase
- [x] Task: Expanding target ring + drive feel polish (visual; manual
      verify: instant ring, smooth turn, constant speed) [a59a747]
    - [x] Test: `ringFrame` pinned pure — starts small and opaque, ends at full
          radius and zero opacity, monotonic, fastest expansion first, and both
          negative and over-long elapsed times clamp
    - [x] One ring, not a pool: the newest tap restarts the pulse, so a mash
          cannot litter the street; a unit ring is scaled, so pulses allocate
          nothing
    - [x] Answers both outcomes — at the destination for a drive, at the car for
          a dead-zone honk — so no touch is silent, within the 100ms budget
    - [x] Verified by watching it drive: turn-in-place then a constant 1.6 u/s
          on the line through both junctions and both bends, and a mid-route
          tap replaces the route (a 0.45s pulse is easy to miss between tool
          calls, so it was sampled live over seconds and re-checked at speed)
    - [ ] Noted for polish: an out-of-town tap is clamped to the map edge, so its
          ring sits half over the edge of the world — accurate, since that is
          the destination the car drives to, but it reads as "go where there is
          no ground"
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
      [checkpoint: a59a747]

## Phase 4 — Collisions: Bounce & Resume [checkpoint: ee538c2]

- [x] Task: TDD collision resolution (Red→Green) [5807fdb]
    - [x] Test: hitboxes derived from TownGrid map data — houses as boxes on the
          same `HOUSE_LOT_FIT` cap their models are scaled to, props on the
          radii the grid already publishes for tap snapping
    - [x] Test: circle-vs-AABB sweep along path → bonk event — swept rather than
          sampled, because one frame at 1.6 u/s passes clean through a cone
    - [x] Test: auto-resume with no stuck state — a crashable prop is bumped
          once per route and driven past (it can never block a journey), while a
          building consumes the leg that ran into it, so the cursor only ever
          advances; plus an integration test driving real routes around the town
    - [x] Fix found in the browser: the bounce reversed the car's heading, so a
          glancing corner hit fired it *into* the wall and a repeated tap walked
          it further in. The recoil now comes from the contact geometry, and an
          overlapping car is pushed out along the surface's shortest exit
    - [x] Squish and bounce-back landed with the resolution itself; the bonk
          sound moved to Phase 5 (see the next task for why)
- [x] Task: Squish animation, bounce-back offset (visual; manual verify:
      comedic squash, no snag) [5807fdb]
    - [x] Delivered with the collision response: the body flattens to 25% and
          spreads 15% over the recoil, read from the motor's bounce progress so
          the animation cannot disagree with the motion
    - [x] Seen on the running build (model scale `[1.105, 0.825, 1.105]`
          mid-bonk) and pinned by tests; verified at speed with the recoil
          temporarily held open, then both temporary changes removed
    - [x] Scope deviation, 2026-09-21: the task named a bonk *sound*, which
          moves to the AudioEngine task in Phase 5 — FR8 requires first-tap
          unlock, a kid-safe master gain cap and a mute node around every
          sound, and a bare blip now would be replaced wholesale
- [x] Task: Correction (2026-09-21, found in phase verification) — match house
      hitboxes to the mounted art [ee538c2]
    - [x] Reason: the box was built from the lot-fill cap on both axes, but the
          cap bounds only a model's *widest* axis, so the car stopped up to 0.18
          units short of a wall on the narrower one (measured: house-2 art half
          0.268 against a 0.43 hitbox)
    - [x] Fix: the renderer publishes each mounted building's measured, turned
          bounding box; `collectObstacles` builds the box from it, falling back
          to the lot cap only when no measurement is supplied
    - [x] Second, deeper bug surfaced by the first: the car's own footprint was a
          single 0.26 circle, right for its 0.525 width but 0.17 short of its
          0.8625 nose, so an honest house box let the bonnet sink into the wall.
          The motor now sweeps and depenetrates a two-circle capsule
    - [x] Tests: the renderer publishes one footprint per house with the model's
          own aspect; collision uses the measurement and keeps the cap when none
          is supplied; the motor stops nose-first and clears itself when embedded
    - [x] The kerb props needed no re-seating: re-measured against the art boxes,
          each is bonked before the house behind it on every approach, so they
          stay crashable
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
      [checkpoint: ee538c2]

## Phase 5 — Vehicles & Abilities

- [x] Task: Source the fleet's art — three from the Car Kit, one authored [61dfa87]
    - [x] Vendor the CC0 Car Kit (fire truck, garbage truck, police car) behind
          the existing pack pipeline and register the three in VEHICLE_MODELS
    - [x] Author the ice-cream truck in Blender
          (`scripts/blender-ice-cream-truck.py`) to the Car Kit's measured
          contract: 66.3 KiB packed, every GLB gate passes, palette matches
    - [x] Rework it against the reviewer's reference — a forward-control van,
          pink under cream with a yellow roof stripe, grille and headlights over
          a bumper, blue-hubbed wheels, and a point-down waffle cone with a
          vanilla swirl and a cherry seated on the roof
- [ ] Task: TDD VehicleSystem (Red→Green)
    - [ ] Test: four-vehicle registry, active-vehicle switching state
    - [ ] Test: per-vehicle ability one-shot dispatch (spray burst,
          jingle+cones, gulp, siren) as typed events
    - [ ] Test: engine-loop pitch mapping (speed→playbackRate curve)
    - [ ] Test: burst audio scheduling (1–2s one-shots, interruptible)
- [ ] Task: AudioEngine — first-tap unlock, mute node, kid-safe gain
      cap, CC0 one-shot loading, oscillator jingle (jingle note
      scheduling covered by test above; wiring manual)
- [ ] Task: HUD vehicle switcher — 4 buttons ≥72px, active highlight
      (visual; manual verify with touch)
- [ ] Task: Poof morph + ability visuals — droplets, floating cones,
      star particles, siren flash (visual; manual verify)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6 — Fire Mission (FSM, Pacing, Effects)

- [ ] Task: TDD MissionManager FSM (Red→Green)
    - [ ] Test: IDLE→SPAWNED→DRIVING_TO_MISSION→ACTIVE→COMPLETE
          transitions and illegal-transition guards
    - [ ] Test: tap-to-swap morph trigger; proximity-reveal guard for
          hose button
    - [ ] Test: burst counter (3–4 taps → extinguished)
- [ ] Task: TDD fire pacing (Red→Green)
    - [ ] Test: calm-gap spawn timer (60–90s randomized)
    - [ ] Test: next house ≥2 houses from previous (map-aware choice)
    - [ ] Test: no spawn while mission active
- [ ] Task: TDD helper-hand idle logic (Red→Green): 10s inactivity
      mid-mission → single demo-tap event + ≥10s cooldown
- [ ] Task: Fire visuals — smoke puffs, flame mesh shrinking per burst,
      confetti + smiling sun, alarm chime, hose button (visual; manual
      verify full mission on tablet)
- [ ] Task: Helper hand trace animation (visual; manual verify timing)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 7 — HUD, Parent Panel & Polish

- [ ] Task: TDD hold-gate logic (Red→Green): 3s continuous hold → open
      event; release early → cancel; repeat fires only once
- [ ] Task: Parent panel UI — textless toggles (SFX, music, helper
      hand), attribution behind gate (visual; manual verify)
- [ ] Task: Mute button + add-to-home-screen animated hint, one-time
      per session (visual; manual verify)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 8 — PWA, Cloudflare Pages & Playtest Hardening

- [ ] Task: Finalize manifest + real 192/512 icons from Kenney art
- [ ] Task: Cloudflare Pages runbook (docs/cloudflare-pages.md): git
      connect steps, build command `pnpm build`, output `dist`; first
      deploy verified (manual)
- [ ] Task: Offline verification — load once, airplane-mode reload
      fully playable (manual)
- [ ] Task: Performance profile on iPad-class device — fps + triangle
      count measured; ratchet budget down only if needed; record
      numbers in tech-stack.md (manual)
- [ ] Task: Acceptance-criteria sweep (spec AC1–AC10) + fallout fixes
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) —
      includes playtest-link handoff
