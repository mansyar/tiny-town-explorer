import { describe, expect, it } from 'vitest';
import { createMissionRegistry, type MissionContribution } from './missionRegistry';

/** A mission with nothing to contribute — every hook is optional. */
function silentMission(): MissionContribution {
  return {};
}

describe('the mission registry contract', () => {
  it('forwards tick to every registered mission in registration order', () => {
    const order: string[] = [];
    const registry = createMissionRegistry([
      { id: 'fire', tick: () => order.push('fire') },
      { id: 'iceCream', tick: () => order.push('iceCream') },
    ]);

    registry.tick(0.016);
    expect(order).toEqual(['fire', 'iceCream']);
  });

  it('keeps a stable pass order across frames', () => {
    const order: string[] = [];
    const registry = createMissionRegistry([
      { id: 'fire', tick: () => order.push('fire') },
      { id: 'iceCream', tick: () => order.push('iceCream') },
      { id: 'park', tick: () => order.push('park') },
    ]);

    registry.tick(1);
    registry.tick(1);
    expect(order).toEqual(['fire', 'iceCream', 'park', 'fire', 'iceCream', 'park']);
  });

  it('skips a mission with nothing to do without breaking the pass', () => {
    const order: string[] = [];
    const registry = createMissionRegistry([
      { id: 'fire', tick: () => order.push('fire') },
      { id: 'iceCream', ...silentMission() },
      { id: 'park', tick: () => order.push('park') },
    ]);

    expect(() => registry.tick(1)).not.toThrow();
    expect(order).toEqual(['fire', 'park']);
  });

  it('offers taps to missions until one answers', async () => {
    const handled: string[] = [];
    const registry = createMissionRegistry([
      {
        id: 'fire',
        tap: (aim) => {
          handled.push('fire');
          return aim.x > 10;
        },
      },
      {
        id: 'iceCream',
        tap: (aim) => {
          handled.push('iceCream');
          return aim.z > 10;
        },
      },
      {
        id: 'park',
        tap: () => {
          handled.push('park');
          return false;
        },
      },
    ]);

    // First mission claims it: the later ones never see the tap.
    expect(await registry.tap({ x: 99, z: 0 })).toBe(true);
    expect(handled).toEqual(['fire']);

    // Falls through to the second.
    handled.length = 0;
    expect(await registry.tap({ x: 0, z: 99 })).toBe(true);
    expect(handled).toEqual(['fire', 'iceCream']);

    // Nobody wants it.
    handled.length = 0;
    expect(await registry.tap({ x: 0, z: 0 })).toBe(false);
    expect(handled).toEqual(['fire', 'iceCream', 'park']);
  });

  it('resolves exactly one focus destination', () => {
    const registry = createMissionRegistry([
      { id: 'fire', focus: () => ({ awaiting: false, destination: { x: 1, z: 1 } }) },
      { id: 'iceCream', focus: () => ({ awaiting: true, destination: { x: 2, z: 2 } }) },
      { id: 'park', focus: () => ({ awaiting: true, destination: { x: 3, z: 3 } }) },
    ]);

    const focus = registry.focus({ x: 0, z: 0 });
    // First awaiting mission wins; one destination, never a merge.
    expect(focus).toEqual({ awaiting: true, destination: { x: 2, z: 2 } });
  });

  it('falls back to the car when no mission is awaiting', () => {
    const car = { x: -4, z: 7 };
    const registry = createMissionRegistry([
      { id: 'fire', focus: () => ({ awaiting: false, destination: { x: 1, z: 1 } }) },
      { id: 'iceCream', ...silentMission() },
    ]);

    expect(registry.focus(car)).toEqual({ awaiting: false, destination: car });
  });

  it('passes the car position into each focus contribution', () => {
    const seen: Array<{ x: number; z: number }> = [];
    const car = { x: 2, z: -5 };
    const registry = createMissionRegistry([
      {
        id: 'fire',
        focus: (at) => {
          seen.push(at);
          return { awaiting: false, destination: at };
        },
      },
      {
        id: 'iceCream',
        focus: (at) => {
          seen.push(at);
          return { awaiting: false, destination: at };
        },
      },
    ]);

    registry.focus(car);
    expect(seen).toEqual([car, car]);
  });

  it('reports the town busy unless every mission is idle', () => {
    const registry = createMissionRegistry([
      { id: 'fire', isIdle: () => true },
      { id: 'iceCream', isIdle: () => true },
      { id: 'park', isIdle: () => true },
    ]);
    expect(registry.isBusy()).toBe(false);

    const busy = createMissionRegistry([
      { id: 'fire', isIdle: () => false },
      { id: 'iceCream', isIdle: () => true },
      { id: 'park', isIdle: () => true },
    ]);
    expect(busy.isBusy()).toBe(true);
  });

  it('runs at most one mission spawn per busy-gated pass', () => {
    const spawned: string[] = [];
    const accept = (id: string) => () => {
      spawned.push(id);
      return true;
    };
    const registry = createMissionRegistry([
      { id: 'fire', trySpawn: accept('fire') },
      { id: 'iceCream', trySpawn: accept('iceCream') },
      { id: 'park', trySpawn: accept('park') },
    ]);

    const started = registry.spawnOne();
    expect(started).toBe(true);
    expect(spawned).toEqual(['fire']);
  });

  it('tries the next mission when the first refuses to spawn', () => {
    const spawned: string[] = [];
    const accept = (id: string) => () => {
      spawned.push(id);
      return true;
    };
    const registry = createMissionRegistry([
      { id: 'fire', trySpawn: () => false },
      { id: 'iceCream', trySpawn: accept('iceCream') },
      { id: 'park', trySpawn: accept('park') },
    ]);

    expect(registry.spawnOne()).toBe(true);
    expect(spawned).toEqual(['iceCream']);
  });

  it('reports no spawn when every mission refuses', () => {
    const registry = createMissionRegistry([
      { id: 'fire', trySpawn: () => false },
      { id: 'iceCream', trySpawn: () => false },
    ]);
    expect(registry.spawnOne()).toBe(false);
  });

  it('accepts an empty registry without throwing', async () => {
    const registry = createMissionRegistry([]);
    expect(() => registry.tick(1)).not.toThrow();
    expect(await registry.tap({ x: 0, z: 0 })).toBe(false);
    expect(registry.focus({ x: 0, z: 0 })).toEqual({
      awaiting: false,
      destination: { x: 0, z: 0 },
    });
    expect(registry.isBusy()).toBe(false);
    expect(registry.spawnOne()).toBe(false);
  });
});
