# Specification: Instant-Answer Vehicle Switching

**Type:** Bug
**Branch:** `track/instant-vehicle-switch`
**Track ID:** `instant-vehicle-switch_20260926`

## 1. Overview

The vehicle switcher is the only control in the game that does not answer a tap.

Every other interaction produces a visible answer inside one frame. A world tap
draws its ring before the first `await` (`game.ts:1363`), deliberately placed
ahead of routing so an unreachable tap is still answered. An ability press
bursts and dims its button. A honk rings the ground. The vehicle buttons do
none of this, because their only visual state change is `hud.setActive`, and
that is reached from `activate()` (`game.ts:649-654`) — which runs only after
`commitVehicleActor` has awaited `loadVehicleActor` → `library.instantiate` →
`load` (`game.ts:665-683`, `708-745`, `1628-1630`).

`ModelLibrary` is fetch-once-and-cache (`modelLibrary.ts:131-146`) and nothing
preloads the fleet, so the **first** tap of each of the four vehicles is silent
until that GLB is fetched, parsed, cloned, seated, and committed. On a cold
first visit that is a beat measured in hundreds of milliseconds, on a shared
family tablet, on the largest, brightest, most tempting control in the game.

`product.md` makes an answered tap a success criterion and names "repeated
ineffective taps" as a frustration marker that must not be attributable to
controls. `product-guidelines.md` requires visible feedback within roughly
100 ms and a toy that visibly answers being pressed. This track restores that
promise for the one control that currently breaks it.

## 2. Goals

1. Every vehicle-switch tap produces a visible answer within the same frame as
   the pointer event, on a cold cache and a warm one.
2. Make the first tap of every vehicle as fast as the rest by warming the fleet
   during the boot window that already exists.
3. Keep the answer honest: the pending state clears on every terminal outcome,
   including failure and supersession, and never outlives its own request.
4. Leave the existing async intent arbitration untouched. It is deliberate,
   reviewed, and already device-verified.

## 3. Functional requirements

### FR1 — Immediate acknowledgement of a switch tap

- A tap on a vehicle button must produce a visible change to that button within
  the same frame as the pointer event, before any `await`.
