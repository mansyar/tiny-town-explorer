/**
 * Which mission the helper hand should point at.
 *
 * The hand's own rules - ten quiet seconds, one tap, then a cooldown - live in
 * `helperHand`, and either mission's "is the kid still needed?" predicate lives
 * with that mission. What is left is choosing between two missions for a single
 * hand, which is a rule worth pinning: with two of them there is now more than
 * one way to be waiting, and the hand must still offer exactly one demo tap at
 * the right place.
 *
 * It reads states and points rather than the managers, so a test can park the
 * town in any combination - including the one the shared busy gate makes
 * impossible (both waiting at once), which is pinned here so the hand stays
 * deterministic even if the gate is ever rewired.
 *
 * The "waiting on the kid" rule is shared with each mission's own module
 * (`fireAwaitsKid`, `orderAwaitsKid`) rather than restated, so the hand cannot
 * disagree with the mission about when the kid has arrived. The fire keeps
 * priority, matching the order the two landed in the game.
 */

import type { Vec2 } from '../town/townTypes';
import type { IceCreamState } from './iceCreamMission';
import { fireAwaitsKid, type MissionState } from './missionManager';
import { orderAwaitsKid } from './orderFlow';

export interface MissionFocusInput {
  readonly fireState: MissionState;
  /** Where the fire is; absent when its lot cannot be resolved. */
  readonly fireAt?: Vec2;
  readonly orderState: IceCreamState;
  /** Where the order is; absent when its lot cannot be resolved. */
  readonly orderAt?: Vec2;
  /** Handed back as the destination when nothing needs pointing at. */
  readonly carPosition: Vec2;
}

export interface MissionFocus {
  /** Whether a mission is waiting on the kid, so the hand may help at all. */
  readonly awaiting: boolean;
  /** Where a demo tap should land. */
  readonly destination: Vec2;
}

export function missionFocus(input: MissionFocusInput): MissionFocus {
  if (input.fireAt !== undefined && fireAwaitsKid(input.fireState)) {
    return { awaiting: true, destination: input.fireAt };
  }
  if (input.orderAt !== undefined && orderAwaitsKid(input.orderState)) {
    return { awaiting: true, destination: input.orderAt };
  }
  return { awaiting: false, destination: input.carPosition };
}
