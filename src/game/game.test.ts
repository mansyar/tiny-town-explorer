import { describe, expect, it, vi } from 'vitest';
import { createGame, type GameDeps } from './game';
import { mountParkedShadows } from './town/parkedShadows';
import { createTownGrid } from './town/townGrid';
import { mountTrafficShadows } from './traffic/trafficShadows';

// The async model pipeline never runs in unit tests: the town, the traffic
// actors and the car actor resolve from fakes while everything else stays
// real. That is the whole point of the seam — `game.ts` owns the world, the
// test owns the loading.
vi.mock('./assets/modelLibrary', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createModelLibrary: vi.fn(() => ({})),
}));
vi.mock('./town/townRenderer', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  mountTown: vi.fn(async () => ({
    group: { add: vi.fn() },
    houseFootprints: new Map(),
    dispose: vi.fn(),
  })),
}));
vi.mock('./traffic/trafficActors', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  mountTrafficActors: vi.fn(async () => ({ objects: [{}], sync: vi.fn() })),
}));
vi.mock('./vehicle/vehicleActor', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createVehicleActor: vi.fn(async () => ({ object: {}, sync: vi.fn() })),
}));
vi.mock('./town/parkedShadows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./town/parkedShadows')>();
  return { ...actual, mountParkedShadows: vi.fn(actual.mountParkedShadows) };
});
vi.mock('./traffic/trafficShadows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./traffic/trafficShadows')>();
  return { ...actual, mountTrafficShadows: vi.fn(actual.mountTrafficShadows) };
});

/**
 * Wraps a port fake so any member outside the declared set throws. The narrow
 * interfaces (`GameAudio`/`GameHud`/`GameScene`/`GameCamera`) are a promise
 * about what the controller touches; the proxy turns that promise into a
 * failure the moment the controller reaches further.
 */
function strict<T extends object>(members: T, name: string): T {
  return new Proxy(members, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop in target) {
        return (target as Record<PropertyKey, unknown>)[prop];
      }
      throw new Error(`${name} port: unexpected member ${String(prop)}`);
    },
  });
}

function deps(): GameDeps {
  return {
    audio: strict(
      {
        play: vi.fn(),
        playAbility: vi.fn(),
        honk: vi.fn(),
        sploosh: vi.fn(),
        setEngine: vi.fn(),
      },
      'audio',
    ),
    hud: strict({ setAbilityBusy: vi.fn() }, 'hud'),
    scene: strict({ add: vi.fn(), remove: vi.fn() }, 'scene'),
    camera: strict({ facing: { quaternion: { x: 0, y: 0, z: 0, w: 1 } } }, 'camera'),
    grid: createTownGrid(),
  };
}

