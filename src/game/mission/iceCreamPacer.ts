/**
 * When an ice-cream order appears, and which house places it.
 *
 * The pacing rules are the town's rather than the order's, so they live once in
 * `calmGapPacer`; this module is the order's vocabulary for them plus the two
 * numbers the mission keeps — the spec's 60-90 second calm gap and the
 * two-house separation from the last order. Sharing that rule with the fire
 * mission is what makes "only one mission at a time, each with its own full
 * calm gap" a single piece of logic rather than two that happen to agree.
 *
 * Deliberately separate from `iceCreamMission`, which owns what an order *is*,
 * so the gap can be tested without a state machine and the state machine
 * without a clock.
 *
 * The town is passed in as plain ids and positions rather than a `TownGrid`, so
 * this stays testable and the caller decides which houses can order.
 */

import type { Vec2 } from '../town/townTypes';
import {
  CALM_MAX_SECONDS,
  CALM_MIN_SECONDS,
  createCalmGapPacer,
  MIN_HOUSE_DISTANCE,
} from './calmGapPacer';

export { CALM_MAX_SECONDS, CALM_MIN_SECONDS };

/**
 * How far from the last order the next one must be, in world units. Named for
 * this mission; the value and the rule behind it are the town's.
 */
export const MIN_ORDER_DISTANCE = MIN_HOUSE_DISTANCE;

export interface IceCreamPacerHouse {
  readonly id: string;
  /** World-space centre of the lot. */
  readonly position: Vec2;
}

export interface IceCreamPacerOptions {
  readonly houses: readonly IceCreamPacerHouse[];
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  readonly random?: () => number;
}

export interface IceCreamPacer {
  /** Seconds left before the town is due for another order. */
  secondsUntilOrder(): number;
  /** The house that ordered last, or `undefined` before the first order. */
  lastHouseId(): string | undefined;
  /**
   * Picks a house now, without touching the calm gap — for the shared mission
   * rotation, which owns *when* the town acts while this module still owns
   * *where* an order lands (two houses from the last one).
   */
  pickHouse(): string | undefined;
  /**
   * Ticks the calm gap and returns the house to serve, if it is time.
   *
   * `busy` is true while any mission is already running: the countdown pauses
   * rather than running on, so an order that took two minutes to serve is
   * followed by a full calm gap, not by another order the instant it ends.
   */
  update(deltaSeconds: number, busy: boolean): string | undefined;
}

export function createIceCreamPacer(options: IceCreamPacerOptions): IceCreamPacer {
  const pacer = createCalmGapPacer({
    houses: options.houses,
    maxSeconds: CALM_MAX_SECONDS,
    minDistance: MIN_ORDER_DISTANCE,
    minSeconds: CALM_MIN_SECONDS,
    random: options.random,
  });

  return {
    secondsUntilOrder: () => pacer.secondsUntilDue(),
    lastHouseId: () => pacer.lastHouseId(),
    pickHouse: () => pacer.pickHouse(),
    update: (deltaSeconds, busy) => pacer.update(deltaSeconds, busy),
  };
}
