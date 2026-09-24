import { describe, expect, it } from 'vitest';
import {
  BURSTS_MAX,
  BURSTS_MIN,
  COMPLETE_LINGER_SECONDS,
  createFireMission,
  fireAwaitsKid,
  HOSE_RANGE,
} from './fireMission';

/** A fire mission whose burst count is fixed, so assertions do not roll dice. */
function fixedRandom(value = 0): () => number {
  return () => value;
}

/** Runs the clock in one-second frames, the way the render loop would. */
function tick(
  mission: ReturnType<typeof createFireMission>,
  seconds: number,
  distance: number,
): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    mission.update(1 / 60, distance);
  }
}

/** Spawns a fire and answers it, leaving the hose armed. */
function atTheFire(): ReturnType<typeof createFireMission> {
  const mission = createFireMission({ random: fixedRandom(0) });
  mission.spawn('house-4');
  mission.respond();
  mission.update(1 / 60, HOSE_RANGE - 0.1);
  return mission;
}

describe('the mission states', () => {
  it('starts idle with nothing burning', () => {
    const mission = createFireMission({ random: fixedRandom() });
    expect(mission.snapshot().state).toBe('idle');
    expect(mission.snapshot().fireHouseId).toBeUndefined();
    expect(mission.snapshot().burstsLeft).toBe(0);
  });

  it('spawns a fire with a burst count between the bounds', () => {
    for (const roll of [0, 0.999]) {
      const mission = createFireMission({ random: fixedRandom(roll) });
      expect(mission.spawn('house-4')).toBe(true);
      const { state, fireHouseId, burstsLeft } = mission.snapshot();
      expect(state).toBe('spawned');
      expect(fireHouseId).toBe('house-4');
      expect(burstsLeft).toBeGreaterThanOrEqual(BURSTS_MIN);
      expect(burstsLeft).toBeLessThanOrEqual(BURSTS_MAX);
    }
  });

  it('walks idle → spawned → driving → active → complete → idle', () => {
    const mission = createFireMission({ random: fixedRandom(0) });
    expect(mission.snapshot().state).toBe('idle');

    mission.spawn('house-2');
    expect(mission.snapshot().state).toBe('spawned');

    mission.respond();
    expect(mission.snapshot().state).toBe('driving');

    tick(mission, 0.5, HOSE_RANGE + 1);
    expect(mission.snapshot().state).toBe('driving');

    tick(mission, 0.5, HOSE_RANGE - 0.2);
    expect(mission.snapshot().state).toBe('active');

    for (let burst = 0; burst < BURSTS_MIN; burst += 1) {
      mission.spray();
    }
    expect(mission.snapshot().state).toBe('complete');

    tick(mission, COMPLETE_LINGER_SECONDS + 0.5, 99);
    expect(mission.snapshot().state).toBe('idle');
    expect(mission.snapshot().fireHouseId).toBeUndefined();
  });
});

describe('illegal transitions', () => {
  it('will not light a second fire while one is burning', () => {
    const mission = createFireMission({ random: fixedRandom(0) });
    mission.spawn('house-4');
    expect(mission.spawn('house-6')).toBe(false);
    expect(mission.snapshot().fireHouseId).toBe('house-4');
  });

  it('ignores a response when nothing is burning', () => {
    const mission = createFireMission({ random: fixedRandom() });
    expect(mission.respond()).toBe(false);
    expect(mission.snapshot().state).toBe('idle');
  });

  it('ignores a second response while already driving', () => {
    const mission = createFireMission({ random: fixedRandom() });
    mission.spawn('house-4');
    expect(mission.respond()).toBe(true);
    expect(mission.respond()).toBe(false);
  });

  it('never sprays before the hose is armed', () => {
    const mission = createFireMission({ random: fixedRandom() });
    mission.spawn('house-4');
    expect(mission.spray()).toBe(false);
    mission.respond();
    expect(mission.spray()).toBe(false);
    expect(mission.snapshot().state).toBe('driving');
  });

  it('ignores a spray after the fire is out', () => {
    const mission = atTheFire();
    for (let burst = 0; burst < BURSTS_MIN; burst += 1) {
      mission.spray();
    }
    expect(mission.snapshot().state).toBe('complete');
    expect(mission.spray()).toBe(false);
  });
});

