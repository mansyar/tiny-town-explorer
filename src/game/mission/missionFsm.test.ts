/**
 * Red-first contract tests for the generic mission FSM (FR1): declared
 * states, guarded transitions, tick/tap delegation, exactly-one transition
 * per update, celebration entry fires once — plus abort semantics (FR6,
 * Phase 2 task 2) and per-mission configuration smoke tests proving each
 * mission's real state set and linger fit the generic contract.
 */

import { describe, expect, it, vi } from 'vitest';
import { COMPLETE_LINGER_SECONDS as ORDER_LINGER } from './iceCreamMission';
import { createMissionFsm } from './missionFsm';
import { COMPLETE_LINGER_SECONDS as FIRE_LINGER } from './missionManager';
import { COMPLETE_LINGER_SECONDS as PARK_LINGER } from './parkMission';
import { COMPLETE_LINGER_SECONDS as PUPPY_LINGER } from './puppyMission';

type FireState = 'idle' | 'spawned' | 'driving' | 'active' | 'complete';

const FIRE_STATES: readonly FireState[] = [
  'idle',
  'spawned',
  'driving',
  'active',
  'complete',
];

function makeFsm(
  overrides: Partial<Parameters<typeof createMissionFsm<FireState>>[0]> = {},
) {
  return createMissionFsm<FireState>({
    states: FIRE_STATES,
    initialState: 'idle',
    celebratingState: 'complete',
    lingerSeconds: 2.5,
    ...overrides,
  });
}

/** Walk the declared lifecycle chain up to (but not into) celebrating. */
function walkToReady(
  fsm: ReturnType<typeof makeFsm>,
  states: readonly string[] = FIRE_STATES,
): void {
  for (let index = 1; index < states.length - 1; index += 1) {
    expect(fsm.attempt(states[index - 1] as FireState, states[index] as FireState)).toBe(
      true,
    );
  }
}

function walkToCelebrating(fsm: ReturnType<typeof makeFsm>): void {
  walkToReady(fsm);
  expect(fsm.attempt('active', 'complete')).toBe(true);
}

/** Walk the declared chain exactly up to (not beyond) the given state. */
function walkTo(fsm: ReturnType<typeof makeFsm>, state: FireState): void {
  let cursor: FireState = 'idle';
  for (const next of FIRE_STATES) {
    if (next === cursor) continue;
    if (cursor === state) break;
    expect(fsm.attempt(cursor, next)).toBe(true);
    cursor = next;
  }
}

describe('declared states', () => {
  it('starts at the initial state', () => {
    expect(makeFsm().getState()).toBe('idle');
  });

  it('refuses a transition to an undeclared state', () => {
    const fsm = makeFsm();
    expect(fsm.attempt('idle', 'bogus' as FireState)).toBe(false);
    expect(fsm.getState()).toBe('idle');
  });
});

describe('guarded transitions', () => {
  it('only transitions from a declared source state', () => {
    const fsm = makeFsm();
    expect(fsm.attempt('idle', 'spawned')).toBe(true);
    expect(fsm.attempt('idle', 'driving')).toBe(false); // wrong source now
    expect(fsm.getState()).toBe('spawned');
  });

  it('honours an additional boolean guard', () => {
    const fsm = makeFsm();
    expect(fsm.attempt('idle', 'spawned', false)).toBe(false);
    expect(fsm.getState()).toBe('idle');
  });

  it('refuses a no-op transition to the current state', () => {
    const fsm = makeFsm();
    expect(fsm.attempt('idle', 'idle')).toBe(false);
    expect(fsm.getState()).toBe('idle');
  });

  it('accepts a list of source states', () => {
    const fsm = makeFsm();
    walkToReady(fsm);
    fsm.attempt('active', 'complete');
    fsm.update(3, () => undefined); // linger past → idle
    expect(fsm.attempt(['spawned', 'driving'], 'active')).toBe(false);
    expect(fsm.attempt('idle', 'spawned')).toBe(true);
  });
});

