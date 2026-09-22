import { describe, expect, it } from 'vitest';
import {
  CALM_MAX_SECONDS,
  CALM_MIN_SECONDS,
  createIceCreamPacer,
  type IceCreamPacerHouse,
  MIN_ORDER_DISTANCE,
} from './iceCreamPacer';

const fixedRandom =
  (value = 0) =>
  () =>
    value;

/** The ten real lots, in the same shape `townMap` publishes them. */
const HOUSES: readonly IceCreamPacerHouse[] = [
  { id: 'house-1', position: { x: -1.5, z: -0.5 } },
  { id: 'house-2', position: { x: -0.5, z: -0.5 } },
  { id: 'house-3', position: { x: -1.5, z: 0.5 } },
  { id: 'house-4', position: { x: -0.5, z: 0.5 } },
  { id: 'house-5', position: { x: -1.5, z: 1.5 } },
  { id: 'house-6', position: { x: -0.5, z: 1.5 } },
  { id: 'house-7', position: { x: 1.5, z: -1.5 } },
  { id: 'house-8', position: { x: 1.5, z: -0.5 } },
  { id: 'house-9', position: { x: 1.5, z: 0.5 } },
  { id: 'house-10', position: { x: 1.5, z: 1.5 } },
];

const pacer = (random = fixedRandom(0), houses = HOUSES) =>
  createIceCreamPacer({ houses, random });

/** Ticks until `update` returns a house, or gives up after `limit` seconds. */
function untilOrder(
  unit: ReturnType<typeof pacer>,
  limit = 300,
): { houseId: string | undefined; elapsed: number } {
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

describe('picking a house without the clock', () => {
  it('hands back a house on demand and leaves the calm gap alone', () => {
    const unit = pacer();
    const before = unit.secondsUntilOrder();
    expect(unit.pickHouse()).toBe('house-1');
    expect(unit.lastHouseId()).toBe('house-1');
    expect(unit.secondsUntilOrder()).toBe(before);
  });

  it('still avoids the house that just went', () => {
    const unit = pacer(fixedRandom(0));
    const first = unit.pickHouse();
    const second = unit.pickHouse();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });
});

describe('the calm gap', () => {
  it('starts somewhere inside sixty and ninety seconds', () => {
    expect(pacer(fixedRandom(0)).secondsUntilOrder()).toBe(CALM_MIN_SECONDS);
    expect(pacer(fixedRandom(0.999)).secondsUntilOrder()).toBeLessThan(CALM_MAX_SECONDS);
    expect(pacer(fixedRandom(0.5)).secondsUntilOrder()).toBeGreaterThan(CALM_MIN_SECONDS);
    expect(pacer(fixedRandom(0.5)).secondsUntilOrder()).toBeLessThan(CALM_MAX_SECONDS);
  });

  it('counts down only while no order is open', () => {
    const unit = pacer();
    unit.update(5, true);
    expect(unit.secondsUntilOrder()).toBe(CALM_MIN_SECONDS);

    unit.update(5, false);
    expect(unit.secondsUntilOrder()).toBe(CALM_MIN_SECONDS - 5);
  });

  it('holds the order back however long a mission runs', () => {
    const unit = pacer();
    const early = untilOrder(unit, 0.0001);
    expect(early.houseId).toBeUndefined();

    // A whole mission's worth of time with the town busy.
    for (let frame = 0; frame < 600; frame += 1) {
      expect(unit.update(1 / 60, true)).toBeUndefined();
    }
    // It only becomes due once the kid is free again.
    expect(untilOrder(unit, 0.0001).houseId).toBeUndefined();
    expect(untilOrder(unit).houseId).toBeDefined();
  });

  it('never counts a negative frame as time passing', () => {
    const unit = pacer();
    unit.update(-10, false);
    expect(unit.secondsUntilOrder()).toBe(CALM_MIN_SECONDS);
  });

  it('waits a fresh gap after each order', () => {
    const unit = pacer();
    const first = untilOrder(unit);
    expect(first.houseId).toBeDefined();
    expect(unit.secondsUntilOrder()).toBeGreaterThanOrEqual(CALM_MIN_SECONDS);
    expect(unit.secondsUntilOrder()).toBeLessThan(CALM_MAX_SECONDS);
  });
});

describe('choosing the house', () => {
  it('takes the first order at one of the town’s houses', () => {
    const { houseId } = untilOrder(pacer());
    expect(HOUSES.map((house) => house.id)).toContain(houseId);
    expect(pacer().lastHouseId()).toBeUndefined();
  });

  it('keeps every later order at least two houses from the last', () => {
    const unit = pacer(fixedRandom(0.37));
    let previous = untilOrder(unit).houseId;

    for (let order = 0; order < 30; order += 1) {
      const { houseId } = untilOrder(unit);
      expect(houseId).toBeDefined();
      if (houseId === undefined || previous === undefined) {
        return;
      }
      const from = HOUSES.find((house) => house.id === previous);
      const to = HOUSES.find((house) => house.id === houseId);
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      if (from === undefined || to === undefined) {
        return;
      }
      const gap = Math.hypot(
        to.position.x - from.position.x,
        to.position.z - from.position.z,
      );
      expect(gap).toBeGreaterThanOrEqual(MIN_ORDER_DISTANCE);
      previous = houseId;
    }
  });

  it('records where the order was, so the next one can avoid it', () => {
    const unit = pacer(fixedRandom(0.2));
    const { houseId } = untilOrder(unit);
    expect(unit.lastHouseId()).toBe(houseId);
  });

  it('serves the only house in a one-house town', () => {
    const only: readonly IceCreamPacerHouse[] = [
      { id: 'house-1', position: { x: 0, z: 0 } },
    ];
    const unit = pacer(fixedRandom(0.9), only);
    expect(untilOrder(unit).houseId).toBe('house-1');
    expect(untilOrder(unit).houseId).toBe('house-1');
  });

  it('lets a two-house town take turns rather than repeating itself', () => {
    const pair: readonly IceCreamPacerHouse[] = [
      { id: 'house-1', position: { x: 0, z: 0 } },
      { id: 'house-2', position: { x: 0.5, z: 0 } },
    ];
    const unit = pacer(fixedRandom(0.99), pair);
    const first = untilOrder(unit).houseId;
    const second = untilOrder(unit).houseId;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });

  it('takes no orders at all in a town with no houses', () => {
    const unit = pacer(fixedRandom(0), []);
    expect(untilOrder(unit, 400).houseId).toBeUndefined();
    expect(unit.lastHouseId()).toBeUndefined();
  });
});
