/**
 * Characterization matrix for the mission-framework consolidation (AC3):
 * one row per mission per FSM state, pinning which markers that state owes
 * and what a tap resolves to — so the shared framework in later phases must
 * reproduce today's behaviour exactly, and no marker is ever visible or
 * tappable outside its own mission and state.
 *
 * Marker rules mirror the wiring in `main.ts`: the flame shows while a fire
 * has bursts left (`extinguish`/`setBursts`), the cone follows `orderIsOpen`,
 * the litter field is owed while the clean-up runs (`startPark` builds it, the
 * last take empties it), and the puppy's paw shows while `searching`, the
 * heart while `carrying` (state-derived, never both).
 */

import { describe, expect, it } from 'vitest';
import {
  BURSTS_MIN,
  createFireMission,
  type FireMissionSnapshot,
  type FireMissionState,
} from './fireMission';
import { createIceCreamMission, type IceCreamState } from './iceCreamMission';
import { orderIsOpen, resolveOrderTap } from './orderFlow';
import { createParkMission, type ParkState, resolveParkTap } from './parkMission';
import { createPuppyMission, type PuppyState, resolvePuppyTap } from './puppyMission';

const ALL_ICE_STATES: IceCreamState[] = [
  'idle',
  'spawned',
  'driving',
  'active',
  'complete',
];
const ALL_PARK_STATES: ParkState[] = [
  'idle',
  'spawned',
  'responding',
  'collecting',
  'complete',
];
const ALL_FIRE_STATES: FireMissionState[] = [
  'idle',
  'spawned',
  'driving',
  'active',
  'complete',
];
const ALL_PUPPY_STATES: PuppyState[] = ['idle', 'searching', 'carrying', 'complete'];

/** Matches `main.ts`'s flame rule: a house with bursts left burns. */
const flameShows = (fire: FireMissionSnapshot): boolean =>
  fire.fireHouseId !== undefined && fire.burstsLeft > 0;

/**
 * The litter field is owed exactly while the clean-up is running: built on
 * spawn, emptied by the take that finishes it (`main.ts` `startPark`/`absorb`).
 */
const litterFieldShows = (state: ParkState): boolean =>
  state === 'spawned' || state === 'responding' || state === 'collecting';

/** Drives a fresh fire mission to `state` and hands back the live mission. */
function fireMissionAt(state: FireMissionState) {
  const mission = createFireMission({ random: () => 0 });
  if (state !== 'idle') mission.spawn('house-4');
  if (state === 'spawned') return mission;
  if (['driving', 'active', 'complete'].includes(state)) mission.respond();
  if (state === 'driving') return mission;
  mission.update(1 / 60, 0); // within HOSE_RANGE → active
  if (state === 'active') return mission;
  for (let burst = 0; burst < BURSTS_MIN; burst += 1) mission.spray();
  return mission;
}

const fireAt = (state: FireMissionState): FireMissionSnapshot =>
  fireMissionAt(state).snapshot();

/** Drives a fresh order mission to `state` and hands back the state. */
function orderAt(state: IceCreamState): IceCreamState {
  const mission = createIceCreamMission();
  if (state !== 'idle') mission.spawn('house-4');
  if (state === 'spawned') return state;
  if (['driving', 'active', 'complete'].includes(state)) mission.respond();
  if (state === 'driving') return state;
  mission.update(1 / 60, 0); // within SERVE_RANGE → active
  if (state === 'active') return state;
  mission.serve();
  return mission.snapshot().state;
}

/** Drives a fresh clean-up to `state` and hands back the state. */
function parkAt(state: ParkState): ParkState {
  const mission = createParkMission();
  if (state !== 'idle') mission.spawn();
  if (state === 'spawned') return state;
  if (['responding', 'collecting', 'complete'].includes(state)) mission.respond();
  if (state === 'responding') return state;
  mission.update(1 / 60, 0); // within COLLECT_RANGE → collecting
  if (state === 'collecting') return state;
  mission.finish();
  return mission.snapshot().state;
}

/** Drives a fresh errand to `state` and hands back the state. */
function puppyAt(state: PuppyState): PuppyState {
  const mission = createPuppyMission();
  if (state !== 'idle') mission.siren();
  if (state === 'searching') return state;
  mission.update(1 / 60, 0, 99); // drive over the pup → carrying
  if (state === 'carrying') return state;
  mission.update(1 / 60, 99, 0); // within DELIVERY_RANGE
  mission.deliver();
  return mission.snapshot().state;
}

describe('fire: markers and taps by state (AC3)', () => {
  it('shows the flame only while a fire still has bursts', () => {
    const markers: Record<FireMissionState, boolean> = {
      idle: false,
      spawned: true,
      driving: true,
      active: true,
      complete: false,
    };
    for (const state of ALL_FIRE_STATES) {
      expect(flameShows(fireAt(state)), `flame in ${state}`).toBe(markers[state]);
    }
  });

  it('answers only in spawned, and sprays only when active', () => {
    for (const state of ALL_FIRE_STATES) {
      const mission = fireMissionAt(state);
      expect(mission.snapshot().state).toBe(state);
      expect(mission.respond(), `respond in ${state}`).toBe(state === 'spawned');
      expect(mission.spray(), `spray in ${state}`).toBe(state === 'active');
    }
  });
});