describe('createGame controller seam (Phase 2)', () => {
  it('returns a usable game synchronously, mounting the world in the background', () => {
    const game = createGame(deps());

    expect(typeof game.advance).toBe('function');
    expect(game.world).toBeDefined();
    expect(game.ready).toBeInstanceOf(Promise);
    // The spawn is grid data, so it is known before a single model loads.
    expect(game.world.spawn).toEqual(createTownGrid().spawnPoints[0]);
    // The mount pipeline has not resolved yet: the motor, the actor and the
    // traffic only exist once the models land.
    expect(game.world.motor).toBeUndefined();
    expect(game.world.actor).toBeUndefined();
    expect(game.world.traffic).toBeUndefined();

    return game.ready;
  });

  it('holds the pre-mount guards: advance() is safe before mounting resolves', () => {
    const game = createGame(deps());

    expect(() => {
      game.advance(0.016);
      game.advance(0);
    }).not.toThrow();

    return game.ready.then(() => {
      expect(game.world.motor).toBeDefined();
      expect(game.world.actor).toBeDefined();
      expect(game.world.traffic).toBeDefined();
      expect(() => game.advance(0.016)).not.toThrow();
    });
  });

  it('ticks the mounted systems once they land', async () => {
    const game = createGame(deps());
    await game.ready;

    const traffic = game.world.traffic;
    const actor = game.world.actor;
    const motor = game.world.motor;
    const ducks = game.world.pondDucks;
    if (
      traffic === undefined ||
      actor === undefined ||
      motor === undefined ||
      ducks === undefined
    ) {
      throw new Error('The mount did not land before the frame ran');
    }
    const onTrafficUpdate = vi.spyOn(traffic, 'update');
    const onActorSync = vi.spyOn(actor, 'sync');
    const onMotorUpdate = vi.spyOn(motor, 'update');
    const onDucksUpdate = vi.spyOn(ducks, 'update');

    game.advance(0.016);

    expect(onTrafficUpdate).toHaveBeenCalledWith(0.016);
    expect(onActorSync).toHaveBeenCalledTimes(1);
    expect(onMotorUpdate).toHaveBeenCalledWith(0.016);
    expect(onDucksUpdate).toHaveBeenCalledWith(0.016);
  });

  it('mirrors the HUD ability-busy edge off the fleet burst', async () => {
    const attached = deps();
    const game = createGame(attached);
    await game.ready;
    const setBusy = attached.hud.setAbilityBusy as ReturnType<typeof vi.fn>;

    // The fire truck's cast arms a burst, so the button dims on the next frame.
    expect(game.world.fleet.requestAbility().length).toBeGreaterThan(0);
    game.advance(0.016);
    expect(setBusy).toHaveBeenCalledWith(true);

    // The burst clock runs out and the button lights back up.
    game.world.fleet.update(2);
    game.advance(0.016);
    expect(setBusy).toHaveBeenCalledWith(false);
  });

  it('uses the scene port for add/remove and nothing else', async () => {
    const attached = deps();
    const game = createGame(attached);
    game.advance(0.016);
    await game.ready;
    game.advance(0.016);

    // Any access outside add/remove would have thrown through the proxy.
    const add = attached.scene.add as ReturnType<typeof vi.fn>;
    expect(add).toHaveBeenCalled();
    expect(Object.keys(attached.scene).sort()).toEqual(['add', 'remove']);
  });

  it('declares only the members the controller calls on every port (AC2)', async () => {
    const attached = deps();
    const game = createGame(attached);
    game.advance(0.016);
    await game.ready;
    game.advance(0.016);

    // The proxy already enforced these sets at runtime; pinning the keys here
    // keeps the test honest if a member is ever added to a fake.
    expect(Object.keys(attached.audio).sort()).toEqual([
      'honk',
      'play',
      'playAbility',
      'setEngine',
      'sploosh',
    ]);
    expect(Object.keys(attached.hud)).toEqual(['setAbilityBusy']);
    expect(Object.keys(attached.camera)).toEqual(['facing']);
  });

  it('fires every mission celebration through the shared deps', async () => {
    const attached = deps();
    const game = createGame(attached);
    await game.ready;
    const play = attached.audio.play as ReturnType<typeof vi.fn>;
    const site = { x: 1, z: 2 };

    game.world.fireCelebration.fire(site);
    game.world.orderCelebration.fire(site);
    game.world.parkCelebration.fire(site);
    game.world.puppyCelebration.fire(site);

    // The four recipes between them cover every play branch — sun, cheer,
    // drop, and the burst fallback for confetti/cones — plus the sparkle.
    expect(play).toHaveBeenCalledWith('cheer');
    expect(play).toHaveBeenCalledWith('drop');
    expect(game.world.fireCelebration.isArmed()).toBe(false);

    game.world.fireCelebration.rearm();
    expect(game.world.fireCelebration.isArmed()).toBe(true);
  });

  it('reads the wanderer feed on every motor sweep', async () => {
    const attached = deps();
    const game = createGame(attached);
    await game.ready;
    const traffic = game.world.traffic;
    const motor = game.world.motor;
    if (traffic === undefined || motor === undefined) {
      throw new Error('The mount did not land before the frame ran');
    }
    const onFootprints = vi.spyOn(traffic, 'footprints');
    const spawn = attached.grid.spawnPoints[0] ?? { x: 0, z: 0 };
    const destination = { x: spawn.x + 3, z: spawn.z };

    motor.setPath({ waypoints: [destination], destination });
    game.advance(0.05);

    expect(onFootprints).toHaveBeenCalled();
  });

  it('mounts cleanly when the town has no shadow quads', async () => {
    vi.mocked(mountParkedShadows).mockReturnValueOnce(undefined);
    vi.mocked(mountTrafficShadows).mockReturnValueOnce(undefined);
    const game = createGame(deps());
    game.advance(0.016);
    await game.ready;

    expect(game.world.trafficShadows).toBeUndefined();
    game.advance(0.016);
  });

  it('holds the origin when the grid publishes no spawn point', async () => {
    const attached = deps();
    const game = createGame({
      ...attached,
      grid: { ...attached.grid, spawnPoints: [] },
    });
    await game.ready;

    expect(game.world.spawn).toEqual({ x: 0, z: 0 });
  });
});
