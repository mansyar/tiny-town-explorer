/**
 * Which mission the helper hand should point at.
 *
 * The hand's own rules - ten quiet seconds, one tap, then a cooldown - live in
 * `helperHand`, and each mission's "is the kid still needed?" predicate lives
 * with that mission. What is left is choosing between four missions for a
 * single hand, which is a rule worth pinning: with four of them there is more
 * than one way to be waiting, and the hand must still offer exactly one demo
 * tap at the right place (FR12).
 *
 * It reads states and points rather than the managers, so a test can park the
 * town in any combination - including the one the shared busy gate makes
 * impossible (missions waiting at once), which is pinned here so the hand
 * stays deterministic even if the gate is ever rewired.
 *
 * The "waiting on the kid" rule is shared with each mission's own module
 * (`fireAwaitsKid`, `orderAwaitsKid`, `parkAwaitsKid`) rather than restated,
 * so the hand cannot disagree with a mission about when the kid has arrived.
 * Priority follows the order the missions landed in the game: fire, then
 * ice-cream, then park, then puppy.
 *
 * The puppy has three steps the hand can demonstrate (FR12): the siren button
 * before it is found, the paw spot while it hides, the owner house while it
 * rides aboard. The siren button lives on the HUD, not in the world, so that
 * one destination comes back marked `target: 'siren'` alongside the car
 * itself - the marker tells the caller to demo the button rather than trace
 * a road to nowhere.
 */

import type { Vec2 } from '../town/townTypes';
import type { IceCreamState } from './iceCreamMission';
import { fireAwaitsKid, type MissionState } from './missionManager';
import { orderAwaitsKid } from './orderFlow';
import { type ParkState, parkAwaitsKid } from './parkMission';
import type { PuppyState } from './puppyMission';

export interface MissionFocusInput {
  readonly fireState: MissionState;
  /** Where the fire is; absent when its lot cannot be resolved. */
  readonly fireAt?: Vec2;
  readonly orderState: IceCreamState;
  /** Where the order is; absent when its lot cannot be resolved. */
  readonly orderAt?: Vec2;
  readonly parkState: ParkState;
  /** The nearest litter; absent when no pieces remain. */
  readonly parkAt?: Vec2;
  /** The rotation drew the puppy: whine played, HUD siren button pulses. */
  readonly puppyPending: boolean;
  readonly puppyState: PuppyState;
  /** The drawn hiding spot; absent before the siren or if it cannot resolve. */
  readonly puppySpotAt?: Vec2;
  /** The owner's house; absent while the pup is not aboard. */
  readonly puppyOwnerAt?: Vec2;
  /** Handed back as the destination when nothing needs pointing at. */
  readonly carPosition: Vec2;
}

export interface MissionFocus {
  /** Whether a mission is waiting on the kid, so the hand may help at all. */
  readonly awaiting: boolean;
  /** Where a demo tap should land. */
  readonly destination: Vec2;
  /** Set when the step is the HUD siren button rather than a world point. */
  readonly target?: 'siren';
}

export function missionFocus(input: MissionFocusInput): MissionFocus {
  if (input.fireAt !== undefined && fireAwaitsKid(input.fireState)) {
    return { awaiting: true, destination: input.fireAt };
  }
  if (input.orderAt !== undefined && orderAwaitsKid(input.orderState)) {
    return { awaiting: true, destination: input.orderAt };
  }
  if (input.parkAt !== undefined && parkAwaitsKid(input.parkState)) {
    return { awaiting: true, destination: input.parkAt };
  }
  if (input.puppyPending) {
    // No world point exists for the HUD button; the hand gets the car itself
    // plus the marker that says "demo the button, not a road tap".
    return { awaiting: true, destination: input.carPosition, target: 'siren' };
  }
  if (input.puppySpotAt !== undefined && input.puppyState === 'searching') {
    return { awaiting: true, destination: input.puppySpotAt };
  }
  if (input.puppyOwnerAt !== undefined && input.puppyState === 'carrying') {
    return { awaiting: true, destination: input.puppyOwnerAt };
  }
  return { awaiting: false, destination: input.carPosition };
}
