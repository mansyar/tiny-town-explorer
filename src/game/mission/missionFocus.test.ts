import { describe, expect, it } from 'vitest';
import { missionFocus } from './missionFocus';

const FIRE = { x: 1, z: 1 };
const HOUSE = { x: -3, z: 2 };
const CAR = { x: 0, z: 0 };

/** The quiet town, with only what a case cares about filled in. */
const quiet = {
  fireState: 'idle',
  fireAt: undefined,
  orderState: 'idle',
  orderAt: undefined,
  carPosition: CAR,
} as const;

describe('which mission the hand points at', () => {
  it('points at a fire that is still waiting on the kid', () => {
    for (const fireState of ['spawned', 'driving'] as const) {
      expect(missionFocus({ ...quiet, fireState, fireAt: FIRE })).toEqual({
        awaiting: true,
        destination: FIRE,
      });
    }
  });

  it('points at an order that is still waiting on the kid', () => {
    for (const orderState of ['spawned', 'driving'] as const) {
      expect(missionFocus({ ...quiet, orderState, orderAt: HOUSE })).toEqual({
        awaiting: true,
        destination: HOUSE,
      });
    }
  });

  it('stays out of the way once the kid has arrived and serve is armed', () => {
    expect(missionFocus({ ...quiet, fireState: 'active', fireAt: FIRE }).awaiting).toBe(
      false,
    );
    expect(
      missionFocus({ ...quiet, orderState: 'active', orderAt: HOUSE }).awaiting,
    ).toBe(false);
  });

  it('stays out of the way while a mission celebrates, and in a quiet town', () => {
    expect(missionFocus({ ...quiet, fireState: 'complete', fireAt: FIRE }).awaiting).toBe(
      false,
    );
    expect(
      missionFocus({ ...quiet, orderState: 'complete', orderAt: HOUSE }).awaiting,
    ).toBe(false);
    expect(missionFocus(quiet).awaiting).toBe(false);
  });

  it('hands back the car itself when there is nothing to point at', () => {
    expect(missionFocus(quiet).destination).toEqual(CAR);
    expect(
      missionFocus({ ...quiet, fireState: 'complete', fireAt: FIRE }).destination,
    ).toEqual(CAR);
  });

  it('prefers the fire when both missions somehow wait at once', () => {
    // They share a busy gate, so this cannot happen in play; pinning it anyway
    // keeps the hand deterministic if the gate is ever rewired.
    expect(
      missionFocus({
        fireState: 'spawned',
        fireAt: FIRE,
        orderState: 'spawned',
        orderAt: HOUSE,
        carPosition: CAR,
      }),
    ).toEqual({ awaiting: true, destination: FIRE });
  });

  it('falls through to the order when a mission has no lot to point at', () => {
    expect(
      missionFocus({
        fireState: 'spawned',
        fireAt: undefined,
        orderState: 'spawned',
        orderAt: HOUSE,
        carPosition: CAR,
      }),
    ).toEqual({ awaiting: true, destination: HOUSE });
  });
});
