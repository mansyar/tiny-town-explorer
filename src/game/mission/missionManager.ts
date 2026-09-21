import type { Vec2 } from '../town/townTypes';

/**
 * The fire mission's state machine: what is burning, whether the kid has
 * answered it, whether the hose is in reach, and how many bursts are left.
 *
 * Pure and clocked by `update`, so a whole mission can be run in a test in
 * milliseconds and the feel of it pinned without a renderer (conductor/workflow
 * guard: mission pacing and rules are test-first). It owns no timers of its own
 * beyond the resolution window — *when* a fire appears is the pacing module's
 * job, and *where* is the town's.
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

  let state: MissionState = 'idle';
  let fireHouseId: string | undefined;
  let burstsLeft = 0;
  let completeElapsed = 0;

  const toIdle = (): void => {
    state = 'idle';
    fireHouseId = undefined;
    burstsLeft = 0;
    completeElapsed = 0;
  };

  return {
    snapshot: () => ({ state, fireHouseId, burstsLeft }),

    isHoseReady: (distanceToFire) => state === 'active' && distanceToFire <= HOSE_RANGE,

    spawn(houseId): boolean {
      if (state !== 'idle') {
        return false;
      }
      fireHouseId = houseId;
      burstsLeft = BURSTS_MIN + Math.floor(random() * (BURSTS_MAX - BURSTS_MIN + 1));
      state = 'spawned';
      return true;
    },

    respond(): boolean {
      if (state !== 'spawned') {
        return false;
      }
      state = 'driving';
      return true;
    },

    spray(): boolean {
      if (state !== 'active') {
        return false;
      }
      burstsLeft -= 1;
      if (burstsLeft <= 0) {
        burstsLeft = 0;
        completeElapsed = 0;
        state = 'complete';
      }
      return true;
    },

    update(deltaSeconds, distanceToFire): void {
      const delta = Math.max(deltaSeconds, 0);
      if (state === 'driving' && distanceToFire <= HOSE_RANGE) {
        state = 'active';
      } else if (state === 'active' && distanceToFire > HOSE_RANGE) {
        // Driving off interrupts the rescue rather than cancelling it: the fire
        // keeps burning, patiently, and the hose re-arms on the way back.
        state = 'driving';
      } else if (state === 'complete') {
        completeElapsed += delta;
        if (completeElapsed >= COMPLETE_LINGER_SECONDS) {
          toIdle();
        }
      }
    },
  };
}

/** Kept for callers that want a plain distance, e.g. the fire's owner. */
export function distanceBetween(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}
