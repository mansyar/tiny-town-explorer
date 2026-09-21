/**
 * The thin seam that lets a third mission join the town without a third copy
 * of the tick/tap block in `main.ts`.
 *
 * Each mission contributes optional `{ tick, tap, focus, isIdle, trySpawn }`
 * hooks. The registry runs them in a stable registration order behind the one
 * existing pass: ticks always, taps until one claims the aim, focus until one
 * is awaiting, and at most one successful spawn per busy-gated pass.
 *
 * Deliberately bounded (spec FR13): a seam, not a rewrite of the FSM modules.
 * Fire and ice-cream keep their own managers; this only decides *who* gets the
 * frame and in what order.
 */

import type { Vec2 } from '../town/townTypes';

/** Closed set of missions the town can run today. */
export type MissionId = 'fire' | 'iceCream' | 'park' | 'puppy';

/** One mission's optional contributions to the shared pass. */
export interface MissionContribution {
  /** Called once per frame while the registry is ticking. */
  readonly tick?: (deltaSeconds: number) => void;
  /**
   * Offers one destination tap. Resolve `true` when this mission claimed it —
   * later missions in the same pass never see that tap. May be async so a
   * claim can await a vehicle morph before the pass continues.
   */
  readonly tap?: (aim: Vec2) => boolean | Promise<boolean>;
  /**
   * Where the helper hand should point. The first `awaiting` mission wins;
   * with none awaiting the registry falls back to the car itself.
   */
  readonly focus?: (carPosition: Vec2) => {
    awaiting: boolean;
    destination: Vec2;
  };
  /** Whether this mission is idle, for the town-at-a-time busy gate. */
  readonly isIdle?: () => boolean;
  /**
   * Attempts to start this mission when the town is free. Returning `false`
   * lets the registry try the next one in the same pass.
   */
  readonly trySpawn?: () => boolean;
}

export interface MissionRegistryEntry extends MissionContribution {
  readonly id: MissionId;
}

export interface MissionRegistry {
  /** Runs every mission's `tick` in registration order. */
  tick(deltaSeconds: number): void;
  /** Offers `aim` to each mission until one claims it. */
  tap(aim: Vec2): Promise<boolean>;
  /** Resolves exactly one focus destination (first awaiting, else the car). */
  focus(carPosition: Vec2): { awaiting: boolean; destination: Vec2 };
  /** True when any registered mission is not idle. */
  isBusy(): boolean;
  /**
   * Asks each mission to spawn until one succeeds — the shared
   * town-at-a-time gate expressed once. Returns whether anything started.
   */
  spawnOne(): boolean;
}

export function createMissionRegistry(
  entries: readonly MissionRegistryEntry[],
): MissionRegistry {
  return {
    tick(deltaSeconds): void {
      for (const entry of entries) {
        entry.tick?.(deltaSeconds);
      }
    },

    async tap(aim): Promise<boolean> {
      for (const entry of entries) {
        if ((await entry.tap?.(aim)) === true) {
          return true;
        }
      }
      return false;
    },

    focus(carPosition): { awaiting: boolean; destination: Vec2 } {
      for (const entry of entries) {
        const result = entry.focus?.(carPosition);
        if (result?.awaiting === true) {
          return result;
        }
      }
      return { awaiting: false, destination: carPosition };
    },

    isBusy(): boolean {
      // A mission that reports nothing is treated as busy so a half-wired
      // entry can never open the gate by omission.
      return entries.some((entry) => entry.isIdle?.() !== true);
    },

    spawnOne(): boolean {
      for (const entry of entries) {
        if (entry.trySpawn?.() === true) {
          return true;
        }
      }
      return false;
    },
  };
}
