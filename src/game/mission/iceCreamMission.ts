import type { Vec2 } from '../town/townTypes';

/**
 * The ice-cream order's state machine: which house ordered, whether the kid
 * has answered it, whether serve is in reach, and its patient resolution.
 *
 * Pure and clocked by `update`, mirroring `missionManager.ts` so the second
 * mission inherits the same feel without sharing its state: a whole delivery
 * runs in a test in milliseconds. Single-serve — one tap visibly matters —
 * and `spawned` waits indefinitely rather than timing out.
 *
 *   idle ──spawn()──► spawned ──respond()──► driving ⇄ active ──serve──► complete
 *     ▲                                       (arrive ⇄ drives away)              │
 *     └───────────────────── complete lingers, then idle ─────────────────────────┘
 *
 * Driving away only disarms serve, never the order.
 */

/** The car must be at least this close for serve to be worth showing. */
export const SERVE_RANGE = 1.9;

/** How long the celebration lingers before the town goes quiet again. */
export const COMPLETE_LINGER_SECONDS = 2.5;

export type IceCreamState = 'active' | 'complete' | 'driving' | 'idle' | 'spawned';

export interface IceCreamSnapshot {
  readonly state: IceCreamState;
  /** The ordering house, or `undefined` when no order is open. */
  readonly orderHouseId: string | undefined;
}

export interface IceCreamMission {
  snapshot(): IceCreamSnapshot;
  /** Whether the serve button should be showing for a car this far away. */
  isServeReady(distanceToHouse: number): boolean;
  /** Takes an order at a house. Only from `idle`; an open order ignores it. */
  spawn(houseId: string): boolean;
  /** The kid tapped the ordering house: drive the ice-cream truck over. */
  respond(): boolean;
  /** One serve. Only bites while the mission is `active`. */
  serve(): boolean;
  /**
   * Advances the mission. Proximity arrives by distance rather than by an event
   * so the same call decides both directions: close enough arms serve,
   * driving off takes it away again.
   */
  update(deltaSeconds: number, distanceToHouse: number): void;
}

export function createIceCreamMission(): IceCreamMission {
  let state: IceCreamState = 'idle';
  let orderHouseId: string | undefined;
  let completeElapsed = 0;

  const toIdle = (): void => {
    state = 'idle';
    orderHouseId = undefined;
    completeElapsed = 0;
  };

  return {
    snapshot: () => ({ state, orderHouseId }),

    isServeReady: (distanceToHouse) =>
      state === 'active' && distanceToHouse <= SERVE_RANGE,

    spawn(houseId): boolean {
      if (state !== 'idle') {
        return false;
      }
      orderHouseId = houseId;
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

    serve(): boolean {
      if (state !== 'active') {
        return false;
      }
      completeElapsed = 0;
      state = 'complete';
      return true;
    },

    update(deltaSeconds, distanceToHouse): void {
      const delta = Math.max(deltaSeconds, 0);
      if (state === 'driving' && distanceToHouse <= SERVE_RANGE) {
        state = 'active';
      } else if (state === 'active' && distanceToHouse > SERVE_RANGE) {
        // Driving off interrupts the delivery rather than cancelling it: the
        // order waits patiently, and serve re-arms on the way back.
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

/** Kept for callers that want a plain distance, e.g. the order's owner. */
export function distanceBetween(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}