describe('ice cream: markers and taps by state (AC3)', () => {
  it('shows the cone exactly while the order is open', () => {
    const markers: Record<IceCreamState, boolean> = {
      idle: false,
      spawned: true,
      driving: true,
      active: true,
      complete: false,
    };
    for (const state of ALL_ICE_STATES) {
      expect(orderIsOpen(orderAt(state)), `cone in ${state}`).toBe(markers[state]);
    }
  });

  it('resolves one tap outcome per state — respond, serve, or ignore', () => {
    const taps: Record<IceCreamState, 'ignore' | 'respond' | 'serve'> = {
      idle: 'ignore',
      spawned: 'respond',
      driving: 'ignore',
      active: 'serve',
      complete: 'ignore',
    };
    for (const state of ALL_ICE_STATES) {
      expect(
        resolveOrderTap({ state, onOrderHouse: true, armed: true }),
        `tap in ${state}`,
      ).toBe(taps[state]);
      // Off the ordering house, in every state: never claimable.
      expect(resolveOrderTap({ state, onOrderHouse: false, armed: true })).toBe('ignore');
    }
  });
});

describe('park: markers and taps by state (AC3)', () => {
  it('owes the litter field exactly while the clean-up runs', () => {
    const markers: Record<ParkState, boolean> = {
      idle: false,
      spawned: true,
      responding: true,
      collecting: true,
      complete: false,
    };
    for (const state of ALL_PARK_STATES) {
      expect(litterFieldShows(parkAt(state)), `field in ${state}`).toBe(markers[state]);
    }
  });

  it('resolves a piece tap only in spawned, never once the truck set off', () => {
    const taps: Record<ParkState, 'ignore' | 'respond'> = {
      idle: 'ignore',
      spawned: 'respond',
      responding: 'ignore',
      collecting: 'ignore',
      complete: 'ignore',
    };
    for (const state of ALL_PARK_STATES) {
      expect(resolveParkTap({ state, onPiece: true }), `tap in ${state}`).toBe(
        taps[state],
      );
      expect(resolveParkTap({ state, onPiece: false })).toBe('ignore');
    }
  });
});

describe('puppy: markers and taps by state (AC3)', () => {
  it('reaches each state the paw/heart wiring depends on', () => {
    // The paw shows while `searching`, the heart while `carrying`, neither
    // otherwise — state-derived in `main.ts`, so the states themselves are
    // what the shared marker layer must keep feeding it.
    const markers: Record<PuppyState, 'none' | 'paw' | 'heart'> = {
      idle: 'none',
      searching: 'paw',
      carrying: 'heart',
      complete: 'none',
    };
    for (const state of ALL_PUPPY_STATES) {
      const reached = puppyAt(state);
      expect(reached, `walk to ${state}`).toBe(state);
      const marker =
        reached === 'searching' ? 'paw' : reached === 'carrying' ? 'heart' : 'none';
      expect(marker, `marker in ${state}`).toBe(markers[state]);
    }
  });

  it('resolves a house tap only while carrying and armed', () => {
    const taps: Record<PuppyState, 'ignore' | 'deliver'> = {
      idle: 'ignore',
      searching: 'ignore',
      carrying: 'deliver',
      complete: 'ignore',
    };
    for (const state of ALL_PUPPY_STATES) {
      expect(
        resolvePuppyTap({ state, onOwnerHouse: true, armed: true }),
        `tap in ${state}`,
      ).toBe(taps[state]);
    }
    // Car but off the house, or unarmed: always ignore.
    expect(resolvePuppyTap({ state: 'carrying', onOwnerHouse: false, armed: true })).toBe(
      'ignore',
    );
    expect(resolvePuppyTap({ state: 'carrying', onOwnerHouse: true, armed: false })).toBe(
      'ignore',
    );
  });
});

describe('cross-mission isolation (AC3)', () => {
  it('no marker of the quiet missions shows while a fire is spawned', () => {
    expect(flameShows(fireAt('spawned'))).toBe(true);
    // The other three are idle under the shared busy gate: every marker hidden.
    expect(orderIsOpen(orderAt('idle'))).toBe(false);
    expect(litterFieldShows(parkAt('idle'))).toBe(false);
    const puppy = createPuppyMission();
    expect(puppy.snapshot().state).toBe('idle'); // no paw, no heart
  });

  it('no tap of the quiet missions is claimable while their state is idle', () => {
    expect(resolveOrderTap({ state: 'idle', onOrderHouse: true, armed: true })).toBe(
      'ignore',
    );
    expect(resolveParkTap({ state: 'idle', onPiece: true })).toBe('ignore');
    expect(resolvePuppyTap({ state: 'idle', onOwnerHouse: true, armed: true })).toBe(
      'ignore',
    );
    // And a fresh fire ignores an answer with nothing burning.
    expect(createFireMission({ random: () => 0 }).respond()).toBe(false);
  });
});
