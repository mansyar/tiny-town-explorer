/**
 * The park clean-up's state machine: litter is out, the kid has answered it,
 * the truck is among it, and the town's patient resolution afterwards.
 *
 * Pure and clocked by `update`, mirroring `missionManager.ts` so the third
 * mission inherits the same feel without sharing its state. What makes this
 * one different is the verb: collection happens under the wheels (FR3, in
 * `parkPickup.ts`), so the FSM never asks *how many pieces are left* — the
 * pickup rules report the last piece via `finish()`.
 *
 *   idle ──spawn()──► spawned ──respond()──► responding ⇄ collecting ──finish()──► complete
 *     ▼                   (tap a piece)     (arrive ⇄ drive away)                     │
 *     ▲                                                                               │
 *     └────────────────────── complete lingers ~2.5 s, then idle ──────────────────────┘
 *
 * Driving away only disarms `collecting`, never the mission (NFR1): litter
 * never despawns with judgment, and a second tap never re-fires the morph.
 */

/** The shared mission range — close enough to be *among* the litter. */
export const COLLECT_RANGE = 1.9;

/** How long the celebration lingers before the town goes quiet again. */
export const COMPLETE_LINGER_SECONDS = 2.5;

export type ParkState = 'collecting' | 'complete' | 'idle' | 'responding' | 'spawned';

/**
 * The kid is still needed (FR12): before the tap (`spawned`) and on the way
 * to the litter (`responding`). Once collecting, the kid has arrived and the
 * hand stands down — the same shape as `fireAwaitsKid`/`orderAwaitsKid`.
 */
export function parkAwaitsKid(state: ParkState): boolean {
  return state === 'spawned' || state === 'responding';
}

export interface ParkSnapshot {
  readonly state: ParkState;
}

export interface ParkMission {
  snapshot(): ParkSnapshot;
  /** Lays the litter out. Only from `idle`; a running clean-up ignores it. */
  spawn(): boolean;
  /** The kid tapped a piece: morph to the garbage truck and drive there (FR2). */
  respond(): boolean;
  /** The last piece is gone (FR5). Only bites once the kid has answered. */
  finish(): boolean;
  /**
   * Advances the mission. `distanceToLitter` is the distance to the nearest
   * remaining piece, so the same call decides both directions: close enough
   * means the truck is collecting, driving off takes it away again.
   */
  update(deltaSeconds: number, distanceToLitter: number): void;
}

export function createParkMission(): ParkMission {
  let state: ParkState = 'idle';
  let completeElapsed = 0;

  const toIdle = (): void => {
    state = 'idle';
    completeElapsed = 0;
  };

  return {
    snapshot: () => ({ state }),

    spawn(): boolean {
      if (state !== 'idle') {
        return false;
      }
      state = 'spawned';
      return true;
    },

    respond(): boolean {
      if (state !== 'spawned') {
        return false;
      }
      state = 'responding';
      return true;
    },

    finish(): boolean {
      if (state !== 'responding' && state !== 'collecting') {
        return false;
      }
      completeElapsed = 0;
      state = 'complete';
      return true;
    },

    update(deltaSeconds, distanceToLitter): void {
      const delta = Math.max(deltaSeconds, 0);
      if (state === 'responding' && distanceToLitter <= COLLECT_RANGE) {
        state = 'collecting';
      } else if (state === 'collecting' && distanceToLitter > COLLECT_RANGE) {
        // Driving off interrupts the sweep rather than cancelling it: the
        // litter waits patiently, and collecting re-arms on the way back.
        state = 'responding';
      } else if (state === 'complete') {
        completeElapsed += delta;
        if (completeElapsed >= COMPLETE_LINGER_SECONDS) {
          toIdle();
        }
      }
    },
  };
}

/** What a tap on a litter piece should do. */
export type ParkTapAction = 'ignore' | 'respond';

export interface ParkTapContext {
  readonly state: ParkState;
  /** Whether the tap landed on one of the litter pieces. */
  readonly onPiece: boolean;
}

/**
 * Routing for one tap against an open clean-up — `resolveParkTap`, beside the
 * other tap resolvers (FR2). Answering happens only while the kid has not set
 * off; every later tap is ignored so the morph and the drive fire exactly
 * once, no matter how enthusiastically the piece is re-tapped.
 */
export function resolveParkTap(context: ParkTapContext): ParkTapAction {
  if (context.onPiece && context.state === 'spawned') {
    return 'respond';
  }
  return 'ignore';
}
