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
  parkState: 'idle',
  parkAt: undefined,
  puppyPending: false,
  puppyState: 'idle',
  puppySpotAt: undefined,
  puppyOwnerAt: undefined,
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
        ...quiet,
        fireState: 'spawned',
        fireAt: FIRE,
        orderState: 'spawned',
        orderAt: HOUSE,
      }),
    ).toEqual({ awaiting: true, destination: FIRE });
  });

  it('falls through to the order when a mission has no lot to point at', () => {
    expect(
      missionFocus({
        ...quiet,
        fireState: 'spawned',
        fireAt: undefined,
        orderState: 'spawned',
        orderAt: HOUSE,
      }),
    ).toEqual({ awaiting: true, destination: HOUSE });
  });
});

describe('the four-way grow (FR12)', () => {
  const Litter = { x: 2, z: -1 };
  const Spot = { x: -1, z: -2 };
  const Owner = { x: 3, z: 3 };

  it('points at the litter while the park asks', () => {
    for (const parkState of ['spawned', 'responding'] as const) {
      expect(missionFocus({ ...quiet, parkState, parkAt: Litter })).toEqual({
        awaiting: true,
        destination: Litter,
      });
    }
    for (const parkState of ['collecting', 'complete'] as const) {
      expect(missionFocus({ ...quiet, parkState, parkAt: Litter }).awaiting).toBe(false);
    }
  });

  it('points at the siren button before the puppy is found', () => {
    // The button lives on the HUD, so there is no world point to trace to:
    // the hand gets the car itself plus the marker that says "demo the button".
    expect(missionFocus({ ...quiet, puppyPending: true })).toEqual({
      awaiting: true,
      destination: CAR,
      target: 'siren',
    });
  });

  it('points at the paw spot while the puppy is searching', () => {
    expect(
      missionFocus({ ...quiet, puppyState: 'searching', puppySpotAt: Spot }),
    ).toEqual({ awaiting: true, destination: Spot });
  });

  it('points at the owner house while the puppy is aboard', () => {
    expect(
      missionFocus({ ...quiet, puppyState: 'carrying', puppyOwnerAt: Owner }),
    ).toEqual({ awaiting: true, destination: Owner });
  });

  it('stays out of the way after the siren and after the delivery', () => {
    expect(
      missionFocus({ ...quiet, puppyState: 'idle', puppyPending: false }).awaiting,
    ).toBe(false);
    expect(
      missionFocus({ ...quiet, puppyState: 'complete', puppySpotAt: Spot }).awaiting,
    ).toBe(false);
    expect(
      missionFocus({ ...quiet, puppyState: 'searching', puppySpotAt: undefined })
        .awaiting,
    ).toBe(false);
  });

  it('resolves exactly one destination when every mission somehow waits', () => {
    // The busy gate makes overlaps impossible in play; pinning the chain keeps
    // the hand deterministic if the gate is ever rewired: fire → order → park →
    // puppy, in the order the missions landed in the game.
    expect(
      missionFocus({
        fireState: 'spawned',
        fireAt: FIRE,
        orderState: 'spawned',
        orderAt: HOUSE,
        parkState: 'spawned',
        parkAt: Litter,
        puppyPending: true,
        puppyState: 'searching',
        puppySpotAt: Spot,
        puppyOwnerAt: Owner,
        carPosition: CAR,
      }),
    ).toEqual({ awaiting: true, destination: FIRE });
    expect(
      missionFocus({
        ...quiet,
        parkState: 'spawned',
        parkAt: Litter,
        puppyPending: true,
      }),
    ).toEqual({ awaiting: true, destination: Litter });
  });
});
