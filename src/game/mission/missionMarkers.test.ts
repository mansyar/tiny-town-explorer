/**
 * Red-first contract tests for the shared marker layer (FR2): one adapter
 * interface covering the cone/ring, litter pile, puppy spot, and fire target.
 * Visibility, arm/disarm, and tap-resolution are driven by FSM state plus a
 * wire flag, expressed once in `missionMarkers.ts`.
 *
 * The per-mission adapter tables are pinned to the same expectations the
 * Phase 1 characterization matrix records, so re-pointing the wiring in Task
 * 2 must not move a single answer.
 */

import { describe, expect, it } from 'vitest';
import { type IceCreamState, ORDER_CONE } from './iceCreamMission';
import { FIRE_FLAME, type MissionState } from './missionManager';
import {
  type MarkerAdapter,
  markerArmed,
  markerTap,
  markerVisible,
  syncMarker,
} from './missionMarkers';
import { PARK_FIELD, type ParkState } from './parkMission';
import { PUPPY_HEART, PUPPY_PAW, type PuppyState } from './puppyMission';

type DriveState = MissionState | IceCreamState;

const DRIVE_STATES: DriveState[] = ['idle', 'spawned', 'driving', 'active', 'complete'];
const PARK_STATES: ParkState[] = [
  'idle',
  'spawned',
  'responding',
  'collecting',
  'complete',
];
const PUPPY_STATES: PuppyState[] = ['idle', 'searching', 'carrying', 'complete'];

/** Toy adapter for the generic contract tests. */
const TOY: MarkerAdapter<ToyState, 'ignore' | 'claim' | 'strong'> = {
  showIn: ['armed'],
  armIn: ['armed'],
  taps: [
    { inState: 'armed', needsTarget: true, outcome: 'claim' },
    { inState: 'armed', needsTarget: true, needsArmed: true, outcome: 'strong' },
  ],
};
type ToyState = 'idle' | 'armed';

describe('shared marker contract', () => {
  it('markerVisible is exactly membership in showIn', () => {
    expect(markerVisible(TOY, 'armed')).toBe(true);
    expect(markerVisible(TOY, 'idle')).toBe(false);
  });

  it('markerArmed needs both the arm state and the wire', () => {
    expect(markerArmed(TOY, 'armed', true)).toBe(true);
    expect(markerArmed(TOY, 'armed', false)).toBe(false);
    expect(markerArmed(TOY, 'idle', true)).toBe(false);
  });

  it('markerArmed is never armed when the adapter declares no arm state', () => {
    const unarmed: MarkerAdapter<'armed', 'ignore'> = { showIn: ['armed'], taps: [] };
    expect(markerArmed(unarmed, 'armed', true)).toBe(false);
  });

  it('markerTap picks the first rule that fully matches', () => {
    expect(markerTap(TOY, { state: 'armed', onTarget: true, armed: true })).toBe('claim');
  });

  it('markerTap falls through to ignore when a requirement fails', () => {
    expect(markerTap(TOY, { state: 'armed', onTarget: false, armed: true })).toBe(
      'ignore',
    );
    expect(markerTap(TOY, { state: 'idle', onTarget: true, armed: true })).toBe('ignore');
  });
});

describe('fire flame adapter matches the characterization matrix', () => {
  const visible: Record<MissionState, boolean> = {
    idle: false,
    spawned: true,
    driving: true,
    active: true,
    complete: false,
  };

  it('shows in spawned/driving/active, hides otherwise', () => {
    for (const state of DRIVE_STATES) {
      expect(markerVisible(FIRE_FLAME, state), `flame in ${state}`).toBe(visible[state]);
    }
  });

  it('arms the hose only while active', () => {
    expect(markerArmed(FIRE_FLAME, 'active', true)).toBe(true);
    expect(markerArmed(FIRE_FLAME, 'driving', true)).toBe(false);
    expect(markerArmed(FIRE_FLAME, 'active', false)).toBe(false);
  });

  it('answers a target tap only in spawned, never while spraying', () => {
    const taps: Record<DriveState, string> = {
      idle: 'ignore',
      spawned: 'respond',
      driving: 'ignore',
      active: 'ignore',
      complete: 'ignore',
    };
    for (const state of DRIVE_STATES) {
      expect(markerTap(FIRE_FLAME, { state, onTarget: true }), `tap in ${state}`).toBe(
        taps[state],
      );
      expect(markerTap(FIRE_FLAME, { state, onTarget: false })).toBe('ignore');
    }
  });
});

describe('order cone adapter matches the characterization matrix', () => {
  const visible: Record<IceCreamState, boolean> = {
    idle: false,
    spawned: true,
    driving: true,
    active: true,
    complete: false,
  };

  it('shows exactly while the order is open (ring arms within active)', () => {
    for (const state of DRIVE_STATES) {
      expect(markerVisible(ORDER_CONE, state), `cone in ${state}`).toBe(visible[state]);
    }
    expect(markerArmed(ORDER_CONE, 'active', true)).toBe(true);
    expect(markerArmed(ORDER_CONE, 'driving', true)).toBe(false);
  });

  it('resolves one outcome per state — respond, serve, or ignore', () => {
    const taps: Record<IceCreamState, 'ignore' | 'respond' | 'serve'> = {
      idle: 'ignore',
      spawned: 'respond',
      driving: 'ignore',
      active: 'serve',
      complete: 'ignore',
    };
    for (const state of DRIVE_STATES) {
      expect(
        markerTap(ORDER_CONE, { state, onTarget: true, armed: true }),
        `tap in ${state}`,
      ).toBe(taps[state]);
      // Off the ordering house: never claimable. Unarmed: `respond` never
      // needed the wire — only `serve` does, so spawned still claims.
      expect(markerTap(ORDER_CONE, { state, onTarget: false, armed: true })).toBe(
        'ignore',
      );
      expect(markerTap(ORDER_CONE, { state, onTarget: true, armed: false })).toBe(
        state === 'spawned' ? 'respond' : 'ignore',
      );
    }
  });
});

