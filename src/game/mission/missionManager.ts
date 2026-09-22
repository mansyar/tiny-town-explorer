import type { Vec2 } from '../town/townTypes';
import { createMissionFsm } from './missionFsm';
import type { MarkerAdapter } from './missionMarkers';

/**
 * The fire mission: what is burning, whether the kid has answered it, whether
 * the hose is in reach, and how many bursts are left.
 *
 * The lifecycle is no longer hand-rolled (FR1). The stages and the completion
 * linger are declared once and `missionFsm` owns the transitions, the
 * one-transition-per-event lock and the linger; what stays here is only what
 * makes this errand a *fire* — which house burns, how many bursts it takes,
 * and the range that arms the hose. Pure and clocked by `update`, so a whole
 * mission can be run in a test in milliseconds and the feel of it pinned
 * without a renderer (conductor/workflow guard: mission pacing and rules are
 * test-first). It owns no timers of its own beyond the resolution window —
 * *when* a fire appears is the pacing module's job, and *where* is the town's.
 *
 *   idle ──spawn()──► spawned ──respond()──► driving ⇄ active ──last burst──► complete
 *     ▲                                       (arrive ⇄ drives away)              │
 *     └───────────────────── complete lingers, then idle ─────────────────────────┘
 *
 * `spawned` waits indefinitely: an unanswered fire burns patiently rather than
 * timing out, and driving away only disarms the hose, never the mission.
 */

/** The car must be at least this close for the hose to be worth showing. */
export const HOSE_RANGE = 1.9;

/** How long the celebration lingers before the town goes quiet again. */
export const COMPLETE_LINGER_SECONDS = 2.5;

/** A fire takes three or four bursts — each tap should visibly matter. */
export const BURSTS_MIN = 3;
export const BURSTS_MAX = 4;

export type MissionState = 'active' | 'complete' | 'driving' | 'idle' | 'spawned';

export interface MissionSnapshot {
  readonly state: MissionState;
  /** The burning house, or `undefined` when nothing is burning. */
  readonly fireHouseId: string | undefined;
  /** Bursts still needed; 0 when nothing is burning or the fire is out. */
  readonly burstsLeft: number;
}

export interface MissionManagerOptions {
  /** Source of the burst count. Injectable so tests can pin it. */
  readonly random?: () => number;
}

/**
 * Whether the fire is still waiting on the kid: lit, or being driven towards.
 * The window in which the helper hand may point at the burning house - shared
 * with the hand's own focus rule rather than restated there.
 */
export function fireAwaitsKid(state: MissionState): boolean {
  return state === 'spawned' || state === 'driving';
}

/**
 * The fire target (flame) adapter for the shared marker layer (FR2): shows
 * while the fire has bursts left (spawned/driving/active), arms the hose in
 * `active`, and answers a tap on the burning house only before the kid has
 * driven over (the hose is a button, not a tap, once active).
 */
export const FIRE_FLAME: MarkerAdapter<MissionState, 'ignore' | 'respond'> = {
  showIn: ['spawned', 'driving', 'active'],
  armIn: ['active'],
  taps: [{ inState: 'spawned', needsTarget: true, outcome: 'respond' }],
};

export interface MissionManager {
  snapshot(): MissionSnapshot;
  /** Whether the hose button should be showing for a car this far away. */
  isHoseReady(distanceToFire: number): boolean;
  /** Lights a fire at a house. Only from `idle`; a burning town ignores it. */
  spawn(houseId: string): boolean;
  /** The kid tapped the burning house: pan the camera and become the fire truck. */
  respond(): boolean;
  /** One hose burst. Only bites while the mission is `active`. */
  spray(): boolean;
  /**
   * Advances the mission. Proximity arrives by distance rather than by an event
   * so the same call decides both directions: close enough arms the hose,
   * driving off takes it away again.
   */
  update(deltaSeconds: number, distanceToFire: number): void;
}

export function createMissionManager(
  options: MissionManagerOptions = {},
): MissionManager {
  const random = options.random ?? Math.random;

  let fireHouseId: string | undefined;
  let burstsLeft = 0;

  /**
   * The run is over — landed in idle by the linger, or torn down by `abort()`.
   * Either way the house stops burning and the burst count resets, so no
   * orphan flame is left behind (FR6, AC4).
   */
  const clearFire = (): void => {
    fireHouseId = undefined;
    burstsLeft = 0;
  };

  // Declared stages, declared linger (FR1): the module owns the transitions
  // that used to be assigned by hand here, including the linger's return to
  // idle and the abort teardown.
  const fsm = createMissionFsm<MissionState>({
    states: ['idle', 'spawned', 'driving', 'active', 'complete'],
    initialState: 'idle',
    celebratingState: 'complete',
    lingerSeconds: COMPLETE_LINGER_SECONDS,
    onIdle: clearFire,
    onAbort: clearFire,
  });

  return {
    snapshot: () => ({ state: fsm.getState(), fireHouseId, burstsLeft }),

    isHoseReady: (distanceToFire) =>
      fsm.getState() === 'active' && distanceToFire <= HOSE_RANGE,

    spawn(houseId): boolean {
      // Guarded, so a running stage can never be half-replaced: the id and the
      // burst count are only touched once the transition has been won.
      if (!fsm.attempt('idle', 'spawned')) {
        return false;
      }
      fireHouseId = houseId;
      burstsLeft = BURSTS_MIN + Math.floor(random() * (BURSTS_MAX - BURSTS_MIN + 1));
      return true;
    },

    respond(): boolean {
      return fsm.attempt('spawned', 'driving');
    },

    spray(): boolean {
      if (fsm.getState() !== 'active') {
        return false;
      }
      burstsLeft -= 1;
      if (burstsLeft <= 0) {
        burstsLeft = 0;
        fsm.attempt('active', 'complete');
      }
      return true;
    },

    update(deltaSeconds, distanceToFire): void {
      fsm.update(deltaSeconds, () => {
        // Proximity arrives by distance rather than by an event so the same
        // call decides both directions: close enough arms the hose, driving
        // off takes it away again. Driving off interrupts the rescue rather
        // than cancelling it — the fire keeps burning, patiently, and the
        // hose re-arms on the way back.
        const state = fsm.getState();
        if (state === 'driving' && distanceToFire <= HOSE_RANGE) {
          fsm.attempt('driving', 'active');
        } else if (state === 'active' && distanceToFire > HOSE_RANGE) {
          fsm.attempt('active', 'driving');
        }
      });
    },
  };
}

/** Kept for callers that want a plain distance, e.g. the fire's owner. */
export function distanceBetween(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}
