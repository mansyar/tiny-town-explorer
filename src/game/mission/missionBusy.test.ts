import { describe, expect, it } from 'vitest';
import { createIceCreamMission } from './iceCreamMission';
import { isTownBusy } from './missionBusy';
import { createMissionManager } from './missionManager';

/** A fire mission parked in `driving`: spawned, responded, far away. */
function drivingFire() {
  const fire = createMissionManager();
  fire.spawn('house-1');
  fire.respond();
  fire.update(1 / 60, 99);
  return fire;
}

/** An ice-cream mission parked in `driving`: same three calls. */
function drivingIceCream() {
  const iceCream = createIceCreamMission();
  iceCream.spawn('house-2');
  iceCream.respond();
  iceCream.update(1 / 60, 99);
  return iceCream;
}

describe('the shared busy gate', () => {
  it('calls a quiet town free: both pacers may count down', () => {
    const fire = createMissionManager();
    const iceCream = createIceCreamMission();
    expect(isTownBusy(fire.snapshot(), iceCream.snapshot())).toBe(false);
  });

  it('goes busy the moment a fire spawns, through every state until it lingers out', () => {
    const fire = createMissionManager();
    const iceCream = createIceCreamMission();

    fire.spawn('house-1');
    expect(isTownBusy(fire.snapshot(), iceCream.snapshot())).toBe(true);

    fire.respond();
    fire.update(1 / 60, 99);
    expect(fire.snapshot().state).toBe('driving');
    expect(isTownBusy(fire.snapshot(), iceCream.snapshot())).toBe(true);

    fire.update(1 / 60, 0);
    expect(fire.snapshot().state).toBe('active');
    expect(isTownBusy(fire.snapshot(), iceCream.snapshot())).toBe(true);
  });

  it('goes busy the moment an order opens, even before the truck moves', () => {
    const fire = createMissionManager();
    const iceCream = createIceCreamMission();

    iceCream.spawn('house-2');
    expect(isTownBusy(fire.snapshot(), iceCream.snapshot())).toBe(true);
  });

  it('stays busy while both missions run at once, so neither pacer fires', () => {
    const fire = drivingFire();
    const iceCream = drivingIceCream();
    expect(isTownBusy(fire.snapshot(), iceCream.snapshot())).toBe(true);
  });

  it('frees the town again once each mission lingers back to idle', () => {
    const fire = drivingFire();
    const iceCream = drivingIceCream();

    // Finish the fire: arrive, spray every burst, outlast the linger.
    fire.update(1 / 60, 0);
    while (fire.snapshot().state === 'active') {
      fire.spray();
    }
    fire.update(10, 0);
    expect(fire.snapshot().state).toBe('idle');
    // The open order still holds the gate.
    expect(isTownBusy(fire.snapshot(), iceCream.snapshot())).toBe(true);

    // Serve the cone and outlast its linger; the town is quiet again.
    iceCream.update(1 / 60, 0);
    iceCream.serve();
    iceCream.update(10, 0);
    expect(iceCream.snapshot().state).toBe('idle');
    expect(isTownBusy(fire.snapshot(), iceCream.snapshot())).toBe(false);
  });
});