describe('park litter adapter matches the characterization matrix', () => {
  const visible: Record<ParkState, boolean> = {
    idle: false,
    spawned: true,
    responding: true,
    collecting: true,
    complete: false,
  };

  it('shows exactly while the clean-up runs', () => {
    for (const state of PARK_STATES) {
      expect(markerVisible(PARK_FIELD, state), `field in ${state}`).toBe(visible[state]);
    }
  });

  it('answers a piece tap only in spawned', () => {
    for (const state of PARK_STATES) {
      expect(markerTap(PARK_FIELD, { state, onTarget: true }), `tap in ${state}`).toBe(
        state === 'spawned' ? 'respond' : 'ignore',
      );
      expect(markerTap(PARK_FIELD, { state, onTarget: false })).toBe('ignore');
    }
  });
});

describe('puppy spot adapters match the characterization matrix', () => {
  const visible: Record<PuppyState, { paw: boolean; heart: boolean }> = {
    idle: { paw: false, heart: false },
    searching: { paw: true, heart: false },
    carrying: { paw: false, heart: true },
    complete: { paw: false, heart: false },
  };

  it('paw while searching, heart while carrying, never both', () => {
    for (const state of PUPPY_STATES) {
      expect(markerVisible(PUPPY_PAW, state), `paw in ${state}`).toBe(visible[state].paw);
      expect(markerVisible(PUPPY_HEART, state), `heart in ${state}`).toBe(
        visible[state].heart,
      );
    }
  });

  it('arms delivery only while carrying', () => {
    expect(markerArmed(PUPPY_HEART, 'carrying', true)).toBe(true);
    expect(markerArmed(PUPPY_HEART, 'searching', true)).toBe(false);
    expect(markerArmed(PUPPY_HEART, 'carrying', false)).toBe(false);
  });

  it('resolves a house tap only while carrying and armed', () => {
    for (const state of PUPPY_STATES) {
      expect(
        markerTap(PUPPY_HEART, { state, onTarget: true, armed: true }),
        `tap in ${state}`,
      ).toBe(state === 'carrying' ? 'deliver' : 'ignore');
    }
    expect(
      markerTap(PUPPY_HEART, { state: 'carrying', onTarget: false, armed: true }),
    ).toBe('ignore');
    expect(
      markerTap(PUPPY_HEART, { state: 'carrying', onTarget: true, armed: false }),
    ).toBe('ignore');
    // The paw is a signpost, not a target: it answers nothing.
    expect(markerTap(PUPPY_PAW, { state: 'searching', onTarget: true })).toBe('ignore');
  });
});

describe('cross-adapter isolation (AC3)', () => {
  it('while a fire is spawned, only the flame is present', () => {
    const fireState: DriveState = 'spawned';
    expect(markerVisible(FIRE_FLAME, fireState)).toBe(true);
    expect(markerVisible(ORDER_CONE, 'idle')).toBe(false);
    expect(markerVisible(PARK_FIELD, 'idle')).toBe(false);
    expect(markerVisible(PUPPY_PAW, 'idle')).toBe(false);
    expect(markerVisible(PUPPY_HEART, 'idle')).toBe(false);
    expect(markerTap(FIRE_FLAME, { state: 'idle', onTarget: true })).toBe('ignore');
  });
});

describe('syncMarker levels a marker to its rule', () => {
  function fakeMarker() {
    let showing = false;
    const calls: string[] = [];
    return {
      isShowing: () => showing,
      show: () => {
        showing = true;
        calls.push('show');
      },
      hide: () => {
        showing = false;
        calls.push('hide');
      },
      place: (point: { x: number; z: number }) => {
        calls.push(`place:${point.x}`);
      },
      calls,
    };
  }

  it('transitions into wanted exactly once', () => {
    const marker = fakeMarker();
    syncMarker(true, marker);
    syncMarker(true, marker);
    expect(marker.isShowing()).toBe(true);
    expect(marker.calls).toEqual(['show']);
  });

  it('hides on the way out, then leaves a hidden marker alone', () => {
    const marker = fakeMarker();
    syncMarker(true, marker);
    syncMarker(false, marker);
    syncMarker(false, marker);
    expect(marker.isShowing()).toBe(false);
    expect(marker.calls).toEqual(['show', 'hide']);
  });

  it('places just before the first show when given a point', () => {
    const marker = fakeMarker();
    syncMarker(true, marker, { x: 3, z: 5 });
    syncMarker(true, marker, { x: 9, z: 9 });
    expect(marker.calls).toEqual(['place:3', 'show']);
  });
});
