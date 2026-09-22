/**
 * When a fire appears, and which house it picks.
 *
 * The pacing rules are the town's rather than the fire's, so they live once in
 * `calmGapPacer`; this module is the fire mission's vocabulary for them plus the
 * two numbers the mission keeps — the spec's 60-90 second calm gap and the
 * two-house separation from the last fire.
 *
 * Deliberately separate from `MissionManager`, which owns what a fire *is*:
 * this module only decides when the town is due for one more and where it
 * lands, so the calm gap can be tested without a state machine and the state
 * machine can be tested without a clock.
 *
 * The town is passed in as plain ids and positions rather than a `TownGrid`, so
 * this stays testable and the caller decides which houses are fire candidates.
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
 * How far from the last fire the next one must be, in world units. Named for
 * this mission; the value and the rule behind it are the town's.
 */
export const MIN_FIRE_DISTANCE = MIN_HOUSE_DISTANCE;

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
   * Picks a house now, without touching the calm gap — for the shared mission
   * rotation, which owns *when* the town acts while this module still owns
   * *where* a fire lands (two houses from the last one).
   */
  pickHouse(): string | undefined;
  /**
   * Ticks the calm gap and returns the house to light up, if it is time.
   *
   * `busy` is true while any mission is already running: the countdown pauses
   * rather than running on, so a fire that took two minutes to put out is
   * followed by a full calm gap, not by another fire the instant it ends.
   */
  update(deltaSeconds: number, busy: boolean): string | undefined;
}

export function createFirePacer(options: FirePacerOptions): FirePacer {
  const pacer = createCalmGapPacer({
    houses: options.houses,
    maxSeconds: CALM_MAX_SECONDS,
    minDistance: MIN_FIRE_DISTANCE,
    minSeconds: CALM_MIN_SECONDS,
    random: options.random,
  });

  return {
    secondsUntilFire: () => pacer.secondsUntilDue(),
    lastHouseId: () => pacer.lastHouseId(),
    pickHouse: () => pacer.pickHouse(),
    update: (deltaSeconds, busy) => pacer.update(deltaSeconds, busy),
  };
}
