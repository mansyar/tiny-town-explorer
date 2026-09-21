import { describe, expect, it } from 'vitest';
import {
  COMPLETE_LINGER_SECONDS,
  createIceCreamMission,
  SERVE_RANGE,
} from './iceCreamMission';

/** Runs the clock in one-second frames, the way the render loop would. */
function tick(
  mission: ReturnType<typeof createIceCreamMission>,
  seconds: number,
  distance: number,
): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    mission.update(1 / 60, distance);
  }
}

/** Spawns an order and answers it, leaving serve armed. */
function atTheHouse(): ReturnType<typeof createIceCreamMission> {
  const mission = createIceCreamMission();
  mission.spawn('house-4');
  mission.respond();
  mission.update(1 / 60, SERVE_RANGE - 0.1);
  return mission;
}

describe('the ice-cream order states', () => {
  it('starts idle with no order', () => {
    const mission = createIceCreamMission();
    expect(mission.snapshot().state).toBe('idle');
    expect(mission.snapshot().orderHouseId).toBeUndefined();
  });

  it('walks idle → spawned → driving → active → complete → idle', () => {
    const mission = createIceCreamMission();
    expect(mission.snapshot().state).toBe('idle');

    mission.spawn('house-2');
    expect(mission.snapshot().state).toBe('spawned');

    mission.respond();
    expect(mission.snapshot().state).toBe('driving');

    tick(mission, 0.5, SERVE_RANGE + 1);
    expect(mission.snapshot().state).toBe('driving');

    tick(mission, 0.5, SERVE_RANGE - 0.2);
    expect(mission.snapshot().state).toBe('active');

    expect(mission.serve()).toBe(true);
    expect(mission.snapshot().state).toBe('complete');

    tick(mission, COMPLETE_LINGER_SECONDS + 0.5, 99);
    expect(mission.snapshot().state).toBe('idle');
    expect(mission.snapshot().orderHouseId).toBeUndefined();
  });
});

describe('illegal transitions', () => {
  it('will not take a second order while one is open', () => {
    const mission = createIceCreamMission();
    mission.spawn('house-4');
    expect(mission.spawn('house-6')).toBe(false);
    expect(mission.snapshot().orderHouseId).toBe('house-4');
  });

  it('ignores a response when nothing is ordered', () => {
    const mission = createIceCreamMission();
    expect(mission.respond()).toBe(false);
    expect(mission.snapshot().state).toBe('idle');
  });

  it('never serves before serve is armed', () => {
    const mission = createIceCreamMission();
    mission.spawn('house-4');
    expect(mission.serve()).toBe(false);
    mission.respond();
    expect(mission.serve()).toBe(false);
    expect(mission.snapshot().state).toBe('driving');
  });

  it('ignores a serve after the order is filled', () => {
    const mission = atTheHouse();
    expect(mission.serve()).toBe(true);
    expect(mission.snapshot().state).toBe('complete');
    expect(mission.serve()).toBe(false);
  });
});

describe('arming and disarming serve', () => {
  it('arms only when the mission is active and the car is close', () => {
    const mission = atTheHouse();
    expect(mission.isServeReady(SERVE_RANGE - 0.1)).toBe(true);
    expect(mission.isServeReady(SERVE_RANGE + 0.1)).toBe(false);
  });

  it('disarms when the car drives away, and re-arms on return', () => {
    const mission = atTheHouse();
    tick(mission, 0.3, SERVE_RANGE + 1.5);
    expect(mission.snapshot().state).toBe('driving');
    expect(mission.isServeReady(SERVE_RANGE + 1.5)).toBe(false);
    expect(mission.serve()).toBe(false);

    tick(mission, 0.3, SERVE_RANGE - 0.1);
    expect(mission.snapshot().state).toBe('active');
    expect(mission.serve()).toBe(true);
  });
});
