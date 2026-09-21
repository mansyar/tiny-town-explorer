import { describe, expect, it } from 'vitest';
import type { IceCreamSnapshot, IceCreamState } from './iceCreamMission';
import {
  createOrderBeats,
  isTapOnHouse,
  orderAwaitsKid,
  orderIsOpen,
  resolveOrderTap,
} from './orderFlow';

const HOUSE = { x: 2, z: -1 };

describe('which house a tap was aimed at', () => {
  it('counts a tap on the lot and one just beside it', () => {
    expect(isTapOnHouse(HOUSE, HOUSE)).toBe(true);
    expect(isTapOnHouse({ x: 2.6, z: -1.3 }, HOUSE)).toBe(true);
  });

  it('ignores a tap a street away', () => {
    expect(isTapOnHouse({ x: 3.2, z: -1 }, HOUSE)).toBe(false);
    expect(isTapOnHouse({ x: 2, z: -3 }, HOUSE)).toBe(false);
  });
});

describe('what a tap on the ordering house means', () => {
  it('answers the order while the kid has not arrived', () => {
    expect(resolveOrderTap({ state: 'spawned', onOrderHouse: true, armed: false })).toBe(
      'respond',
    );
  });

  it('serves a cone once the truck has jingled in reach', () => {
    expect(resolveOrderTap({ state: 'active', onOrderHouse: true, armed: true })).toBe(
      'serve',
    );
  });

  it('will not serve without the jingle, however close the truck is', () => {
    expect(resolveOrderTap({ state: 'active', onOrderHouse: true, armed: false })).toBe(
      'ignore',
    );
  });

  it('does nothing while the truck is still on its way', () => {
    expect(resolveOrderTap({ state: 'driving', onOrderHouse: true, armed: true })).toBe(
      'ignore',
    );
  });

  it('does nothing when nothing is ordered or the order is already filled', () => {
    for (const state of ['idle', 'complete'] as const) {
      expect(resolveOrderTap({ state, onOrderHouse: true, armed: true })).toBe('ignore');
    }
  });

  it('ignores a tap that missed the ordering house entirely', () => {
    for (const state of ['spawned', 'driving', 'active', 'complete', 'idle'] as const) {
      expect(resolveOrderTap({ state, onOrderHouse: false, armed: true })).toBe('ignore');
    }
  });
});

describe('the once-per-order beats', () => {
  const snapshot = (state: IceCreamState): IceCreamSnapshot => ({
    state,
    orderHouseId: state === 'idle' ? undefined : 'house-3',
  });

  /** Feeds a run of states through the beat clock, one frame each. */
  const run = (
    beats: ReturnType<typeof createOrderBeats>,
    states: readonly IceCreamState[],
  ): { opened: number; served: number } => {
    let opened = 0;
    let served = 0;
    for (const state of states) {
      const beat = beats(snapshot(state));
      if (beat.orderOpened) {
        opened += 1;
      }
      if (beat.served) {
        served += 1;
      }
    }
    return { opened, served };
  };

  it('says nothing while the town is quiet', () => {
    const beats = createOrderBeats();
    for (let frame = 0; frame < 120; frame += 1) {
      expect(beats(snapshot('idle'))).toEqual({ orderOpened: false, served: false });
    }
  });

  it('owes the jingle cue on the frame the order opens, and only that frame', () => {
    const beats = createOrderBeats();
    const { opened } = run(beats, ['idle', 'spawned', 'spawned', 'spawned', 'driving']);
    expect(opened).toBe(1);
  });

  it('owes one celebration for a serve, however long the linger lasts', () => {
    const beats = createOrderBeats();
    const { opened, served } = run(beats, [
      'idle',
      'spawned',
      'driving',
      'active',
      'active',
      'complete',
      'complete',
      'complete',
      'idle',
      'idle',
    ]);
    expect(opened).toBe(1);
    expect(served).toBe(1);
  });

  it('owes fresh beats for the next order, so a session keeps cuing', () => {
    const beats = createOrderBeats();
    run(beats, ['idle', 'spawned', 'driving', 'active', 'complete', 'idle']);
    const second = run(beats, [
      'spawned',
      'driving',
      'active',
      'complete',
      'complete',
      'idle',
    ]);
    expect(second).toEqual({ opened: 1, served: 1 });
  });

  it('never mistakes an abandoned order for a served one', () => {
    const beats = createOrderBeats();
    // The kid answered and drove off, then drove off again: no serve anywhere.
    const { opened, served } = run(beats, [
      'idle',
      'spawned',
      'driving',
      'active',
      'driving',
      'active',
      'driving',
      'idle',
    ]);
    expect(opened).toBe(1);
    expect(served).toBe(0);
  });
});

describe('the order predicates', () => {
  it('calls an order open from the moment it appears until it is served out', () => {
    expect(orderIsOpen('idle')).toBe(false);
    expect(orderIsOpen('spawned')).toBe(true);
    expect(orderIsOpen('driving')).toBe(true);
    expect(orderIsOpen('active')).toBe(true);
    expect(orderIsOpen('complete')).toBe(false);
  });

  it('calls an order waiting on the kid only while the truck is not in reach', () => {
    expect(orderAwaitsKid('idle')).toBe(false);
    expect(orderAwaitsKid('spawned')).toBe(true);
    expect(orderAwaitsKid('driving')).toBe(true);
    expect(orderAwaitsKid('active')).toBe(false);
    expect(orderAwaitsKid('complete')).toBe(false);
  });
});
