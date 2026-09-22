/**
 * Shared celebration & linger data (FR3) plus the unified completion sparkle
 * trigger (FR4, AC6).
 *
 * Each mission's celebration is exactly what `main.ts` plays today — fire,
 * park and puppy run the confetti + sun + cheer trio, ice cream adds its
 * cones burst and drop — pinned as an ordered recipe so migrating a mission
 * onto this module cannot change what the kid sees or hears. `lingerSeconds`
 * mirrors each mission's current COMPLETE_LINGER_SECONDS so the generic FSM
 * can take its linger from the same table.
 *
 * `fire` is the one completion hook: it runs the recipe and exactly one
 * sparkle at the mission's completion site (FR4, revised from "town hall" —
 * the town has none), then latches until `rearm`. Free play never calls
 * `fire`; mission start only rearms; tap spam during the linger window finds
 * the latch already closed — so AC6's exactly-once falls out of one flag.
 * Every recipe ends in `cheer`, keeping the sparkle paired with celebration
 * audio (never sound-only).
 */
import type { Vec2 } from '../town/townTypes';
import { COMPLETE_LINGER_SECONDS as ORDER_LINGER } from './iceCreamMission';
import { COMPLETE_LINGER_SECONDS as FIRE_LINGER } from './missionManager';
import type { MissionId } from './missionRegistry';
import { COMPLETE_LINGER_SECONDS as PARK_LINGER } from './parkMission';
import { COMPLETE_LINGER_SECONDS as PUPPY_LINGER } from './puppyMission';

/** Feedback channels a celebration can run, in recipe order. */
export type CelebrationFx = 'cheer' | 'cones' | 'confetti' | 'drop' | 'sun';

export interface CelebrationRecipe {
  /** Ordered: visuals first, audio last (the sparkle's pair). */
  readonly fx: readonly CelebrationFx[];
  /** How long the completion celebration lingers before returning to idle. */
  readonly lingerSeconds: number;
}

export const CELEBRATIONS: Record<MissionId, CelebrationRecipe> = {
  fire: { fx: ['confetti', 'sun', 'cheer'], lingerSeconds: FIRE_LINGER },
  iceCream: {
    fx: ['confetti', 'cones', 'sun', 'drop', 'cheer'],
    lingerSeconds: ORDER_LINGER,
  },
  park: { fx: ['confetti', 'sun', 'cheer'], lingerSeconds: PARK_LINGER },
  puppy: { fx: ['confetti', 'sun', 'cheer'], lingerSeconds: PUPPY_LINGER },
};

export interface MissionCelebrationDeps {
  /** Play one recipe item at the completion site. */
  play: (what: CelebrationFx, at: Vec2) => void;
  /** The unified completion sparkle (FR4) at the same site. */
  sparkle: (at: Vec2) => void;
}

export interface MissionCelebration {
  readonly id: MissionId;
  /** Run this mission's recipe + sparkle once; further calls wait for rearm. */
  fire: (at: Vec2) => void;
  /** Re-arm for the next completion (mission start / spawn). Never fires. */
  rearm: () => void;
  /** Whether a completion would currently fire (wiring/diagnostic use). */
  isArmed: () => boolean;
}

export function createCelebration(
  id: MissionId,
  deps: MissionCelebrationDeps,
): MissionCelebration {
  const recipe = CELEBRATIONS[id];
  let armed = true;
  return {
    id,
    fire(at: Vec2): void {
      if (!armed) return;
      armed = false;
      for (const what of recipe.fx) deps.play(what, at);
      deps.sparkle(at);
    },
    rearm(): void {
      armed = true;
    },
    isArmed: () => armed,
  };
}
