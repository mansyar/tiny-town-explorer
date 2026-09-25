# Living Town Expansion

## Overview

Add a small first pass of ambient life to the existing Tiny Town Explorers town. The expansion will make the town feel more inhabited through a balanced mix of varied road wanderers and small animal/pond actors, while preserving the game’s calm toy-like character and existing mission loop.

The first pass will add approximately:

- **2–3 new ambient actor profiles**
- **4–6 total actor instances**
- At least one road-wanderer profile and at least one creature profile
- Deterministic, seeded movement
- Harmless, non-blocking collision behavior
- No new missions, persistence, visible text, or parent controls

## Goals

1. Make the existing town feel more active between mission interactions.
2. Add visual variety without introducing a new gameplay mode.
3. Reuse the existing traffic, pathfinding, collision, model, and feedback architecture.
4. Preserve the zero-failure and pure-agency principles: ambient actors must never block the child or prevent progress.
5. Stay within the established render budget and offline PWA contract.

## Functional Requirements

### 1. Ambient actor profiles

Add 2–3 profile definitions to the ambient actor/traffic configuration.

Each profile must define:

- A stable identifier
- Actor category, such as road wanderer or creature
- Model or primitive construction
- Collision footprint
- Speed
- Seeded route behavior
- Animation behavior
- Response behavior when bumped

At least one profile must be a road wanderer and at least one must be a creature. The initial pass may reuse existing models and primitive styles where that provides sufficient visual variety.

### 2. Deterministic movement

All new actors must:

- Start from fixed seeds
- Generate valid routes using existing road/pathfinding rules
- Stay inside the town bounds
- Avoid invalid or unreachable road tiles
- Use stable lane offsets appropriate to their footprint
- Continue moving indefinitely without requiring a mission
- Produce the same initial session for the same seed/configuration

The implementation must not introduce frame-rate-dependent route selection or unbounded per-frame randomness.

### 3. Harmless interaction

New actors must be ambient and non-blocking.

When the child’s vehicle contacts an actor:

- The vehicle receives a gentle, existing-style bonk response
- The actor may squash, pause, turn, or otherwise react
- The child’s vehicle must never become stuck
- The actor must never stop mission progress
- The actor must not become a required mission target
- Repeated contact must remain safe and visually understandable

The existing dynamic-obstacle/collision seam should be reused rather than introducing a new blocking collision category.

### 4. Visual animation

Each profile must have a simple, toy-like animation appropriate to its category.

Examples include:

- Vehicle body bounce or wheel movement
- Creature waddle, bob, or hop
- Pond-side idle movement
- Directional facing along the route

Animations must be calm, non-startling, and compatible with the existing render loop. No screen shake, flashing, horror-like behavior, or unbounded particle effects.

### 5. Scene and asset integration

New actors must integrate with the existing scene through the current model/actor mounting path.

Requirements:

- Prefer existing Kenney models or primitive geometry
- Reuse shared geometries, materials, and palette textures where possible
- Use blob shadows or the existing lightweight shadow strategy
- Do not add assets without measuring their size and render cost
- Any new asset must be included in the production PWA precache
- Failed model loading must follow the existing retry/cache behavior

### 6. Mission independence

The expansion must not change:

- The closed set of missions
- Mission selection or pacing
- Mission FSM transitions
- Mission target selection
- Helper-hand behavior
- Mission celebration behavior
- Free-play tap arbitration

Ambient actors may appear during missions, but they must not create soft-locks, alter route availability, or require interaction.

### 7. Lifecycle and cleanup

The traffic/actor system must expose and use the existing lifecycle conventions so that new actors are included in normal update, draw, and disposal behavior.

No new persistent state may be introduced. Sessions remain fresh on reload.

## Non-Functional Requirements

### Performance

- Preserve the current three.js/WebGL2 rendering approach
- Use the existing render probe and measurement method
- Measure before and after with equivalent viewport, DPR, spawn, and mission windows
- Do not exceed the existing approximately 50,000-triangle representative budget without an explicit recorded trade-off
- Avoid material draw-call regressions
- Keep the current iPad 9th-generation 60fps target
- Prefer shared assets and primitive geometry over high-detail models

### Code quality

- Strict TypeScript
- Follow the existing code style guides
- Keep logic in testable modules
- Maintain the existing controller/edge separation
- Do not add dependencies unless documented in `tech-stack.md` first
- Keep new logic-bearing modules above the project’s 80% coverage target

### Product experience

- No visible text
- No blocking modal or dialog
- No timers, penalties, or failure states
- No new required reading
- Every meaningful sound cue must have a simultaneous visual counterpart
- Ambient movement must not distract from the active vehicle or mission marker
- Actors must remain compatible with offline play and any-orientation camera behavior

## Acceptance Criteria

1. The town mounts 4–6 new ambient actor instances from 2–3 profiles.
2. The roster includes both road-wanderer and creature content.
3. A fixed seed produces the same initial actor positions, routes, and profiles.
4. All generated routes remain on valid reachable town roads and within bounds.
5. New actors update and render through the existing traffic/actor system.
6. Contact with a new actor produces a harmless bonk and never leaves the vehicle stuck.
7. Ambient actors do not block, delay, or alter mission progress.
8. No new mission, persistence, text, HUD, or parent-panel behavior is introduced.
9. The full test suite passes.
10. New or changed logic modules meet the project coverage target.
11. Biome and TypeScript checks pass.
12. The production PWA build succeeds and precaches all required assets.
13. Render measurements are recorded before and after the expansion.
14. The worst representative window remains within the agreed render budget.
15. The change is manually verified on the iPad 9th-generation floor device, including:
    - Ambient movement
    - Bumping behavior
    - No route blockage
    - Mission coexistence
    - Offline reopen
    - Any-orientation camera behavior

## Out of Scope

- New mission types
- Mission target redesign
- A third district or expanded road network
- New vehicles or special abilities
- Interactive prop mechanics
- Persistence, accounts, analytics, or a backend
- New visible text or tutorial systems
- New parent settings
- Day/night, weather, or seasonal systems
- Changes to the input router’s newest-tap semantics
- Changes to mission FSM semantics
- Broad refactors of `game.ts` or the renderer

## Assumptions and Open Implementation Decisions

- “Creatures” may be represented by primitives or existing low-poly models; exact art selection is not part of the behavioral contract.
- The initial pass will prefer existing traffic/actor seams over a new general-purpose entity system.
- The number of instances may be reduced if measurements show that the full 4–6 cannot meet the render budget, but the final roster must still include both categories.
- Ambient traffic remains silent unless a soft existing feedback sound is reused for a bonk.
- Any decision to add a dependency or materially change the rendering approach must be documented in `tech-stack.md` before implementation.
