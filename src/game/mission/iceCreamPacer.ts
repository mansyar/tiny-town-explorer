/**
 * When an ice-cream order appears, and which house places it.
 *
 * Mirrors `firePacer`: the when (a 60-90 second calm gap) is deliberately
 * separate from `iceCreamMission`, which owns what an order *is*, so the gap
 * can be tested without a state machine and the state machine without a clock.
 *
 * The town is passed in as plain ids and positions rather than a `TownGrid`, so
 * this stays testable and the caller decides which houses can order.
 */

import type { Vec2 } from '../town/townTypes';

/** Shortest calm gap between one order closing and the next appearing. */
export const CALM_MIN_SECONDS = 60;

/** Longest calm gap; the spec asks for 60-90 seconds, randomised. */
export const CALM_MAX_SECONDS = 90;

/**
 * How far from the last order the next one must be, in world units. The town's
 * tile pitch is 1.0, so this is the spec's "at least two houses away".
 */
export const MIN_ORDER_DISTANCE = 2;

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
   * Ticks the calm gap and returns the house to serve, if it is time.
   *
   * `busy` is true while any mission is already running: the countdown pauses
   * rather than running on, so an order that took two minutes to serve is
   * followed by a full calm gap, not by another order the instant it ends.
   */
  update(deltaSeconds: number, busy: boolean): string | undefined;
}

function distanceBetween(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function createIceCreamPacer(options: IceCreamPacerOptions): IceCreamPacer {
  const { houses } = options;
  const random = options.random ?? Math.random;

  const rollCalmGap = (): number =>
    CALM_MIN_SECONDS + random() * (CALM_MAX_SECONDS - CALM_MIN_SECONDS);

  let remaining = rollCalmGap();
  let lastHouseId: string | undefined;

  /**
   * A house the kid has not just driven to. The distance rule is preferred, but
   * a small town can run out of candidates - better an order next door than no
   * orders at all for the rest of the session.
   */
  const chooseHouse = (): IceCreamPacerHouse | undefined => {
    if (houses.length === 0) {
      return undefined;
    }

    const previous = houses.find((house) => house.id === lastHouseId);
    const otherHouses = houses.filter((house) => house.id !== lastHouseId);
    const farEnough =
      previous === undefined
        ? houses
        : otherHouses.filter(
            (house) =>
              distanceBetween(previous.position, house.position) >= MIN_ORDER_DISTANCE,
          );

    const candidates =
      farEnough.length > 0 ? farEnough : otherHouses.length > 0 ? otherHouses : houses;

    const index = Math.min(
      candidates.length - 1,
      Math.floor(random() * candidates.length),
    );
    return candidates[index];
  };

  return {
    secondsUntilOrder: () => remaining,
    lastHouseId: () => lastHouseId,

    update: (deltaSeconds, busy) => {
      const delta = Math.max(deltaSeconds, 0);
      // A mission in flight is the kid's turn; the town waits its turn.
      if (busy) {
        return undefined;
      }

      remaining -= delta;
      if (remaining > 0) {
        return undefined;
      }

      const house = chooseHouse();
      remaining = rollCalmGap();
      if (house === undefined) {
        return undefined;
      }
      lastHouseId = house.id;
      return house.id;
    },
  };
}
