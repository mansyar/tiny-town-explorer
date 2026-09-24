/**
 * Abort/teardown parity harness (FR6, AC4): from every FSM state, drive each
 * mission through its teardown and assert full cleanup — no orphan markers,
 * no way to re-fire a celebration afterwards, and nothing left pending that
 * could leak into the town's next beat.
 *
 * Both teardown routes are pinned, because the town has two ways to end a run
 * and they have to agree:
 *
 * - **The linger** — the shipped route: `update` past the completion timer.
 * - **`abort()`** — the route held in reserve: teardown from any state,
 *   including mid-celebration, which is what the four `onAbort` hooks exist to
 *   satisfy. The town's busy gate means nothing preempts a running mission
 *   today (every mission waits patiently by design), so this half is a
 *   contract rather than a live path — but it must clean up exactly like the
 *   linger does, and it must leave a mission that can run again.
 *
 * Refused restarts are pinned too: a running stage can never be half-replaced.
 * The cleanup bundle asserted throughout — pristine idle, hidden markers, dead
 * taps, one celebration ever — is the same for both routes.
 */

import { describe, expect, it } from 'vitest';
import {
  BURSTS_MIN,
  createFireMission,
  COMPLETE_LINGER_SECONDS as FIRE_LINGER,
  type FireMissionState,
} from './fireMission';
import {
  createIceCreamMission,
  type IceCreamState,
  COMPLETE_LINGER_SECONDS as ORDER_LINGER,
} from './iceCreamMission';
import { createOrderBeats, orderIsOpen, resolveOrderTap } from './orderFlow';
import {
  createParkMission,
  COMPLETE_LINGER_SECONDS as PARK_LINGER,
  type ParkState,
  resolveParkTap,
} from './parkMission';
import {
  createPuppyMission,
  COMPLETE_LINGER_SECONDS as PUPPY_LINGER,
  type PuppyState,
  resolvePuppyTap,
} from './puppyMission';

const FIRE_STATES: FireMissionState[] = [
  'idle',
  'spawned',
  'driving',
  'active',
  'complete',
];
const ORDER_STATES: IceCreamState[] = [
  'idle',
  'spawned',
  'driving',
  'active',
  'complete',
];
const PARK_STATES: ParkState[] = [
  'idle',
  'spawned',
  'responding',
  'collecting',
  'complete',
];
const PUPPY_STATES: PuppyState[] = ['idle', 'searching', 'carrying', 'complete'];

const RUNNING = <T>(states: readonly T[]): T[] => states.filter((s) => s !== 'idle');

/** Matches `main.ts`'s flame rule: a house with bursts left burns. */
const flameShows = (fire: {
  fireHouseId: string | undefined;
  burstsLeft: number;
}): boolean => fire.fireHouseId !== undefined && fire.burstsLeft > 0;

const litterFieldShows = (state: ParkState): boolean =>
  state === 'spawned' || state === 'responding' || state === 'collecting';

// --- Walkers: build to a state, then drain from it to a pristine idle. -------

function buildFire(state: FireMissionState) {
  const mission = createFireMission({ random: () => 0 });
  if (state === 'idle') return mission;
  mission.spawn('house-4');
  if (state === 'spawned') return mission;
  mission.respond();
  if (state === 'driving') return mission;
  mission.update(1 / 60, 0);
  if (state === 'active') return mission;
  for (let burst = 0; burst < BURSTS_MIN; burst += 1) mission.spray();
  return mission;
}

function drainFire(state: FireMissionState) {
  const mission = buildFire(state);
  if (state === 'idle') return mission;
  if (state === 'spawned') mission.respond();
  mission.update(1 / 60, 0);
  if (state !== 'complete') {
    for (let burst = 0; burst < BURSTS_MIN; burst += 1) mission.spray();
  }
  mission.update(FIRE_LINGER + 0.1, 99);
  return mission;
}

function buildOrder(state: IceCreamState) {
  const mission = createIceCreamMission();
  if (state === 'idle') return mission;
  mission.spawn('house-4');
  if (state === 'spawned') return mission;
  mission.respond();
  if (state === 'driving') return mission;
  mission.update(1 / 60, 0);
  if (state === 'active') return mission;
  mission.serve();
  return mission;
}

function drainOrder(state: IceCreamState) {
  const mission = buildOrder(state);
  if (state === 'idle') return mission;
  if (state === 'spawned') mission.respond();
  mission.update(1 / 60, 0);
  if (state !== 'complete') mission.serve();
  mission.update(ORDER_LINGER + 0.1, 99);
  return mission;
}

function buildPark(state: ParkState) {
  const mission = createParkMission();
  if (state === 'idle') return mission;
  mission.spawn();
  if (state === 'spawned') return mission;
  mission.respond();
  if (state === 'responding') return mission;
  mission.update(1 / 60, 0);
  if (state === 'collecting') return mission;
  mission.finish();
  return mission;
}

