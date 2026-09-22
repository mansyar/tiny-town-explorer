import { PICKUP_RADIUS } from './parkPickup';

/**
 * The Lost Puppy errand (FR7–FR10): the kid presses the siren, drives over
 * the pup to scoop it up, then taps the owner's house to deliver it. Pure FSM
 * shaped like `missionManager.ts` and `iceCreamMission.ts`, with two ranges —
 * the shared drive-over radius (reused from `parkPickup.ts`, so a pickup feels
 * identical in both missions) and {@link DELIVERY_RANGE}, the shared mission
 * range every other mission arms at.
 *
 * ```text
 * idle ──siren()──▶ searching ──drive over──▶ carrying ──deliver()──▶ complete
 *                    (paw marker)             (heart marker)          ~2.5 s
 * ```
 *
 * The siren is a one-shot latch: while the pup is out, `siren()` declines, so
 * a second press can never restart or reset the errand. Delivery arms through
 * {@link PuppyMission.update} the way the hose and serve do — near the owner
 * house the tap is live, and driving away disarms it again. Completion is
 * reported by the caller's `deliver()` (the tap resolver gates it), never by
 * the FSM counting anything: the pup is picked up by driving, not by the
 * mission watching the litter.
 */

/** Errand states. `searching` shows the paw marker; `carrying` the heart. */
export type PuppyState = 'idle' | 'searching' | 'carrying' | 'complete';

export interface PuppySnapshot {
  readonly state: PuppyState;
}

/** How far the police car drives over the pup to scoop it up (FR8). */
export { PICKUP_RADIUS };
/** The shared mission range — close enough to tap the owner's door (FR10). */
export const DELIVERY_RANGE = 1.9;
/** Confetti, cheer, then back to the calm gap (FR10). */
export const COMPLETE_LINGER_SECONDS = 2.5;

export interface PuppyMission {
  snapshot(): PuppySnapshot;
  /**
   * Opens the errand: idle → searching, with the yip and paw marker.
   * `false` while the pup is already out — the latch never restarts (FR7).
   */
  siren(): boolean;
  /**
   * carrying → complete. The caller gates this through {@link resolvePuppyTap}
   * so a tap can only land once, on the house, in range (FR10).
   */
  deliver(): boolean;
  /**
   * `true` while carrying and within {@link DELIVERY_RANGE} of the owner's
   * house — the range the delivery tap is armed at, disarmed by driving away.
   */
  isDeliverReady(): boolean;
  /**
   * Advances the errand: clamps time, scoops the pup at ≤
   * {@link PICKUP_RADIUS} while searching, arms/disarms delivery at ≤
   * {@link DELIVERY_RANGE} while carrying, and idles after the completion
   * linger. Negative frames are ignored, as in the other missions.
   */
  update(deltaSeconds: number, distanceToPup: number, distanceToOwner: number): void;
}

export function createPuppyMission(): PuppyMission {
  let state: PuppyState = 'idle';
  let armed = false;
  let completeElapsed = 0;

  const toIdle = (): void => {
    state = 'idle';
    armed = false;
    completeElapsed = 0;
  };

  return {
    snapshot: () => ({ state }),

    siren(): boolean {
      if (state !== 'idle') return false;
      state = 'searching';
      return true;
    },

    deliver(): boolean {
      if (state !== 'carrying') return false;
      state = 'complete';
      armed = false;
      completeElapsed = 0;
      return true;
    },

    isDeliverReady: () => state === 'carrying' && armed,

    update(deltaSeconds, distanceToPup, distanceToOwner): void {
      const delta = Math.max(0, deltaSeconds);
      if (state === 'searching' && distanceToPup <= PICKUP_RADIUS) {
        state = 'carrying';
        armed = false;
        return;
      }
      if (state === 'carrying') {
        armed = distanceToOwner <= DELIVERY_RANGE;
        return;
      }
      if (state === 'complete') {
        completeElapsed += delta;
        if (completeElapsed >= COMPLETE_LINGER_SECONDS) toIdle();
      }
    },
  };
}

/** The delivery tap's outcome: deliver on the house, or let it pass. */
export type PuppyTapAction = 'ignore' | 'deliver';

export interface PuppyTapContext {
  readonly state: PuppyState;
  /** Was the tap on the owner's house? */
  readonly onOwnerHouse: boolean;
  /** Was the mission armed — carrying and within {@link DELIVERY_RANGE}? */
  readonly armed: boolean;
}

/**
 * One tap resolves the delivery (FR10), beside the other tap resolvers:
 * `'deliver'` only while carrying, on the house, and in range, so the morph,
 * hop-out and celebration fire exactly once. Every other tap is `'ignore'`.
 */
export function resolvePuppyTap(context: PuppyTapContext): PuppyTapAction {
  if (context.state === 'carrying' && context.onOwnerHouse && context.armed) {
    return 'deliver';
  }
  return 'ignore';
}
