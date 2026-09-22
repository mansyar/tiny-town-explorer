# Tiny Town Explorers — Product Definition

## Summary
Tiny Town Explorers is an offline-first 3D toy-car sandbox PWA for children
aged 3–5 — an interactive digital toy rug where kids drive a Fire Truck,
Ice Cream Truck, Garbage Truck, or Police Car around a low-poly suburban town
built from Kenney's CC0 city and car kits. Kids tap anywhere to send
their car along the road network (road-hopping on the street tiles, then
finishing over grass), bouncing harmlessly off cones, poles, and houses with a
squish-and-resume bonk. The design pillars are absolute: zero text (icons and
sounds only), zero failure (no timers, no penalties, no wrong choices), and
pure agency (every tap gets a response). The v1 slice ships all four vehicles
as free-play toys with live special abilities plus four missions — putting out
migratory cartoon kitchen fires with tap-burst hose sprays, delivering a cone
to whichever house raises an ice-cream order, clearing the park litter from
under the garbage truck's wheels, and finding the lost puppy with the siren
and carrying it home to its owner. Built with Vite + TypeScript + three.js and a
workbox-precached service worker, it targets 60fps on an iPad 9th gen in any
orientation, remembers nothing between sessions, and never says a word.

## Problem & Opportunity
Digital games for preschoolers are flooded with timers, ads, failure states,
and reading requirements — the opposite of what early-childhood play needs.
There is no good "digital toy rug": an open-ended, calm, textless toy that
works offline on the family tablet. Tiny Town Explorers fills that gap.

## Target Audience
- **Primary:** Children aged 3–5 playing on shared family tablets
  (iPad 9th gen is the performance floor).
- **Secondary:** Parents/caregivers who install the app and value zero-text
  design, offline play, kid-safe volume caps, and locked-down settings.

## Design Pillars
1. **Zero Text** — every instruction is conveyed via floating icons, sound
   effects, and spatial cues. No reading required, ever.
2. **Zero Failure** — no timers, no penalties, no wrong-choice audio. Every
   interaction resolves in delight.
3. **Pure Agency** — every tap gets an immediate, visible response;
   controls never fail.
4. **Offline First** — fully playable with no Wi-Fi; installable PWA.

## v1 Scope — Playtest Slice
- Full low-poly suburban town on a Kenney City Kit (Roads) tile grid (the
  road tiles double as the pathing graph).
- All four vehicles drivable as free-play toys with live special abilities:
  water spray, ice cream jingle, trash gulp, siren.
- Tap-to-move with road-following pathing: route along track tiles, finish
  over grass; newest tap wins under multi-touch chaos.
- Bounce-and-resume collisions: squish, bonk, horn, auto-resume — never
  stuck, never penalized.
- Four missions taking turns through one town-at-a-time gate. "Put Out the
  Kitchen Fire!": fires spawn at a new house ≥2 houses from the previous one
  with 60–90s calm gaps; tap-to-morph vehicle swap; tap-burst hose (3–4 bursts
  extinguish); confetti resolution. "Ice Cream Delivery": a house orders with a
  bouncing cone + music-note icon (readable at 48px) and one soft jingle; the
  kid taps the truck's ability to jingle it, drives over, and taps the house to
  serve one cone. "Clean Up the Park": litter bounces across the park tiles and
  the ring-road kerbs; driving over a piece gulps it and the ability press
  sweeps a nearby cluster. "Lost Puppy": the police siren answers the town's
  quiet whine, the pup is found by driving over it and carried to the owner's
  door — and its paw print always shows where to drive, even when the pup is
  hiding behind a house or a tree. Whichever mission runs pauses the rest, and
  each waits patiently forever. Every mission ends on the same beat: confetti,
  the smiling sun, a cheer, and a small completion sparkle burst at that
  mission's own site — exactly one per completion, and never during free play.
- Inactivity helper: after 10s mid-mission, a hand traces the route and
  performs one demo tap.
- Parent panel behind a hold-3s filling-ring gate: a sound toggle and a
  helper-hand toggle, icons only. No music toggle (the game ships no music
  track) and no attribution in the UI (the kits are CC0 and ask for none;
  provenance lives in the repo's asset READMEs).
- Audio: silent until first tap (Web Audio unlock), always-visible mute
  icon, kid-safe volume cap; CC0 sounds + synthesized jingle.
- Any-orientation play; ortho camera tracks the active car.

## Out of Scope (v1)
- AI traffic or wandering cars (static parked cars also deferred).
- Any persistence or save system — sessions start fresh by design.
- Any written language in-game, including settings screens.

## Success Criteria
- A 3–5-year-old completes a fire mission without adult help in their
  first session.
- Zero frustration markers in playtests (abandonment, crying, repeated
  ineffective taps) attributable to controls.
- Stable 60fps on the performance-floor device; fully playable offline
  after first load.
- Parents can find and use the parent panel without instructions.

## Roadmap (v2+)
- No new missions planned. All four (fire, ice cream, park clean-up, lost
  puppy) shipped and now run on one shared mission framework —
  `mission-framework-consolidation_20260922`, 2026-09-22.
- Optional session sticker board, only if playtesting shows value against
  shared-tablet sibling conflicts.
- Static parked cars, then light wandering traffic, for town liveliness.