function drainPark(state: ParkState) {
  const mission = buildPark(state);
  if (state === 'idle') return mission;
  if (state === 'spawned') mission.respond();
  mission.update(1 / 60, 0);
  if (state !== 'complete') mission.finish();
  mission.update(PARK_LINGER + 0.1, 99);
  return mission;
}

function buildPuppy(state: PuppyState) {
  const mission = createPuppyMission();
  if (state === 'idle') return mission;
  mission.siren();
  if (state === 'searching') return mission;
  mission.update(1 / 60, 0, 99);
  if (state === 'carrying') return mission;
  mission.update(1 / 60, 99, 0);
  mission.deliver();
  return mission;
}

function drainPuppy(state: PuppyState) {
  const mission = buildPuppy(state);
  if (state === 'idle') return mission;
  if (state === 'searching') mission.update(1 / 60, 0, 99);
  mission.update(1 / 60, 99, 0);
  if (state !== 'complete') mission.deliver();
  mission.update(PUPPY_LINGER + 0.1, 99, 99);
  return mission;
}

// --- The cleanup bundle, per mission. ----------------------------------------

describe('fire teardown (FR6, AC4)', () => {
  it('drains from every state to a pristine idle with the flame out', () => {
    for (const state of FIRE_STATES) {
      const snapshot = drainFire(state).snapshot();
      expect(snapshot.state, state).toBe('idle');
      expect(snapshot.fireHouseId, state).toBeUndefined();
      expect(snapshot.burstsLeft, state).toBe(0);
      expect(flameShows(snapshot), state).toBe(false);
    }
  });

  it('leaves no tap that could re-fire a celebration', () => {
    const mission = drainFire('active');
    expect(mission.respond()).toBe(false);
    expect(mission.spray()).toBe(false);
  });

  it('never lets a restart replace a burning stage (no orphan swap)', () => {
    for (const state of RUNNING(FIRE_STATES)) {
      const mission = buildFire(state);
      expect(mission.spawn('house-9'), state).toBe(false);
      expect(mission.snapshot().fireHouseId, state).toBe('house-4');
    }
  });

  it('lights the next fire fresh after teardown', () => {
    const mission = drainFire('active');
    expect(mission.spawn('house-9')).toBe(true);
    expect(mission.snapshot().fireHouseId).toBe('house-9');
  });
});

describe('order teardown (FR6, AC4)', () => {
  it('drains from every state to a pristine idle with the cone hidden', () => {
    for (const state of ORDER_STATES) {
      const mission = drainOrder(state);
      expect(mission.snapshot().state, state).toBe('idle');
      expect(mission.snapshot().orderHouseId, state).toBeUndefined();
      expect(orderIsOpen(mission.snapshot().state), state).toBe(false);
      expect(
        resolveOrderTap({ state: 'idle', onOrderHouse: true, armed: true }),
        state,
      ).toBe('ignore');
    }
  });

  it('owes exactly one celebration per run, and none after teardown', () => {
    const beats = createOrderBeats();
    const mission = createIceCreamMission();
    let opened = 0;
    let served = 0;
    const step = (): void => {
      const owed = beats(mission.snapshot());
      if (owed.orderOpened) opened += 1;
      if (owed.served) served += 1;
    };

    step(); // the quiet town owes nothing
    mission.spawn('house-4');
    step();
    mission.respond();
    mission.update(1 / 60, 0);
    step();
    mission.serve();
    step();
    mission.update(ORDER_LINGER + 0.1, 99); // teardown: linger → idle
    step();

    expect(opened).toBe(1);
    expect(served).toBe(1);
    // Frames after teardown: nothing pending, nothing owed, ever.
    for (let frame = 0; frame < 180; frame += 1) step();
    expect(opened).toBe(1);
    expect(served).toBe(1);
    expect(mission.serve()).toBe(false);
  });

  it('never lets a restart replace an open order (no orphan swap)', () => {
    for (const state of RUNNING(ORDER_STATES)) {
      const mission = buildOrder(state);
      expect(mission.spawn('house-9'), state).toBe(false);
      expect(mission.snapshot().orderHouseId, state).toBe('house-4');
    }
  });

  it('takes the next order fresh after teardown', () => {
    const mission = drainOrder('active');
    expect(mission.spawn('house-9')).toBe(true);
    expect(mission.snapshot().orderHouseId).toBe('house-9');
  });
});

