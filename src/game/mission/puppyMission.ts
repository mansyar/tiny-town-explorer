import { createMissionFsm } from './missionFsm';
import { type MarkerAdapter, markerTap } from './missionMarkers';
import { PICKUP_RADIUS } from './parkPickup';

/**
 * The Lost Puppy errand (FR7–FR10): the kid presses the siren, drives over
 * the pup to scoop it up, then taps the owner's house to deliver it. The
 * lifecycle is no longer hand-rolled (FR1): the stages and the completion
 * linger are declared once and `missionFsm` owns the transitions, the
 * one-transition-per-event lock and the linger — so a fourth mission adds no
 * new transition plumbing. What stays here is only what makes this an
 * *errand*: two ranges — the shared drive-over radius (reused from
 * `parkPickup.ts`, so a pickup feels identical in both missions) and
 * {@link DELIVERY_RANGE}, the shared mission range every other mission arms
 * at — plus the siren latch.
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

/**
 * The puppy spot (paw) adapter for the shared marker layer (FR2): the
 * signpost while the pup is out. It answers no taps — finding the pup is
 * driving, not tapping.
 */
export const PUPPY_PAW: MarkerAdapter<PuppyState, 'ignore'> = {
  showIn: ['searching'],
  taps: [],
};

/**
 * The heart (delivery target) adapter for the shared marker layer (FR2):
 * shows while carrying and answers a tap on the owner's house only while the
 * door tap is armed.
 *
 * No arm state is declared: the arm is a *wire* — the mission's own `armed`,
 * which is carrying-plus-range — so naming a state here would describe a rule
 * nothing reads (see `MarkerAdapter`).
 */
export const PUPPY_HEART: MarkerAdapter<PuppyState, 'ignore' | 'deliver'> = {
  showIn: ['carrying'],
  taps: [
    { inState: 'carrying', needsTarget: true, needsArmed: true, outcome: 'deliver' },
  ],
};

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
  /**
   * Tears an errand down from any state (FR6): idle, no marker, delivery
   * disarmed. Nothing preempts a mission today — the busy gate makes every
   * errand wait its turn — so this is the contract held for the day something
   * does; `missionAbortParity.test.ts` drives it from every state.
   */
  abort(): boolean;
}

export function createPuppyMission(): PuppyMission {
  /** Whether the door tap is live: carrying, and within delivery range. */
  let armed = false;

  /** The run is over — landed in idle by the linger, or torn down by abort. */
  const clearPup = (): void => {
    armed = false;
  };

  // Declared stages, declared linger (FR1): the module owns the transitions
  // that used to be assigned by hand here, including the linger's return to
  // idle and the abort teardown.
  const fsm = createMissionFsm<PuppyState>({
    states: ['idle', 'searching', 'carrying', 'complete'],
    initialState: 'idle',
    celebratingState: 'complete',
    lingerSeconds: COMPLETE_LINGER_SECONDS,
    onIdle: clearPup,
    onAbort: clearPup,
  });

  return {
    snapshot: () => ({ state: fsm.getState() }),

    siren(): boolean {
      // Idle-only by construction: the siren is the one-shot that opens the
      // errand, so a second press can never restart or reset it (FR7).
      return fsm.attempt('idle', 'searching');
    },

    deliver(): boolean {
      if (!fsm.attempt('carrying', 'complete')) {
        return false;
      }
      armed = false;
      return true;
    },

    isDeliverReady: () => fsm.getState() === 'carrying' && armed,

    update(deltaSeconds, distanceToPup, distanceToOwner): void {
      fsm.update(deltaSeconds, () => {
        const state = fsm.getState();
        if (state === 'searching') {
          // Drive over the pup to scoop it up (FR8). Delivery is not armed on
          // the pickup frame: the kid has only just picked it up.
          if (distanceToPup <= PICKUP_RADIUS) {
            fsm.attempt('searching', 'carrying');
            armed = false;
          }
          return;
        }
        if (state === 'carrying') {
          // The door tap arms through here the way the hose and serve do: near
          // the owner house it is live, and driving away disarms it again.
          armed = distanceToOwner <= DELIVERY_RANGE;
        }
      });
    },

    abort(): boolean {
      return fsm.abort();
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
  return markerTap(PUPPY_HEART, {
    state: context.state,
    onTarget: context.onOwnerHouse,
    armed: context.armed,
  });
}
