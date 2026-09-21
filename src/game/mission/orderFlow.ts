/**
 * The wiring decisions behind an ice-cream order: what a tap on the ordering
 * house means, which one-shot beats the order owes, and whether the order is
 * still the kid's to answer.
 *
 * `iceCreamMission` owns what an order *is*, `iceCreamPacer` owns when one
 * appears, and `serveGate` owns the jingle latch. What is left is the glue
 * `main.ts` would otherwise write inline among renderer calls — and glue that
 * cannot be tested is where the rules go quietly wrong (conductor/workflow.md
 * puts mission rules in the test-first set). So the decisions live here, and
 * `main.ts` only draws what they say.
 *
 * The beats are edge-triggered rather than level-triggered for one reason: a
 * state lasts many frames, but a cue is owed exactly once. Reading state edges
 * instead of carrying a "have I played it yet" flag next to the renderer is
 * what makes "once per order" testable rather than hopeful.
 */

import type { Vec2 } from '../town/townTypes';
import type { IceCreamSnapshot, IceCreamState } from './iceCreamMission';

/**
 * How close a tap must land to count as aiming at the ordering house. The same
 * 0.9 the fire mission snaps with, so answering either mission feels identical.
 */
export const SNAP_TO_ORDER = 0.9;

/** Whether a tap landed on the ordering house rather than somewhere else. */
export function isTapOnHouse(point: Vec2, house: Vec2, snap = SNAP_TO_ORDER): boolean {
  return Math.hypot(house.x - point.x, house.z - point.z) <= snap;
}

/** What a tap on the ordering house should do. */
export type OrderTapAction = 'ignore' | 'respond' | 'serve';

export interface OrderTapContext {
  readonly state: IceCreamState;
  /** Whether the tap landed on the ordering house's lot. */
  readonly onOrderHouse: boolean;
  /** `serveGate.canServe`: the ice-cream truck is active, jingled, and in reach. */
  readonly armed: boolean;
}

/**
 * Routing for one tap against an open order.
 *
 * Answering comes first: while the kid has not set off, a tap on the house is
 * "yes, I'm coming". Once the truck is there, the same tap serves — but only
 * when the serve affordance is actually armed, so a tap can never quietly
 * deliver a cone the kid was not shown was available.
 */
export function resolveOrderTap(context: OrderTapContext): OrderTapAction {
  if (!context.onOrderHouse) {
    return 'ignore';
  }
  if (context.state === 'spawned') {
    return 'respond';
  }
  if (context.state === 'active' && context.armed) {
    return 'serve';
  }
  return 'ignore';
}

/** Whether an order is out: shown to the kid, not yet served. */
export function orderIsOpen(state: IceCreamState): boolean {
  return state === 'spawned' || state === 'driving' || state === 'active';
}

/**
 * Whether the order is still waiting for the kid to answer it — the window in
 * which the helper hand may offer a demo tap.
 */
export function orderAwaitsKid(state: IceCreamState): boolean {
  return state === 'spawned' || state === 'driving';
}

/** The one-shot beats an order owes this frame. */
export interface OrderBeats {
  /** The order just appeared: play its jingle cue once. */
  readonly orderOpened: boolean;
  /** The order was just served: celebrate once. */
  readonly served: boolean;
}

/**
 * Builds the edge reader.
 *
 * Call it once per frame with the current snapshot; it compares against the
 * frame before and reports only the transitions that are owed something. A
 * state that stands still for a minute owes nothing more.
 */
export function createOrderBeats(): (snapshot: IceCreamSnapshot) => OrderBeats {
  let previous: IceCreamState = 'idle';

  return (snapshot) => {
    const beats = {
      orderOpened: previous !== 'spawned' && snapshot.state === 'spawned',
      served: previous !== 'complete' && snapshot.state === 'complete',
    };
    previous = snapshot.state;
    return beats;
  };
}
