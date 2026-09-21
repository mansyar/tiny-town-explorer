/**
 * The gate that keeps the parent panel away from the kid.
 *
 * A three-second continuous hold is the whole barrier: too long for a
 * three-year-old to stumble into while dragging a finger around the screen, and
 * nothing at all for an adult who has been told once. The hold is drawn as a
 * filling ring, so the adult can see it working.
 *
 * Pure and clocked by `update`, so a three-second gesture runs in a test in
 * microseconds. The "open" signal is returned once per completed hold, because
 * the caller opens a panel on it and a signal that repeats for every frame of
 * a long press would open it over and over.
 */

/** How long the finger must stay down. */
export const HOLD_SECONDS = 3;

export interface HoldGate {
  /** 0 to 1 of the way through the hold, for the filling ring. */
  progress(): number;
  isHolding(): boolean;
  /** A finger went down. */
  press(): void;
  /** The finger came up, however the press ended. */
  release(): void;
  /**
   * Ticks the hold and returns true on the single frame it completes. Holding
   * on afterwards never reports again, and releasing arms a fresh hold.
   */
  update(deltaSeconds: number): boolean;
}

export function createHoldGate(seconds = HOLD_SECONDS): HoldGate {
  let holding = false;
  let elapsed = 0;
  let fired = false;

  return {
    progress: () => (holding ? Math.min(elapsed / seconds, 1) : 0),
    isHolding: () => holding,

    press: () => {
      // A second finger must not restart the count: the gate is the *hold*, not
      // the touch that began it.
      if (holding) {
        return;
      }
      holding = true;
      elapsed = 0;
      fired = false;
    },

    release: () => {
      holding = false;
      elapsed = 0;
      fired = false;
    },

    update: (deltaSeconds) => {
      if (!holding) {
        return false;
      }

      elapsed += Math.max(deltaSeconds, 0);
      if (fired || elapsed < seconds) {
        return false;
      }

      fired = true;
      return true;
    },
  };
}
