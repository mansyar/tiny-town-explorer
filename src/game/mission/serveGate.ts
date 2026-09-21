/**
 * The jingle-then-serve latch.
 *
 * The spec's delivery flow has three independent facts: the ice-cream truck is
 * the active vehicle (the fleet knows), the kid pressed its ability since the
 * order opened (nobody knows — this module remembers), and the truck is close
 * enough to serve (the ice-cream mission knows via `isServeReady`). The serve
 * button shows only when all three hold:
 *
 * ```ts
 * gate.noteOrderOpened(); // a cone icon just popped up somewhere
 * gate.noteJingle(); // the ability press sang
 * gate.noteActiveVehicle(fleet.activeId()); // morphing away abandons the jingle
 * if (gate.canServe(fleet.activeId(), mission.isServeReady(distance))) { ... }
 * ```
 *
 * Keeping the latch here instead of in `main.ts` keeps the rule testable
 * without a renderer (conductor/workflow.md: game rules test-first).
 */

import type { VehicleId } from '../vehicle/vehicleSystem';

export interface ServeGate {
  /** An order just opened: whatever was jingled before no longer counts. */
  noteOrderOpened(): void;
  /** The ice-cream truck's ability just sang. */
  noteJingle(): void;
  /** The fleet changed: a jingle only survives on the ice-cream truck. */
  noteActiveVehicle(active: VehicleId): void;
  /**
   * Whether the serve button shows: the ice-cream truck is driving, it jingled
   * since the order opened, and the mission says it is close enough.
   */
  canServe(active: VehicleId, serveReady: boolean): boolean;
}

export function createServeGate(): ServeGate {
  let jingled = false;

  return {
    noteOrderOpened: () => {
      jingled = false;
    },
    noteJingle: () => {
      jingled = true;
    },
    noteActiveVehicle: (active) => {
      if (active !== 'iceCream') {
        jingled = false;
      }
    },
    canServe: (active, serveReady) => active === 'iceCream' && jingled && serveReady,
  };
}
