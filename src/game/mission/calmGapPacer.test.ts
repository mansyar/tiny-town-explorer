import { describe, expect, it } from 'vitest';
import {
  CALM_MAX_SECONDS,
  CALM_MIN_SECONDS,
  type CalmGapPacerHouse,
  createCalmGapPacer,
  MIN_HOUSE_DISTANCE,
} from './calmGapPacer';

const fixedRandom =
  (value = 0) =>
  () =>
    value;

const HOUSES: readonly CalmGapPacerHouse[] = [
  { id: 'house-1', position: { x: 0, z: 0 } },
  { id: 'house-2', position: { x: 0.5, z: 0 } },
  { id: 'house-3', position: { x: 3, z: 0 } },
];

/** The factory under its shipped numbers, overridable per case. */
const pacer = (overrides: Partial<Parameters<typeof createCalmGapPacer>[0]> = {}) =>
  createCalmGapPacer({
    houses: HOUSES,
    maxSeconds: CALM_MAX_SECONDS,
    minDistance: MIN_HOUSE_DISTANCE,
    minSeconds: CALM_MIN_SECONDS,
    random: fixedRandom(0),
    ...overrides,
  });

/** Ticks until a house comes back, or gives up after `limit` seconds. */
function untilDue(unit: ReturnType<typeof pacer>, limit = 300) {
  let elapsed = 0;
  while (elapsed < limit) {
    const houseId = unit.update(1 / 60, false);
    elapsed += 1 / 60;
    if (houseId !== undefined) {
      return { houseId, elapsed };
    }
  }
  return { houseId: undefined, elapsed };
}

describe('the gap comes from the caller’s own numbers', () => {
  it('opens on the floor of whatever range it was handed', () => {
    expect(pacer({ minSeconds: 5, maxSeconds: 5 }).secondsUntilDue()).toBe(5);
    expect(
      pacer({
        maxSeconds: 10,
        minSeconds: 5,
        random: fixedRandom(0.5),
      }).secondsUntilDue(),
    ).toBe(7.5);
  });

  it('accepts an instant mission as a legitimate configuration', () => {
    const unit = pacer({ maxSeconds: 0, minSeconds: 0 });
    expect(untilDue(unit, 0.02).houseId).toBe('house-1');
  });

  it('re-rolls the caller’s range after every mission, not the shipped one', () => {
    const unit = pacer({ maxSeconds: 5, minSeconds: 5 });
    untilDue(unit);
    expect(unit.secondsUntilDue()).toBe(5);
  });
});

describe('picking a house without the clock', () => {
  it('hands back a house and remembers it, leaving the countdown alone', () => {
    const unit = pacer();
    const before = unit.secondsUntilDue();
    expect(unit.pickHouse()).toBe('house-1');
    expect(unit.lastHouseId()).toBe('house-1');
    expect(unit.secondsUntilDue()).toBe(before);
  });

  it('never hands back the house that just went', () => {
    const unit = pacer({ minDistance: 0 });
    expect(unit.pickHouse()).toBe('house-1');
    expect(unit.pickHouse()).toBe('house-2');
  });

  it('picks nothing in a town with no houses', () => {
    const unit = pacer({ houses: [] });
    expect(unit.pickHouse()).toBeUndefined();
    expect(unit.lastHouseId()).toBeUndefined();
  });
});

describe('the separation rule is the caller’s too', () => {
  it('can land next door when no distance is asked for', () => {
    const unit = pacer({
      maxSeconds: 0,
      minDistance: 0,
      minSeconds: 0,
      random: fixedRandom(0),
    });
    const first = untilDue(unit).houseId;
    const second = untilDue(unit).houseId;
    // With the distance rule switched off the pick is simply the next house in
    // the list - which, even then, is never the one that just went.
    expect(first).toBe('house-1');
    expect(second).toBe('house-2');
  });

  it('honours a distance wider than the town can satisfy', () => {
    // Nothing can be 100 units from the last house, so the fallback keeps the
    // town playing rather than silently refusing to ever pick again.
    const unit = pacer({ maxSeconds: 0, minDistance: 100, minSeconds: 0 });
    const first = untilDue(unit).houseId;
    const second = untilDue(unit).houseId;
    expect(first).toBe('house-1');
    expect(second).toBe('house-2');
  });

  it('picks from the far houses when the distance rule can be met', () => {
    const unit = pacer({ maxSeconds: 0, minSeconds: 0 });
    const first = untilDue(unit).houseId;
    const second = untilDue(unit).houseId;
    const from = HOUSES.find((house) => house.id === first);
    const to = HOUSES.find((house) => house.id === second);
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    expect(
      Math.hypot((to?.position.x ?? 0) - (from?.position.x ?? 0), to?.position.z ?? 0),
    ).toBeGreaterThanOrEqual(MIN_HOUSE_DISTANCE);
  });

  it('takes no missions at all in a town with no houses', () => {
    const unit = pacer({ houses: [], maxSeconds: 0, minSeconds: 0 });
    expect(untilDue(unit, 400).houseId).toBeUndefined();
    expect(unit.lastHouseId()).toBeUndefined();
  });
});

describe('the shared clock', () => {
  it('holds the mission back while the town is busy, and resets a quiet town', () => {
    const unit = pacer({ maxSeconds: 5, minSeconds: 5 });
    for (let frame = 0; frame < 600; frame += 1) {
      expect(unit.update(1 / 60, true)).toBeUndefined();
    }
    expect(unit.secondsUntilDue()).toBe(5);
    expect(untilDue(unit, 0.001).houseId).toBeUndefined();
    expect(untilDue(unit).houseId).toBe('house-1');
  });

  it('never counts a negative frame as time passing', () => {
    const unit = pacer({ maxSeconds: 5, minSeconds: 5 });
    unit.update(-100, false);
    expect(unit.secondsUntilDue()).toBe(5);
  });

  it('remembers which house went, whoever the caller is', () => {
    const unit = pacer({ maxSeconds: 0, minSeconds: 0 });
    expect(unit.lastHouseId()).toBeUndefined();
    const { houseId } = untilDue(unit);
    expect(unit.lastHouseId()).toBe(houseId);
  });
});
