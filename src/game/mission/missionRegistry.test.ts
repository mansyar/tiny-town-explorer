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

  it('lets a town-wide resolver answer focus, marker and all', () => {
    const registry = createMissionRegistry(
      [{ id: 'fire' }, { id: 'iceCream' }],
      // FR12: `missionFocus` is *the* resolver — one four-mission answer,
      // including the HUD siren target.
      () => ({ awaiting: true, destination: { x: 9, z: 9 }, target: 'siren' }),
    );

    expect(registry.focus({ x: 0, z: 0 })).toEqual({
      awaiting: true,
      destination: { x: 9, z: 9 },
      target: 'siren',
    });
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

  it('accepts an empty registry without throwing', async () => {
    const registry = createMissionRegistry([]);
    expect(() => registry.tick(1)).not.toThrow();
    expect(await registry.tap({ x: 0, z: 0 })).toBe(false);
    expect(registry.focus({ x: 0, z: 0 })).toEqual({
      awaiting: false,
      destination: { x: 0, z: 0 },
    });
    expect(registry.isBusy()).toBe(false);
  });
});