- The pending button must wear the target vehicle's colour and show a steady
  ring, reusing the visual language already on screen (the active lift and the
  parent gate's hold ring). No new concept to learn, no text.
- The ability button must point at the target vehicle's ability at the same
  moment, so the HUD never advertises the previous vehicle's trick while the
  child is choosing.
- The pending indicator must be a steady ring, not a timed fill. A warm switch
  settles in a few milliseconds, so a timed fill would either never be seen or
  need an arbitrary minimum duration; an animation that misreports a duration
  the child can perceive is worse than no animation.
- Non-visible accessibility metadata may describe the pending state. No visible
  string may be introduced.

### FR2 — Fleet prewarming

- All four hero vehicle models must be requested during the boot window: after
  the town base is on screen, in parallel with the hero model's own load.
- Prewarming must never gate, delay, or reject `game.ready`. A prewarm failure
  must not become a boot failure, and must not surface in child-facing UI.
- Prewarming must reuse `ModelLibrary.load`, so a later switch is a cache hit and
  issues no second network request.
- Prewarming must not create a second town, duplicate model instances, or alter
  the library's existing evict-on-failure behavior, which is what lets a failed
  model be retried later.
- No new asset, no new precache entry, no new dependency. The four GLBs are
  already in the 49-entry precache.

### FR3 — Honest settle

- The pending state must clear on every terminal outcome of the request that set
  it: commit, supersession-skip, and failure.
- If a newer tap is already pending when an older request settles, the older
  request must not clear the newer pending state.
- A failed switch must revert to the last committed vehicle with the HUD
  consistent with it, and must never leave a permanently ringed button.
- The pending state cannot outlive `game.ready`; a tap cannot arrive before the
  HUD exists.

### FR4 — The arbitration is not re-opened

- The existing generation-based skip behavior (`game.ts:785-792`) must remain
  unchanged, and its tests must pass unmodified.
- A pending state must not suppress, delay, or override `hud.setActive` when a
  request commits. Arbitration decides what becomes active; the pending state
  only records what the child last asked for.
- If an in-flight request commits while a newer tap is pending, the committed
  vehicle shows active and the newer tap keeps its ring. The brief disagreement
  is correct, not a defect: the child did tap the committed vehicle first, and
  the arbitration track already made this call deliberately.
- Only a `selection` — a tap on the switcher — raises a pending state.
  Mission-driven morphs, the helper hand's siren demo, and direct test/helper
  swaps must not.

### FR5 — Existing product contracts

- Zero visible text, offline-first operation, and no new persistence remain
  mandatory.
- Existing vehicle, mission, traffic, camera, audio, and render behavior is
  unchanged after readiness.
- The `GameHud` port grows only what this needs, and must keep no-oping before
  the real HUD exists, exactly as it does today.

## 4. Non-functional requirements

- The rendered answer must land within the project's approximately 100 ms
  response target, and in the same frame as the event that caused it.
- Prewarming must add no measurable per-frame cost after readiness, and no new
  draw calls or triangles.
- Boot wall-clock must not regress. Prewarming runs concurrently with work
  already in flight, never ahead of it.
- The new state must be unit-testable through the existing `game.test.ts` fake
  library seams, with no real GLB and no network.

## 5. Acceptance criteria

- **AC1 — Same-frame answer:** on a cold cache, a vehicle tap shows that
  vehicle's colour and a ring within the frame of the tap, with the ability icon
  already switched.
- **AC2 — Warm speed:** after boot, switching to each of the four vehicles
  commits with no network request.
- **AC3 — Honest settle, success:** the pending ring clears exactly when the
  vehicle commits, and the active state takes over.
- **AC4 — Honest settle, failure:** a model that fails to load leaves the
  previous vehicle active, leaves no button ringed, and produces no unhandled
  rejection. A later retry can still succeed.
- **AC5 — Honest settle, supersession:** rapid fire → garbage → police leaves
  the newest tap pending until it settles, the skipped middle request does not
  paint, and the final active vehicle is police.
- **AC6 — Arbitration intact:** the full existing arbitration behavior is
  unchanged and its tests pass without modification.
- **AC7 — Boot unaffected:** prewarming does not delay `game.ready`, does not
  fail boot when a hero model 404s, and adds no precache entries.
- **AC8 — No text:** no visible string is introduced anywhere. The pending
  state is colour and ring only.
- **AC9 — Gates:** existing tests pass, new tests pass, `pnpm check`,
  `pnpm typecheck`, and `pnpm build` pass, new logic is above 80% coverage, the
  scene inventory and draw-call counts are unchanged, and both the manual
  browser verification and the physical iPad 9th-generation check pass.

## 6. Out of scope

- Acknowledging an ability press that lands while the 1.5 s burst is running.
  It is a real gap and a small fix, but it reaches into the shared burst pool
  and widens the surface beyond the switch.
- The byte-identical ice-cream glyph shared by the select button and the ability
  button.
- Persisting the mute state across reloads.
- `contextmenu` / iOS callout suppression, and the parent panel's full-screen
  blocker. Both are separate, more urgent tracks.
- Adaptive quality, pixel-ratio policy, or shadow policy of any kind.
- Any change to the arbitration, the request queue, the generation scheme, or the
  commit/restore protocol.
- A new sound for the switch. The existing commit poof remains the switch's
  sound, and on a warm cache it lands within a frame or two of the tap.

## 7. Technical notes

- The pending state belongs in `game.ts`: it is the only place that knows the
  request modes, the queue, and every terminal outcome. It reaches the DOM
  through a new `GameHud` method carrying the pending vehicle id, or `undefined`
  for none.
- `vehicleHud.ts` renders it as a class on the buttons that already exist. The
  ring style goes in `index.html`, modelled on the existing `.panel-gate` hold
  ring and `.hud-button.is-active`, keeping the styling-by-class convention.
- Prewarming belongs in `game.mount`, alongside the existing base-ready and
  hero-model sequencing, iterating `VEHICLE_IDS` through `ModelLibrary.load`.
  It must be fire-and-forget with respect to `ready`.
- The `GameHud` port in `main.ts` gains a matching no-op closure, preserving the
  pre-HUD contract that the port is safe before the real HUD is built.
