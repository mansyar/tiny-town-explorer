import type { Vec2 } from '../town/townTypes';
import { createMissionFsm } from './missionFsm';
import type { MarkerAdapter } from './missionMarkers';

/**
 * The ice-cream order: which house ordered, whether the kid has answered it,
 * whether serve is in reach, and its patient resolution.
 *
 * The lifecycle is no longer hand-rolled (FR1). The stages and the completion
 * linger are declared once and `missionFsm` owns the transitions, the
 * one-transition-per-event lock and the linger; what stays here is only what
 * makes this errand an *order* — which house is waiting, single-serve, and the
 * range that arms serve. Pure and clocked by `update`, so a whole delivery
 * runs in a test in milliseconds — a second mission inheriting the fire
 * mission's feel without sharing its state. Single-serve — one tap visibly
 * matters — and `spawned` waits indefinitely rather than timing out.
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

/**
 * The order cone (and serve-ring arm) adapter for the shared marker layer
 * (FR2): shows while the order is open, arms the ring in `active`, answers a
 * house tap with `respond` before the truck set off and `serve` once armed.
 */
export const ORDER_CONE: MarkerAdapter<IceCreamState, 'ignore' | 'respond' | 'serve'> = {
  showIn: ['spawned', 'driving', 'active'],
  armIn: ['active'],
  taps: [
    { inState: 'spawned', needsTarget: true, outcome: 'respond' },
    { inState: 'active', needsTarget: true, needsArmed: true, outcome: 'serve' },
  ],
};

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
  /**
   * Tears a delivery down from any state (FR6): idle, cone hidden, no house
   * left waiting. The town's busy gate means nothing preempts a mission today,
   * so this is the contract held for the day something does — driven from
   * every state by `missionAbortParity.test.ts`.
   */
  abort(): boolean;
}

export function createIceCreamMission(): IceCreamMission {
  let orderHouseId: string | undefined;

  /**
   * The run is over — landed in idle by the linger, or torn down by `abort()`.
   * The house stops wanting ice cream, so no orphan cone is left behind
   * (FR6, AC4).
   */
  const clearOrder = (): void => {
    orderHouseId = undefined;
  };

  // Declared stages, declared linger (FR1): the module owns the transitions
  // that used to be assigned by hand here, including the linger's return to
  // idle and the abort teardown.
  const fsm = createMissionFsm<IceCreamState>({
    states: ['idle', 'spawned', 'driving', 'active', 'complete'],
    initialState: 'idle',
    celebratingState: 'complete',
    lingerSeconds: COMPLETE_LINGER_SECONDS,
    onIdle: clearOrder,
    onAbort: clearOrder,
  });

  return {
    snapshot: () => ({ state: fsm.getState(), orderHouseId }),

    isServeReady: (distanceToHouse) =>
      fsm.getState() === 'active' && distanceToHouse <= SERVE_RANGE,

    spawn(houseId): boolean {
      // Guarded, so an open order can never be half-replaced: the house is
      // only claimed once the transition has been won.
      if (!fsm.attempt('idle', 'spawned')) {
        return false;
      }
      orderHouseId = houseId;
      return true;
    },

    respond(): boolean {
      return fsm.attempt('spawned', 'driving');
    },

    serve(): boolean {
      return fsm.attempt('active', 'complete');
    },

    update(deltaSeconds, distanceToHouse): void {
      fsm.update(deltaSeconds, () => {
        // Proximity arrives by distance rather than by an event so the same
        // call decides both directions: close enough arms serve, driving off
        // takes it away again. Driving off interrupts the delivery rather than
        // cancelling it — the order waits patiently, and serve re-arms on the
        // way back.
        const state = fsm.getState();
        if (state === 'driving' && distanceToHouse <= SERVE_RANGE) {
          fsm.attempt('driving', 'active');
        } else if (state === 'active' && distanceToHouse > SERVE_RANGE) {
          fsm.attempt('active', 'driving');
        }
      });
    },

    abort(): boolean {
      return fsm.abort();
    },
  };
}

/** Kept for callers that want a plain distance, e.g. the order's owner. */
export function distanceBetween(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}
