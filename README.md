# Tiny Town Explorers

An offline-first 3D toy-car sandbox for children aged 3–5. A low-poly suburban
town, four service vehicles with their own voices and tricks, and a tap-to-drive
car that bounces harmlessly off anything it meets. It works on a tablet with no
network, it never says a word, and nothing in it can be lost or failed.

Built with Vite, TypeScript and three.js. No game engine, no framework.

## The rules it is built to

Four design pillars, held absolutely rather than aspired to:

- **Zero text.** No written words anywhere in the game, the settings included.
  Every concept is an icon or a 3D cue, because the audience cannot read yet.
- **Zero failure.** No timers, no penalties, no wrong-answer sounds. A mistake
  resolves as comedy — the bonk — never as an error.
- **Pure agency.** Every tap gets an answer. The car always moves, the camera
  always keeps it in frame, and there is nothing to break or miss.
- **Offline first.** The whole game is precached by a service worker, so after
  the first visit it plays with the radio off.

## What is in it

- A hand-authored town on a road grid — the road tiles *are* the pathing graph.
  It is a figure-eight: two block loops meeting at one junction, with a corner
  shop on the corner and a pond with ducks on the green. Tap anywhere and the car
  hops the roads and finishes over grass.
- Four drivable vehicles: fire truck, ice cream truck, garbage truck and police
  car. Each has its own engine note and its own one-shot — a hose burst, a jingle
  with dropped cones, a gulp, a siren wash.
- **Four errands**, one at a time, each opening after the same quiet gap. **Put
  out the kitchen fire**: tap the burning house, become the fire truck, and hose
  it down. **Ice cream delivery**: a house raises a bouncing cone, jingle on the
  way over, then tap the house to hand it over. **Clean up the park**: drive over
  the litter to gulp it, or sweep a whole cluster with the truck's ability.
  **Lost puppy**: the police siren answers the town's whine, and a paw print
  shows where to drive until the pup is found and carried to its owner's door.
  Every one ends the same way — confetti, the smiling sun, a cheer, a sparkle.
- A helper hand that, after ten quiet seconds mid-mission, traces the route and
  performs a single demo tap — then backs off.
- Six parked cars on the kerbs, and three more that wander the rings on their own
  errands. They are scenery: silent, and bonked rather than blocked, so the truck
  always carries on.
- Parent settings behind a three-second hold on a small gear: sound, and the
  helper hand. No words, and nothing a child would stumble into.

## Running it

Needs Node 24 and pnpm 12.4 (pinned by `packageManager`).

```bash
corepack enable
pnpm install
pnpm dev          # http://localhost:5173
```

| command | what it does |
| --- | --- |
| `pnpm dev` | Vite dev server, LAN-exposed for testing on a real tablet |
| `pnpm build` | type-check, then emit `dist/` with the service worker |
| `pnpm preview` | serve the built output on port 4173 — the closest thing to the deployed site |
| `pnpm check` / `pnpm check:fix` | Biome |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest, single run |
| `pnpm assets:measure` | triangle counts and sizes for the vendored kits |

## How it is put together

Plain TypeScript modules with a narrow seam between rules and hardware. The
logic-bearing parts — pathfinding, tap resolution, the collision response, the
mission state machine, fire pacing, the helper hand's patience, the audio
schedule — are pure: no renderer, no wall clock, no DOM. Their timing is injected
through an `update(delta)` call, which is what lets a whole mission run in
milliseconds in a test.

The scene, asset and DOM layers sit on top of that and are verified by hand in a
browser, because a passing unit test says nothing about whether a car looks like
it stopped at a wall instead of in it. Twice during development a fault lived in
the *wiring* — a burst clock nobody ticked, a mission update nobody called —
while the logic beneath it was fully covered. That is why `conductor/workflow.md`
splits the two.

On top of that sits the **game controller**, `src/game/game.ts`. It owns the
world — the model library, the town, the car, the traffic, the pond, every
mission subsystem and feedback object — and it reaches the page only through
four narrow ports (`audio`, `hud`, `scene`, `camera`) that `main.ts` supplies.
`main.ts` is the edge and nothing else: the renderer, the camera rig, the parent
panel and install hint, the input router, the audio engine, and the wiring
between them. That split is what lets the whole game frame run in a unit test
against fakes, with no WebGL, no Web Audio and no DOM.

```
src/game/
  game.ts     the controller: the world, the session rules, the frame
  assets/     kit loading and the model registry
  audio/      Web Audio engine, schedules and samples
  collision/  hitboxes and the sweep that resolves a bonk
  feedback/   tap rings, ability bursts
  hud/        vehicle switcher, parent gate and panel, install hint
  input/      tap resolution (raycast, dead zone, newest-tap-wins)
  mission/    fire state machine, pacing, helper hand, fire and sun visuals
  path/       road-first pathfinding
  town/       map data, grid, layout, renderer
  vehicle/    the fleet's rules, the motor, the actor
```

## Art and sound

The game vendors **Kenney CC0 kits** — Toy Car Kit, City Kit (Suburban), City
Kit (Roads) and Car Kit. Provenance for every kit, and the packing pipeline that
makes their models bundler-friendly, is in `src/assets/kits/README.md`.

Three things are not straight from a kit, and all three are documented:

- The **corner shop** on the junction corner is authored in this repository, in
  Blender, against the kit's measured scale and palette — no Kenney kit has a
  shopfront that fits the lot. Its recipe is `scripts/blender-corner-shop.py`.
- The **ice-cream truck** is authored in this repository, in Blender, against the
  Car Kit's measured scale, axis convention and palette atlas. The reason is
  simple: no Kenney kit ships one. Its recipe is
  `scripts/blender-ice-cream-truck.py`, and it is not Kenney art.
- The **engine loop** is CC0 from OpenGameArt (*Some sounds* by Ziph).

The one-shot sounds come from Kenney's Impact and Interface Sounds packs, both
CC0. Those packs ship Ogg Vorbis only, which iOS Safari cannot decode, so the
seven clips the game uses were transcoded to mono MP3; `src/assets/audio/README.md`
records what came from where.

The app icons are renders, not drawings: `scripts/blender-icon.py` shoots the
fire truck on the theme's sky blue and writes the three PNGs in `public/icons/`.

## Licence

The **code in this repository is MIT** — see [LICENSE](./LICENSE).

The **art and sound are not covered by it.** The Kenney kits are CC0 (public
domain, attribution not required, recorded here anyway); the engine loop is CC0
from OpenGameArt; the authored ice-cream truck and corner shop are original work
released under the same MIT terms as the code. Each kit ships its own
`LICENSE.txt` beside its models.

## Deploying

Static site, no server. `docs/cloudflare-pages.md` walks the Cloudflare Pages
setup, the environment variables that matter, and the failure modes worth
knowing.

## The planning record

`conductor/` holds how this was built rather than only what: the product
definition, the tech stack with every deviation dated and explained, the
workflow, and one archive of finished tracks under
`conductor/archive/` — each keeping its specification, implementation plan and
git notes, which carry the phase-by-phase verification reports, including the
bugs the verifications caught.
