/**
 * Which mission the town takes next — the shared calm-gap clock with FR11's
 * one new rule folded in: never the same mission twice in a row.
 *
 * Built directly on `createCalmGapPacer`: every candidate mission is handed in
 * as a "house" standing at the same point, and the separation distance is 0.
 * That degenerates the pacer's distance rule to exactly what the spec asks —
 * prefer any mission except the one that just ran — while inheriting the
 * tested 60–90s re-roll, the busy gate (a running mission pauses the whole
 * countdown) and the uniform `floor(random × candidates)` draw for free.
 *
 * The pool is whatever missions can actually spawn today; `main.ts` widens it
 * as missions land (park and puppy join in Phase 5). Drawing only among
 * runnable missions keeps a due tick from going nowhere.
 *
 * Where each mission lands (house, litter field, hiding spot) stays that
 * mission's own business; this module only answers *when* and *who*.
 */

import { CALM_MAX_SECONDS, CALM_MIN_SECONDS, createCalmGapPacer } from './calmGapPacer';
import type { MissionId } from './missionRegistry';

export interface MissionRotationOptions {
  /** Missions eligible to be drawn, in stable order. */
  readonly missions: readonly MissionId[];
  /**
   * Overrides for the calm gap. The shipped 60-90s window is the default, so
   * only tests and the dev-only `?calmGap=` override (`devCalmGap`) ever pass
   * anything else.
   */
  readonly minSeconds?: number;
  readonly maxSeconds?: number;
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  readonly random?: () => number;
}

export interface MissionRotation {
  /** Seconds left before the town is due for another mission. */
  secondsUntilDue(): number;
  /** The mission that went last, or `undefined` before the first draw. */
  lastMissionId(): MissionId | undefined;
  /**
   * Ticks the calm gap and returns the mission to run, if it is time.
   *
   * `busy` is true while any mission is already running: the countdown pauses
   * so a mission that took two minutes is followed by a full calm gap, not by
   * the next one the instant it ends.
   */
  update(deltaSeconds: number, busy: boolean): MissionId | undefined;
}

export function createMissionRotation(options: MissionRotationOptions): MissionRotation {
  const pacer = createCalmGapPacer({
    // All at the same point with a zero separation: the distance rule becomes
    // "any candidate except the last one drawn", which is FR11 verbatim.
    houses: options.missions.map((id) => ({ id, position: { x: 0, z: 0 } })),
    minDistance: 0,
    minSeconds: options.minSeconds ?? CALM_MIN_SECONDS,
    maxSeconds: options.maxSeconds ?? CALM_MAX_SECONDS,
    random: options.random,
  });

  return {
    secondsUntilDue: () => pacer.secondsUntilDue(),
    // Justified upcast: every pool member was handed in as a MissionId, so
    // the pacer can only ever remember one.
    lastMissionId: () => pacer.lastHouseId() as MissionId | undefined,
    update: (deltaSeconds, busy) =>
      pacer.update(deltaSeconds, busy) as MissionId | undefined,
  };
}
