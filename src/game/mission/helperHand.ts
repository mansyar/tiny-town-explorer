/**
 * The hand that shows a stuck kid what to do.
 *
 * The product rule is that a child can always act, and the spec's answer is one
 * patient nudge: after ten seconds with no input while a fire is burning, trace
 * the route and perform a single demo tap, then back off for at least ten more
 * seconds. One tap, never a loop; a kid who is playing is never interrupted.
 *
 * Pure and clocked by `update`, so the whole behaviour (including the cooldown)
 * runs in a test in milliseconds. Where the route is and how the trace is drawn
 * are the caller's business; this module only decides *whether* help is due and
 * hands back the point the demo tap should land on.
 */

import type { Vec2 } from '../town/townTypes';

/** Quiet seconds before the hand will help, mid-mission. */
export const IDLE_SECONDS = 10;

/** Quiet seconds the hand waits after helping once. The spec asks for ≥10. */
export const COOLDOWN_SECONDS = 10;

export interface HelperHandContext {
  /** The hand only helps while a mission is running. */
  readonly missionActive: boolean;
  /** Where a demo tap should land - normally the burning house. */
  readonly destination: Vec2;
}

export interface HelperHand {
  isEnabled(): boolean;
  /** The parent panel's toggle (Phase 7). */
  setEnabled(on: boolean): void;
  /** Seconds of quiet accumulated so far. */
  secondsIdle(): number;
  /** The kid touched the screen: the count starts over. */
  noteActivity(): void;
  /**
   * Ticks the idle clock and returns the tap point when the hand should act.
   * Returns `undefined` on every other frame.
   */
  update(deltaSeconds: number, context: HelperHandContext): Vec2 | undefined;
}

export function createHelperHand(enabled = true): HelperHand {
  let on = enabled;
  let idle = 0;

  const reset = (): void => {
    idle = 0;
  };

  return {
    isEnabled: () => on,

    setEnabled: (next) => {
      on = next;
      // Toggling the hand off mid-count should not leave a nudge queued up.
      reset();
    },

    secondsIdle: () => idle,
    noteActivity: reset,

    update: (deltaSeconds, context) => {
      const delta = Math.max(deltaSeconds, 0);

      // Between missions there is nothing to demonstrate, and the next fire
      // starts with a full ten seconds of patience.
      if (!on || !context.missionActive) {
        reset();
        return undefined;
      }

      idle += delta;
      if (idle < IDLE_SECONDS) {
        return undefined;
      }

      // One tap per window: the count restarts, which is the cooldown.
      reset();
      return context.destination;
    },
  };
}
