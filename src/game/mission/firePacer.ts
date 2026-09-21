/**
 * When a fire appears, and which house it picks.
 *
 * Deliberately separate from `MissionManager`, which owns what a fire *is*:
 * this module only decides when the town is due for one more and where it
 * lands, so the calm gap can be tested without a state machine and the state
 * machine can be tested without a clock.
 *
 * The rules come straight from the spec: fires arrive 60-90 seconds after the
 * last one is out, never while a mission is already running, and never at the
 * house that just burned (a fire two doors down is a new place to drive to; the
 * same house twice is just the last one again).
 *
 * The town is passed in as plain ids and positions rather than a `TownGrid`, so
 * this stays testable and the caller decides which houses are fire candidates.
 */

import type { Vec2 } from '../town/townTypes';

/** Shortest calm gap between one fire going out and the next appearing. */
export const CALM_MIN_SECONDS = 60;

/** Longest calm gap; the spec asks for 60-90 seconds, randomised. */
export const CALM_MAX_SECONDS = 90;

/**
 * How far from the last fire the next one must be, in world units. The town's
 * tile pitch is 1.0, so this is the spec's "at least two houses away".
 */
export const MIN_FIRE_DISTANCE = 2;

export interface FirePacerHouse {
  readonly id: string;
  /** World-space centre of the lot. */
  readonly position: Vec2;
}

export interface FirePacerOptions {
  readonly houses: readonly FirePacerHouse[];
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  readonly random?: () => number;
}

export interface FirePacer {
  /** Seconds left before the town is due for another fire. */
  secondsUntilFire(): number;
  /** The house that burned last, or `undefined` before the first fire. */
  lastHouseId(): string | undefined;
  /**
   * Ticks the calm gap and returns the house to light up, if it is time.
   *
   * `busy` is true while a mission is already running: the countdown pauses
   * rather than running on, so a fire that took two minutes to put out is
   * followed by a full calm gap, not by another fire the instant it ends.
   */
  update(deltaSeconds: number, busy: boolean): string | undefined;
}

function distanceBetween(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function createFirePacer(options: FirePacerOptions): FirePacer {
  const { houses } = options;
  const random = options.random ?? Math.random;

  const rollCalmGap = (): number =>
    CALM_MIN_SECONDS + random() * (CALM_MAX_SECONDS - CALM_MIN_SECONDS);

  let remaining = rollCalmGap();
  let lastHouseId: string | undefined;

  /**
   * A house the kid has not just driven to. The distance rule is preferred, but
   * a small town can run out of candidates - better a fire next door than no
   * fire at all for the rest of the session.
   */
  const chooseHouse = (): FirePacerHouse | undefined => {
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
              distanceBetween(previous.position, house.position) >= MIN_FIRE_DISTANCE,
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
    secondsUntilFire: () => remaining,
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