describe('park teardown (FR6, AC4)', () => {
  it('drains from every state to a pristine idle with the field gone', () => {
    for (const state of PARK_STATES) {
      const mission = drainPark(state);
      expect(mission.snapshot().state, state).toBe('idle');
      // The field is emptied by the take that finishes it (`main.ts` absorb),
      // so idle owes no litter — no orphan marker after teardown.
      expect(litterFieldShows(mission.snapshot().state), state).toBe(false);
      expect(mission.finish(), state).toBe(false);
      expect(resolveParkTap({ state: 'idle', onPiece: true }), state).toBe('ignore');
    }
  });

  it('never lets a restart replace a running clean-up', () => {
    for (const state of RUNNING(PARK_STATES)) {
      const mission = buildPark(state);
      expect(mission.spawn(), state).toBe(false);
      expect(mission.snapshot().state, state).toBe(state);
    }
  });

  it('lays the next field fresh after teardown', () => {
    expect(drainPark('collecting').spawn()).toBe(true);
  });
});

describe('puppy teardown (FR6, AC4)', () => {
  it('drains from every state to a pristine idle with no marker', () => {
    for (const state of PUPPY_STATES) {
      const mission = drainPuppy(state);
      expect(mission.snapshot().state, state).toBe('idle');
      // Paw shows only while searching, heart only while carrying — neither
      // at idle, so teardown orphans no marker.
      expect(mission.isDeliverReady(), state).toBe(false);
      expect(mission.deliver(), state).toBe(false);
      expect(
        resolvePuppyTap({ state: 'idle', onOwnerHouse: true, armed: true }),
        state,
      ).toBe('ignore');
    }
  });

  it('never lets a restart replace a live errand (no orphan swap)', () => {
    for (const state of RUNNING(PUPPY_STATES)) {
      const mission = buildPuppy(state);
      expect(mission.siren(), state).toBe(false);
      expect(mission.snapshot().state, state).toBe(state);
    }
  });

  it('opens the next errand fresh after teardown', () => {
    expect(drainPuppy('carrying').siren()).toBe(true);
  });
});

// --- The held-in-reserve route: abort() from any state (FR6, AC4). ----------

describe('abort() teardown (FR6, AC4)', () => {
  it('drains a fire to a pristine idle, and the next fire still lights', () => {
    for (const state of FIRE_STATES) {
      const mission = buildFire(state);
      expect(mission.abort(), state).toBe(state !== 'idle');
      const snapshot = mission.snapshot();
      expect(snapshot.state, state).toBe('idle');
      expect(snapshot.fireHouseId, state).toBeUndefined();
      expect(snapshot.burstsLeft, state).toBe(0);
      expect(flameShows(snapshot), state).toBe(false);
      expect(mission.isHoseReady(0), state).toBe(false);
      expect(mission.respond(), state).toBe(false);
      expect(mission.spray(), state).toBe(false);
      expect(mission.spawn('house-9'), state).toBe(true);
    }
  });

  it('drains an order to a pristine idle, and the next order still opens', () => {
    for (const state of ORDER_STATES) {
      const mission = buildOrder(state);
      expect(mission.abort(), state).toBe(state !== 'idle');
      const snapshot = mission.snapshot();
      expect(snapshot.state, state).toBe('idle');
      expect(snapshot.orderHouseId, state).toBeUndefined();
      expect(orderIsOpen(snapshot.state), state).toBe(false);
      expect(mission.isServeReady(0), state).toBe(false);
      expect(
        resolveOrderTap({ state: snapshot.state, onOrderHouse: true, armed: true }),
        state,
      ).toBe('ignore');
      expect(mission.spawn('house-9'), state).toBe(true);
    }
  });

  it('drains a clean-up to a pristine idle, and the next field still lays', () => {
    for (const state of PARK_STATES) {
      const mission = buildPark(state);
      expect(mission.abort(), state).toBe(state !== 'idle');
      const snapshot = mission.snapshot();
      expect(snapshot.state, state).toBe('idle');
      expect(litterFieldShows(snapshot.state), state).toBe(false);
      expect(resolveParkTap({ state: snapshot.state, onPiece: true }), state).toBe(
        'ignore',
      );
      expect(mission.finish(), state).toBe(false);
      expect(mission.spawn(), state).toBe(true);
    }
  });

  it('drains an errand to a pristine idle, and the next errand still opens', () => {
    for (const state of PUPPY_STATES) {
      const mission = buildPuppy(state);
      expect(mission.abort(), state).toBe(state !== 'idle');
      const snapshot = mission.snapshot();
      expect(snapshot.state, state).toBe('idle');
      expect(mission.isDeliverReady(), state).toBe(false);
      expect(
        resolvePuppyTap({ state: snapshot.state, onOwnerHouse: true, armed: true }),
        state,
      ).toBe('ignore');
      expect(mission.deliver(), state).toBe(false);
      expect(mission.siren(), state).toBe(true);
    }
  });
});
