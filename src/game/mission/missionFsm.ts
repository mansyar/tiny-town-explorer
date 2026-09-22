/**
 * Generic mission FSM (FR1): one state machine the four missions configure
 * with their own declared states, celebrating state, and linger duration.
 *
 * The FSM owns the skeleton every mission used to hand-roll: the current
 * state, guarded transitions (`attempt`), tick delegation under a
 * one-transition-per-update lock, the celebration linger, a once-per-entry
 * celebration emit, and `abort()` cleanup from any state (FR6). Mission
 * behaviour arrives as the callback passed to `update`, so no mission keeps
 * bespoke transition plumbing.
 *
 * The three lifecycle edges a mission can own side data across are all
 * callbacks: `onCelebrate` (the run just won), `onIdle` (the linger landed
 * back in idle, so the run's own state should be dropped) and `onAbort` (the
 * run was torn down early). Without `onIdle` a mission would have to mask its
 * stale fields behind the current state, which is the bespoke plumbing this
 * module exists to delete.
 */

/** Configuration: data per mission, never code branches (FR1/FR3). */
export interface MissionFsmConfig<S extends string> {
  /** Every state this mission may ever be in; anything else is refused. */
  readonly states: readonly S[];
  /** Where `abort()` and the celebration linger land; must be in `states`. */
  readonly initialState: S;
  /**
   * The celebrating/lingering state; entering it emits `onCelebrate`. Must be
   * in `states`: both are checked when the FSM is built, so a typo fails
   * loudly instead of leaving a mission that can never spawn or celebrate.
   */
  readonly celebratingState: S;
  /** Seconds to linger in `celebratingState` before returning to idle. */
  readonly lingerSeconds: number;
  /** Fired once per entry into the celebrating state. */
  readonly onCelebrate?: (from: S) => void;
  /**
   * Fired once when the celebration linger lands back in `initialState` — the
   * run is over, so whatever the mission carried for it can be dropped. Not
   * fired by `abort()`, which has its own hook.
   */
  readonly onIdle?: (from: S) => void;
  /** Fired once per successful `abort()`; the cleanup hook. */
  readonly onAbort?: (from: S) => void;
}

export interface MissionFsm<S extends string> {
  getState(): S;
  /**
   * Attempt one transition: current state must be in `from`, `to` must be
   * declared and different, `when` must not be false, and no earlier
   * transition may have fired inside the current update.
   */
  attempt(from: S | readonly S[], to: S, when?: boolean): boolean;
  /**
   * One frame: delegates to `handler` unless celebrating, where the linger
   * owns the frame and no handler runs.
   */
  update(delta: number, handler?: (delta: number) => void): void;
  /** Tear down from any non-idle state: back to idle, timer reset, cleanup. */
  abort(): boolean;
}

export function createMissionFsm<S extends string>(
  config: MissionFsmConfig<S>,
): MissionFsm<S> {
  const { states, initialState, celebratingState, lingerSeconds } = config;
  for (const [name, declared] of [
    ['initialState', initialState],
    ['celebratingState', celebratingState],
  ] as const) {
    if (!states.includes(declared)) {
      throw new Error(
        `createMissionFsm: ${name} '${declared}' is not one of states [${states.join(', ')}]`,
      );
    }
  }
  let state = initialState;
  let completeElapsed = 0;
  let inUpdate = false;
  let transitioned = false;

  function canAttempt(from: S | readonly S[], to: S, when: boolean): boolean {
    if (!when || !states.includes(to)) return false;
    if (inUpdate && transitioned) return false;
    const sources = typeof from === 'string' ? [from] : from;
    return sources.includes(state) && to !== state;
  }

  function attempt(from: S | readonly S[], to: S, when = true): boolean {
    if (!canAttempt(from, to, when)) return false;
    const previous = state;
    state = to;
    if (inUpdate) transitioned = true;
    // `canAttempt` has already refused a no-op, so `previous` is never the
    // celebrating state here: entering it is always a real entry.
    if (to === celebratingState) {
      config.onCelebrate?.(previous);
    }
    return true;
  }

  function update(delta: number, handler?: (delta: number) => void): void {
    if (state === celebratingState) {
      // A negative frame is a frame that did not happen: clamping keeps the
      // linger from being un-spent, the same rule every mission applied to its
      // own completion timer before this module owned it.
      completeElapsed += Math.max(delta, 0);
      if (completeElapsed >= lingerSeconds) {
        const previous = state;
        state = initialState;
        completeElapsed = 0;
        config.onIdle?.(previous);
      }
      return;
    }
    inUpdate = true;
    transitioned = false;
    try {
      handler?.(delta);
    } finally {
      inUpdate = false;
      transitioned = false;
    }
  }

  function abort(): boolean {
    if (state === initialState) return false;
    const previous = state;
    state = initialState;
    completeElapsed = 0;
    // The run is over, so the in-flight update lock goes with it: a transition
    // made after an abort belongs to the next run, not the one just torn down.
    inUpdate = false;
    transitioned = false;
    config.onAbort?.(previous);
    return true;
  }

  return { getState: () => state, attempt, update, abort };
}
