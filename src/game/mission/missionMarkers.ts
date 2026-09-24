/**
 * The shared marker layer (FR2): one adapter interface covering the order
 * cone/ring, the litter pile, the puppy spot, and the fire target.
 *
 * A marker is described by data — the FSM states where it shows, the state
 * where it arms (the wire flag deciding whether that arm is live), and a
 * table of tap claims — so visibility, arm/disarm, and tap-resolution are
 * expressed once instead of hand-rolled per mission. Mission modules own
 * their adapter configs; `main.ts` and the mission resolvers consume these
 * three functions. The Phase 1 characterization matrix is the acceptance
 * gate that behaviour never moves.
 */

import type { Vec2 } from '../town/townTypes';

/** One tap claim: fires when the state matches and every requirement holds. */
export interface MarkerTapRule<S extends string, O extends string> {
  readonly inState: S;
  /** The tap must land on the marker's target. */
  readonly needsTarget?: boolean;
  /** The wire (distance/gate) must say the marker is armed. */
  readonly needsArmed?: boolean;
  readonly outcome: O;
}

/**
 * A marker adapter. `O` must include `'ignore'` — the answer when no rule
 * matches, which is what keeps every tap outside its own mission and state
 * dead.
 */
export interface MarkerAdapter<S extends string, O extends string> {
  /**
   * FSM states where the marker is present (level-based, idempotent). Absent
   * means the marker drives no visibility of its own — its owner shows it
   * (the flame is `fireFx`'s) — and {@link markerVisible} reports none.
   */
  readonly showIn?: readonly S[];
  /**
   * FSM states where an arm may be live (ring, hose, delivery). Declared only
   * by a marker whose arm the wiring actually asks this layer about through
   * {@link markerArmed} — a range-armed marker leaves it out rather than
   * naming a rule nothing reads.
   */
  readonly armIn?: readonly S[];
  /** Tap claims, first full match wins. */
  readonly taps: readonly MarkerTapRule<S, O>[];
}

/** Whether the marker shows for this state. Absent `showIn` drives no visibility. */
export function markerVisible<S extends string, O extends string>(
  adapter: MarkerAdapter<S, O>,
  state: S,
): boolean {
  return adapter.showIn?.includes(state) === true;
}

/** Whether the marker is armed: in an arming state *and* the wire agrees. */
export function markerArmed<S extends string, O extends string>(
  adapter: MarkerAdapter<S, O>,
  state: S,
  wireArmed: boolean,
): boolean {
  return adapter.armIn?.includes(state) === true && wireArmed;
}

/** First fully matching rule wins; no match is always `'ignore'`. */
export function markerTap<S extends string, O extends string>(
  adapter: MarkerAdapter<S, O>,
  input: { state: S; onTarget?: boolean; armed?: boolean },
): O | 'ignore' {
  for (const rule of adapter.taps) {
    if (rule.inState !== input.state) continue;
    if (rule.needsTarget && input.onTarget !== true) continue;
    if (rule.needsArmed && input.armed !== true) continue;
    return rule.outcome;
  }
  return 'ignore';
}

/**
 * Level-syncs a marker to a visibility rule: transitions once into `wanted`
 * and does nothing while already there. `place` (if given) runs just before
 * the show, so a marker blooms where the rule first owes it.
 */
export function syncMarker(
  wanted: boolean,
  marker: {
    isShowing(): boolean;
    show(): void;
    hide(): void;
    place?: (point: Vec2) => void;
  },
  place?: Vec2,
): void {
  if (wanted === marker.isShowing()) {
    return;
  }
  if (!wanted) {
    marker.hide();
    return;
  }
  if (place !== undefined) {
    marker.place?.(place);
  }
  marker.show();
}
