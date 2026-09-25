/**
 * The small state contract behind the child-visible boot overlay.
 *
 * The browser edge owns the DOM and the actual reload. This module only owns
 * the lifecycle decision so a late promise cannot move a successful boot back
 * into failure, and a curious finger cannot queue a second reload.
 */

export type BootPhase = 'loading' | 'ready' | 'failed' | 'retrying';

export interface BootStatus {
  /** The current child-visible lifecycle phase. */
  phase(): BootPhase;
  /** Report a touch for a small visual acknowledgement, without queueing play. */
  acknowledgeTouch(): boolean;
  /** Commit the successful boot transition; returns false if already settled. */
  markReady(): boolean;
  /** Commit the initial-load failure transition; returns false if already settled. */
  markFailed(): boolean;
  /** Request the one permitted full-page retry; returns false otherwise. */
  retry(): boolean;
}

/** Create an injectable boot state. */
export function createBootStatus(onRetry: () => void = () => undefined): BootStatus {
  let phase: BootPhase = 'loading';

  return {
    phase: () => phase,

    acknowledgeTouch: () => phase === 'loading' || phase === 'failed',

    markReady: () => {
      if (phase !== 'loading') {
        return false;
      }
      phase = 'ready';
      return true;
    },

    markFailed: () => {
      if (phase !== 'loading') {
        return false;
      }
      phase = 'failed';
      return true;
    },

    retry: () => {
      if (phase !== 'failed') {
        return false;
      }
      phase = 'retrying';
      onRetry();
      return true;
    },
  };
}