describe('tick/tap delegation', () => {
  it('passes delta to the update handler while not celebrating', () => {
    const fsm = makeFsm();
    const handler = vi.fn();
    fsm.update(1 / 60, handler);
    expect(handler).toHaveBeenCalledWith(1 / 60);
  });

  it('lets the handler attempt transitions during update', () => {
    const fsm = makeFsm();
    fsm.update(1 / 60, () => {
      fsm.attempt('idle', 'spawned');
    });
    expect(fsm.getState()).toBe('spawned');
  });

  it('delegates taps and returns the handler result (claim)', () => {
    const fsm = makeFsm();
    expect(fsm.tap(() => false)).toBe(false);
    expect(fsm.tap(() => true)).toBe(true);
  });

  it('stops delegating updates once celebrating — the linger owns the frame', () => {
    const fsm = makeFsm();
    walkToCelebrating(fsm);
    const handler = vi.fn();
    fsm.update(0.1, handler);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('exactly-one transition per update', () => {
  it('ignores every attempt after the first within one update', () => {
    const fsm = makeFsm();
    fsm.update(1 / 60, () => {
      expect(fsm.attempt('idle', 'spawned')).toBe(true);
      expect(fsm.attempt('spawned', 'driving')).toBe(false); // locked
    });
    expect(fsm.getState()).toBe('spawned');
  });

  it('clears the lock for the next update', () => {
    const fsm = makeFsm();
    fsm.update(1 / 60, () => {
      fsm.attempt('idle', 'spawned');
    });
    fsm.update(1 / 60, () => {
      fsm.attempt('spawned', 'driving');
    });
    expect(fsm.getState()).toBe('driving');
  });

  it('applies the same single-shot lock inside a tap', () => {
    const fsm = makeFsm();
    fsm.tap(() => {
      expect(fsm.attempt('idle', 'spawned')).toBe(true);
      expect(fsm.attempt('spawned', 'driving')).toBe(false); // locked
      return true;
    });
    expect(fsm.getState()).toBe('spawned');
  });

  it('leaves direct verbs outside an update/tap unlocked', () => {
    const fsm = makeFsm();
    expect(fsm.attempt('idle', 'spawned')).toBe(true);
    expect(fsm.attempt('spawned', 'driving')).toBe(true);
    expect(fsm.getState()).toBe('driving');
  });
});

describe('celebration entry fires once', () => {
  it('emits onCelebrate exactly once when entering the celebrating state', () => {
    const onCelebrate = vi.fn();
    const fsm = makeFsm({ onCelebrate });
    walkToReady(fsm);
    expect(fsm.attempt('active', 'complete')).toBe(true);
    expect(onCelebrate).toHaveBeenCalledTimes(1);
    expect(onCelebrate).toHaveBeenCalledWith('active');
  });

  it('never re-emits while lingering in the celebrating state', () => {
    const onCelebrate = vi.fn();
    const fsm = makeFsm({ onCelebrate });
    walkToCelebrating(fsm);
    fsm.update(0.1);
    fsm.update(0.1);
    expect(onCelebrate).toHaveBeenCalledTimes(1);
  });

  it('emits once more for the next completion', () => {
    const onCelebrate = vi.fn();
    const fsm = makeFsm({ onCelebrate });
    walkToCelebrating(fsm);
    fsm.update(3); // linger → idle
    walkToReady(fsm);
    fsm.attempt('active', 'complete');
    expect(onCelebrate).toHaveBeenCalledTimes(2);
  });
});

describe('linger', () => {
  it('returns to idle only once the linger has elapsed', () => {
    const fsm = makeFsm();
    walkToCelebrating(fsm);
    fsm.update(1.3);
    expect(fsm.getState()).toBe('complete');
    fsm.update(1.2); // 2.5 exactly → done
    expect(fsm.getState()).toBe('idle');
  });

  it('treats one big delta as the elapsed linger', () => {
    const fsm = makeFsm();
    walkToCelebrating(fsm);
    fsm.update(99);
    expect(fsm.getState()).toBe('idle');
  });

  it('ignores a negative frame, so the linger is never dragged backwards', () => {
    const fsm = makeFsm();
    walkToCelebrating(fsm);
    fsm.update(-5);
    expect(fsm.getState()).toBe('complete');
    // Every mission clamps its own frames the same way: a bogus delta is a
    // frame that did not happen, not one that un-spends the celebration.
    fsm.update(2.5);
    expect(fsm.getState()).toBe('idle');
  });
});

describe('idle return (FR6)', () => {
  it('emits onIdle once when the linger lands back in idle', () => {
    const onIdle = vi.fn();
    const fsm = makeFsm({ onIdle });
    walkToCelebrating(fsm);
    fsm.update(1.3);
    expect(onIdle).not.toHaveBeenCalled();
    fsm.update(1.2);
    expect(fsm.getState()).toBe('idle');
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledWith('complete');
  });

  it('never re-emits while the town stays idle', () => {
    const onIdle = vi.fn();
    const fsm = makeFsm({ onIdle });
    walkToCelebrating(fsm);
    fsm.update(99);
    fsm.update(1);
    fsm.update(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('emits once per completed run', () => {
    const onIdle = vi.fn();
    const fsm = makeFsm({ onIdle });
    walkToCelebrating(fsm);
    fsm.update(99);
    walkToCelebrating(fsm);
    fsm.update(99);
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it('stays silent when the run is torn down by abort instead', () => {
    const onAbort = vi.fn();
    const onIdle = vi.fn();
    const fsm = makeFsm({ onAbort, onIdle });
    walkToCelebrating(fsm);
    fsm.update(1.3);
    expect(fsm.abort()).toBe(true);
    fsm.update(99);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onIdle).not.toHaveBeenCalled();
  });
});

describe('abort from any state (FR6)', () => {
  it('returns to idle and emits cleanup from every non-idle state', () => {
    for (const state of FIRE_STATES) {
      if (state === 'idle') continue;
      const onAbort = vi.fn();
      const fsm = makeFsm({ onAbort });
      walkTo(fsm, state);
      expect(fsm.getState()).toBe(state);
      expect(fsm.abort()).toBe(true);
      expect(fsm.getState()).toBe('idle');
      expect(onAbort).toHaveBeenCalledTimes(1);
      expect(onAbort).toHaveBeenCalledWith(state);
    }
  });

  it('aborts mid-celebration: no lingering back, no second celebration', () => {
    const onCelebrate = vi.fn();
    const onAbort = vi.fn();
    const fsm = makeFsm({ onCelebrate, onAbort });
    walkToCelebrating(fsm);
    fsm.update(1.3); // mid-linger
    expect(fsm.abort()).toBe(true);
    expect(fsm.getState()).toBe('idle');
    fsm.update(0.1);
    expect(fsm.getState()).toBe('idle');
    expect(onCelebrate).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledWith('complete');
  });

  it('resets the linger timer so a fresh run lingers in full', () => {
    const fsm = makeFsm();
    walkToCelebrating(fsm);
    fsm.update(1.3); // partial linger
    fsm.abort();
    walkToCelebrating(fsm);
    fsm.update(1.3); // would exceed 2.5 if the old timer leaked
    expect(fsm.getState()).toBe('complete');
    fsm.update(1.3);
    expect(fsm.getState()).toBe('idle');
  });

  it('is a no-op at idle', () => {
    const onAbort = vi.fn();
    const fsm = makeFsm({ onAbort });
    expect(fsm.abort()).toBe(false);
    expect(onAbort).not.toHaveBeenCalled();
    expect(fsm.getState()).toBe('idle');
  });

  it('allows celebration again after an aborted run', () => {
    const onCelebrate = vi.fn();
    const fsm = makeFsm({ onCelebrate });
    walkToCelebrating(fsm);
    fsm.abort();
    walkToReady(fsm);
    fsm.attempt('active', 'complete');
    expect(onCelebrate).toHaveBeenCalledTimes(2);
    expect(fsm.getState()).toBe('complete');
  });
});

describe('per-mission configuration', () => {
  const Missions = [
    {
      name: 'fire',
      states: FIRE_STATES,
      initial: 'idle',
      celebrating: 'complete',
      linger: FIRE_LINGER,
    },
    {
      name: 'order',
      states: ['idle', 'spawned', 'driving', 'active', 'complete'] as const,
      initial: 'idle',
      celebrating: 'complete',
      linger: ORDER_LINGER,
    },
    {
      name: 'park',
      states: ['idle', 'spawned', 'responding', 'collecting', 'complete'] as const,
      initial: 'idle',
      celebrating: 'complete',
      linger: PARK_LINGER,
    },
    {
      name: 'puppy',
      states: ['idle', 'searching', 'carrying', 'complete'] as const,
      initial: 'idle',
      celebrating: 'complete',
      linger: PUPPY_LINGER,
    },
  ] as const;

  for (const mission of Missions) {
    it(`runs the ${mission.name} lifecycle with its own states and linger`, () => {
      type S = (typeof mission.states)[number];
      const fsm = createMissionFsm<S>({
        states: mission.states,
        initialState: mission.initial,
        celebratingState: mission.celebrating,
        lingerSeconds: mission.linger,
      });
      // Walk the declared chain into celebrating.
      let cursor: S = mission.initial;
      let steps = 0;
      for (const next of mission.states) {
        if (next === cursor) continue;
        expect(fsm.attempt(cursor, next), `${mission.name} step ${steps}`).toBe(true);
        cursor = next;
        steps += 1;
      }
      expect(steps).toBe(mission.states.length - 1);
      fsm.update(mission.linger + 0.1);
      expect(fsm.getState()).toBe(mission.initial);
    });
  }
});
