/**
 * The calm gap both missions share.
 *
 * A fire and an ice-cream order arrive by exactly the same rules — a randomised
 * gap after the last one, no landing while a mission is already running, and
 * never on the house that just had its turn — so the rule lives here once and
 * each mission's pacer is a thin naming wrapper (`firePacer`, `iceCreamPacer`).
 * One copy is the point: the spec's pacing rule is asserted in one place, and a
 * fix to the fallback chain cannot reach one mission and miss the other.
 *
 * The town arrives as plain ids and positions rather than a `TownGrid`, so this
 * stays testable and the caller decides which houses can be picked.
 */

import type { Vec2 } from '../town/townTypes';

/** Shortest calm gap after a mission goes quiet, per the spec's 60-90s. */
export const CALM_MIN_SECONDS = 60;

/** Longest calm gap; the spec asks for the range to be randomised inside it. */
export const CALM_MAX_SECONDS = 90;

/**
 * How far from the last house the next mission must land, in world units. The
 * town's tile pitch is 1.0, so this is the spec's "at least two houses away".
 */
export const MIN_HOUSE_DISTANCE = 2;

export interface CalmGapPacerHouse {
  readonly id: string;
  /** World-space centre of the lot. */
  readonly position: Vec2;
}

export interface CalmGapPacerOptions {
  readonly houses: readonly CalmGapPacerHouse[];
  /** Shortest gap the caller's mission keeps. */
  readonly minSeconds: number;
  /** Longest gap the caller's mission keeps. */
  readonly maxSeconds: number;
  /** Preferred distance from the last house, in world units. */
  readonly minDistance: number;
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  readonly random?: () => number;
}

export interface CalmGapPacer {
  /** Seconds left before the caller's mission is due. */
  secondsUntilDue(): number;
  /** The house that went last, or `undefined` before the first mission. */
  lastHouseId(): string | undefined;
  /**
   * Picks a house *now*, without touching the countdown — for a caller whose
   * timing lives elsewhere (the mission rotation) but still wants this
   * module's separation rule and last-house memory.
   */
  pickHouse(): string | undefined;
  /**
   * Ticks the gap and returns the house to use, if it is time.
   *
   * `busy` is true while a mission is already running: the countdown pauses
   * rather than running on, so a mission that took two minutes to finish is
   * followed by a full calm gap, not by the next one the instant it ends.
   */
  update(deltaSeconds: number, busy: boolean): string | undefined;
}

function distanceBetween(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function createCalmGapPacer(options: CalmGapPacerOptions): CalmGapPacer {
  const { houses, minSeconds, maxSeconds, minDistance } = options;
  const random = options.random ?? Math.random;

  const rollCalmGap = (): number => minSeconds + random() * (maxSeconds - minSeconds);

  let remaining = rollCalmGap();
  let lastHouseId: string | undefined;

  /**
   * A house the kid has not just driven to. The distance rule is preferred, but
   * a small town can run out of candidates - better a mission next door than no
   * mission at all for the rest of the session.
   */
  const chooseHouse = (): CalmGapPacerHouse | undefined => {
    if (houses.length === 0) {
      return undefined;
    }

    const previous = houses.find((house) => house.id === lastHouseId);
    const otherHouses = houses.filter((house) => house.id !== lastHouseId);
    const farEnough =
      previous === undefined
        ? houses
        : otherHouses.filter(
            (house) => distanceBetween(previous.position, house.position) >= minDistance,
          );

    const candidates =
      farEnough.length > 0 ? farEnough : otherHouses.length > 0 ? otherHouses : houses;

    const index = Math.min(
      candidates.length - 1,
      Math.floor(random() * candidates.length),
    );
    return candidates[index];
  };

  const pickHouse = (): string | undefined => {
    const house = chooseHouse();
    if (house === undefined) {
      return undefined;
    }
    lastHouseId = house.id;
    return house.id;
  };

  return {
    secondsUntilDue: () => remaining,
    lastHouseId: () => lastHouseId,
    pickHouse,

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
