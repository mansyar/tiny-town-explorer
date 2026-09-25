/**
 * The thin seam that lets a third mission join the town without a third copy
 * of the tick/tap block in `main.ts`.
 *
 * Each mission contributes optional `{ tick, tap, isIdle }` hooks. The registry
 * runs them in a stable registration order behind the one existing pass: ticks
 * always, taps until one claims the aim. Focus is not voted on here — a caller
 * hands the registry one town-wide focus resolver (FR12's `missionFocus`) and
 * it is the single focus answer, marker and all.
 *
 * Deliberately bounded (spec FR13): a seam, not a rewrite of the FSM modules.
 * The missions keep their own modules; this only decides *who* gets the frame
 * and in what order.
 */

import type { Vec2 } from '../town/townTypes';
import type { MissionFocus } from './missionFocus';

/** Closed set of missions the town can run today. */
export type MissionId = 'fire' | 'iceCream' | 'park' | 'puppy';

/** Context for one destination tap offered to the mission registry. */
export interface MissionTapContext {
  /**
   * Reports that a claimed mission could not complete its required vehicle
   * morph. The tap stays claimed; the controller uses this to suppress a
   * route that would otherwise be committed after the failed morph.
   */
  readonly morphFailed: () => void;
}

/** One mission's optional contributions to the shared pass. */
export interface MissionContribution {
  /** Called once per frame while the registry is ticking. */
  readonly tick?: (deltaSeconds: number) => void;
  /**
   * Offers one destination tap. Resolve `true` when this mission claimed it —
   * later missions in the same pass never see that tap. May be async so a
   * claim can await a vehicle morph before the pass continues.
   */
  readonly tap?: (aim: Vec2, context?: MissionTapContext) => boolean | Promise<boolean>;
  /** Whether this mission is idle, for the town-at-a-time busy gate. */
  readonly isIdle?: () => boolean;
}

export interface MissionRegistryEntry extends MissionContribution {
  readonly id: MissionId;
}

export interface MissionRegistry {
  /** Runs every mission's `tick` in registration order. */
  tick(deltaSeconds: number): void;
  /** Offers `aim` to each mission until one claims it. */
  tap(aim: Vec2, context?: MissionTapContext): Promise<boolean>;
  /** Resolves the focus destination (town-wide resolver, else the car). */
  focus(carPosition: Vec2): MissionFocus;
  /** True when any registered mission is not idle. */
  isBusy(): boolean;
}

export function createMissionRegistry(
  entries: readonly MissionRegistryEntry[],
  resolveFocus?: (carPosition: Vec2) => MissionFocus,
): MissionRegistry {
  return {
    tick(deltaSeconds): void {
      for (const entry of entries) {
        entry.tick?.(deltaSeconds);
      }
    },

    async tap(aim, context): Promise<boolean> {
      for (const entry of entries) {
        if ((await entry.tap?.(aim, context)) === true) {
          return true;
        }
      }
      return false;
    },

    focus(carPosition): MissionFocus {
      // The town-wide resolver (FR12's `missionFocus`) is *the* answer: one
      // four-mission decision, including the siren marker, with no per-entry
      // vote to disagree with it.
      if (resolveFocus !== undefined) {
        return resolveFocus(carPosition);
      }
      return { awaiting: false, destination: carPosition };
    },

    isBusy(): boolean {
      // A mission that reports nothing is treated as busy so a half-wired
      // entry can never open the gate by omission.
      return entries.some((entry) => entry.isIdle?.() !== true);
    },
  };
}
