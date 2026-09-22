import { createMissionFsm } from './missionFsm';
import { type MarkerAdapter, markerTap } from './missionMarkers';

/**
 * The park clean-up: litter is out, the kid has answered it, the truck is
 * among it, and the town's patient resolution afterwards.
 *
 * The lifecycle is no longer hand-rolled (FR1). The stages and the completion
 * linger are declared once and `missionFsm` owns the transitions, the
 * one-transition-per-event lock and the linger; what stays here is only what
 * makes this errand a *clean-up* — the drive-over range and the verb. Pure and
 * clocked by `update`, so the third mission inherits the fire mission's feel
 * without sharing its state. What makes this one different is the verb:
 * collection happens under the wheels (FR3, in `parkPickup.ts`), so the FSM
 * never asks *how many pieces are left* — the pickup rules report the last
 * piece via `finish()`.
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

/**
 * The litter-field adapter for the shared marker layer (FR2): the field is
 * present exactly while the clean-up runs, and a tap on a piece only claims
 * before the truck set off — under the wheels, collection is drive-over.
 */
export const PARK_FIELD: MarkerAdapter<ParkState, 'ignore' | 'respond'> = {
  showIn: ['spawned', 'responding', 'collecting'],
  taps: [{ inState: 'spawned', needsTarget: true, outcome: 'respond' }],
};

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
  // Declared stages, declared linger (FR1): the module owns the transitions
  // that used to be assigned by hand here. The clean-up carries no side data
  // across the run — the litter field itself lives with the town — so neither
  // lifecycle hook is needed.
  const fsm = createMissionFsm<ParkState>({
    states: ['idle', 'spawned', 'responding', 'collecting', 'complete'],
    initialState: 'idle',
    celebratingState: 'complete',
    lingerSeconds: COMPLETE_LINGER_SECONDS,
  });

  return {
    snapshot: () => ({ state: fsm.getState() }),

    spawn(): boolean {
      return fsm.attempt('idle', 'spawned');
    },

    respond(): boolean {
      return fsm.attempt('spawned', 'responding');
    },

    finish(): boolean {
      // The last piece can be taken on the way over or among the litter, so
      // both stages may finish the errand — never a stage the kid has not
      // answered.
      return fsm.attempt(['responding', 'collecting'], 'complete');
    },

    update(deltaSeconds, distanceToLitter): void {
      fsm.update(deltaSeconds, () => {
        // The same call decides both directions: close enough means the truck
        // is collecting, driving off takes it away again. Driving off
        // interrupts the sweep rather than cancelling it — the litter waits
        // patiently, and collecting re-arms on the way back.
        const state = fsm.getState();
        if (state === 'responding' && distanceToLitter <= COLLECT_RANGE) {
          fsm.attempt('responding', 'collecting');
        } else if (state === 'collecting' && distanceToLitter > COLLECT_RANGE) {
          fsm.attempt('collecting', 'responding');
        }
      });
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
  return markerTap(PARK_FIELD, { state: context.state, onTarget: context.onPiece });
}