describe('arming and disarming the hose', () => {
  it('arms only when the mission is active and the car is close', () => {
    const mission = atTheFire();
    expect(mission.isHoseReady(HOSE_RANGE - 0.1)).toBe(true);
    expect(mission.isHoseReady(HOSE_RANGE + 0.1)).toBe(false);
  });

  it('disarms when the car drives away, and re-arms on return', () => {
    const mission = atTheFire();
    tick(mission, 0.3, HOSE_RANGE + 1.5);
    expect(mission.snapshot().state).toBe('driving');
    expect(mission.isHoseReady(HOSE_RANGE + 1.5)).toBe(false);
    expect(mission.spray()).toBe(false);

    tick(mission, 0.3, HOSE_RANGE - 0.1);
    expect(mission.snapshot().state).toBe('active');
    expect(mission.spray()).toBe(true);
  });
});

describe('putting the fire out', () => {
  it('counts each burst down and extinguishes on the last one', () => {
    const mission = atTheFire();
    const started = mission.snapshot().burstsLeft;
    let extinguishingBurst = 0;

    for (let burst = 1; burst <= started; burst += 1) {
      expect(mission.spray()).toBe(true);
      const left = mission.snapshot().burstsLeft;
      if (left === 0) {
        extinguishingBurst = burst;
      } else {
        expect(left).toBe(started - burst);
        expect(mission.snapshot().state).toBe('active');
      }
    }

    expect(extinguishingBurst).toBe(started);
    expect(mission.snapshot().state).toBe('complete');
  });

  it('picks the burst count from the injected roll', () => {
    const low = createFireMission({ random: fixedRandom(0) });
    low.spawn('house-1');
    const high = createFireMission({ random: fixedRandom(0.999) });
    high.spawn('house-1');
    expect(low.snapshot().burstsLeft).toBe(BURSTS_MIN);
    expect(high.snapshot().burstsLeft).toBe(BURSTS_MAX);
  });

  it('lets the car keep driving the moment the fire is out', () => {
    const mission = atTheFire();
    for (let burst = 0; burst < BURSTS_MIN; burst += 1) {
      mission.spray();
    }
    // The resolution window is decoration, not a lock: the car is not parked.
    tick(mission, 0.2, 5);
    expect(mission.snapshot().state).toBe('complete');
    expect(mission.isHoseReady(0)).toBe(false);
  });
});

describe('waiting on the kid', () => {
  it('holds from the moment the fire is lit until the car arrives', () => {
    const mission = createFireMission();
    expect(fireAwaitsKid(mission.snapshot().state)).toBe(false);

    mission.spawn('house-1');
    expect(fireAwaitsKid(mission.snapshot().state)).toBe(true);

    mission.respond();
    mission.update(1 / 60, 99);
    expect(fireAwaitsKid(mission.snapshot().state)).toBe(true);

    mission.update(1 / 60, HOSE_RANGE - 0.1);
    expect(fireAwaitsKid(mission.snapshot().state)).toBe(false);
  });

  it('lets go while the fire celebrates, and again once the town is idle', () => {
    const mission = createFireMission({ random: fixedRandom(0) });
    mission.spawn('house-1');
    mission.respond();
    mission.update(1 / 60, 0);
    for (let burst = 0; burst < BURSTS_MIN; burst += 1) {
      mission.spray();
    }
    expect(fireAwaitsKid(mission.snapshot().state)).toBe(false);

    tick(mission, COMPLETE_LINGER_SECONDS + 0.5, 0);
    expect(fireAwaitsKid(mission.snapshot().state)).toBe(false);
  });
});
