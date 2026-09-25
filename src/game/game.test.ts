import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, type GameDeps } from './game';
import { findPath } from './path/pathfinder';
import { mountParkedShadows } from './town/parkedShadows';
import { createTownGrid } from './town/townGrid';
import { mountTown } from './town/townRenderer';
import { mountTrafficShadows } from './traffic/trafficShadows';
import { createVehicleActor } from './vehicle/vehicleActor';
import { createVehicleMotor, facingOf } from './vehicle/vehicleMotor';

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
// The real pathfinder, spied: a town that cannot route anywhere is a branch
// the happy path never reaches.
vi.mock('./path/pathfinder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./path/pathfinder')>();
  return { ...actual, findPath: vi.fn(actual.findPath) };
});
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
    hud: strict(
      {
        setActive: vi.fn(),
        setAbility: vi.fn(),
        setAbilityBusy: vi.fn(),
        setAbilityVisible: vi.fn(),
        setPolicePulse: vi.fn(),
      },
      'hud',
    ),
    scene: strict({ add: vi.fn(), remove: vi.fn() }, 'scene'),
    camera: strict(
      {
        facing: { quaternion: { x: 0, y: 0, z: 0, w: 1 } },
        setTarget: vi.fn(),
        followSun: vi.fn(),
      },
      'camera',
    ),
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

  it('holds and releases the mission tap boundary for async ordering tests', async () => {
    const { game } = await booted();
    const pending = holdMissionTap(game);
    const tap = game.tapAt({ x: 1, z: 1 });

    await Promise.resolve();
    expect(game.world.missions.tap).toHaveBeenCalledWith(
      { x: 1, z: 1 },
      expect.objectContaining({ morphFailed: expect.any(Function) }),
    );

    pending.resolve(false);
    await tap;
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
    expect(Object.keys(attached.hud).sort()).toEqual([
      'setAbility',
      'setAbilityBusy',
      'setAbilityVisible',
      'setActive',
      'setPolicePulse',
    ]);
    expect(Object.keys(attached.camera).sort()).toEqual([
      'facing',
      'followSun',
      'setTarget',
    ]);
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

describe('living town interaction (Phase 4)', () => {
  const expectedIds = [
    'traffic-0',
    'traffic-1',
    'traffic-2',
    'traffic-3',
    'creature-cat-0',
    'creature-rabbit-0',
  ];

  function run(motor: ReturnType<typeof createVehicleMotor>, frames: number): void {
    for (let frame = 0; frame < frames; frame += 1) {
      motor.update(1 / 60);
    }
  }

  it('bonks each new actor profile once and keeps the hero moving', async () => {
    const { game } = await booted();
    const traffic = game.world.traffic;
    if (traffic === undefined) {
      throw new Error('The traffic system did not mount');
    }

    for (const kind of ['parkedSuv', 'cat', 'rabbit'] as const) {
      const index = traffic.poses().findIndex((pose) => pose.kind === kind);
      const pose = traffic.poses()[index];
      const obstacle = traffic.footprints()[index];
      if (pose === undefined || obstacle?.shape.kind !== 'box') {
        throw new Error(`The ${kind} profile did not publish a footprint`);
      }
      const facing = facingOf(pose.heading());
      const start = {
        x: pose.position.x - facing.x * 0.85,
        z: pose.position.z - facing.z * 0.85,
      };
      const destination = {
        x: pose.position.x + facing.x * 0.85,
        z: pose.position.z + facing.z * 0.85,
      };
      const motor = createVehicleMotor({
        position: start,
        heading: pose.heading(),
        dynamicObstacles: () => [obstacle],
      });
      motor.setPath({ waypoints: [], destination });

      let bonkFrame = 0;
      while (motor.bonkCount() === 0 && bonkFrame < 300) {
        motor.update(1 / 60);
        bonkFrame += 1;
      }

      expect(obstacle.solid).toBe(false);
      expect(motor.bonkCount()).toBe(1);
      expect(motor.isBouncing()).toBe(true);
      run(motor, 300 - bonkFrame);
      expect(motor.isDriving()).toBe(false);
      expect(
        Math.hypot(motor.position.x - destination.x, motor.position.z - destination.z),
      ).toBeLessThan(0.4);
    }
  });

  it('keeps ambient collisions harmless and routes alive through every mission', async () => {
    type MissionCase = {
      readonly name: string;
      readonly activate: (game: ReturnType<typeof createGame>) => void;
    };
    const cases: readonly MissionCase[] = [
      { name: 'free play', activate: () => undefined },
      {
        name: 'fire',
        activate: (game) => {
          const house = game.world.grid.houses[0];
          if (house === undefined || !game.lightFire(house.id)) {
            throw new Error('The fire mission did not start');
          }
        },
      },
      {
        name: 'ice cream',
        activate: (game) => {
          const house = game.world.grid.houses[0];
          if (house === undefined || !game.lightOrder(house.id)) {
            throw new Error('The ice-cream mission did not start');
          }
        },
      },
      { name: 'park', activate: (game) => game.startPark() },
      { name: 'puppy', activate: (game) => game.startPuppy() },
    ];

    for (const missionCase of cases) {
      const { game, attached } = await booted();
      missionCase.activate(game);
      const traffic = game.world.traffic;
      const motor = game.world.motor;
      if (traffic === undefined || motor === undefined) {
        throw new Error(`The ${missionCase.name} world did not mount`);
      }
      const targetIndex = traffic.poses().findIndex((pose) => pose.kind === 'cat');
      const target = traffic.poses()[targetIndex];
      const targetObstacle = traffic.footprints()[targetIndex];
      if (target === undefined || targetObstacle?.shape.kind !== 'box') {
        throw new Error(`The ${missionCase.name} cat did not publish a footprint`);
      }
      const facing = facingOf(target.heading());
      const start = {
        x: target.position.x - facing.x * 0.85,
        z: target.position.z - facing.z * 0.85,
      };
      const destination = {
        x: target.position.x + facing.x * 0.85,
        z: target.position.z + facing.z * 0.85,
      };
      motor.snapTo(start, target.heading());
      motor.setPath({ waypoints: [], destination });

      for (let frame = 0; frame < 240; frame += 1) {
        game.advance(1 / 60);
      }

      expect(traffic.poses().map((pose) => pose.id)).toEqual(expectedIds);
      expect(motor.bonkCount()).toBeGreaterThan(0);
      expect(motor.isDriving()).toBe(false);
      expect(
        Math.hypot(motor.position.x - destination.x, motor.position.z - destination.z),
      ).toBeLessThan(0.4);
      expect(attached.audio.play).toHaveBeenCalledWith('bonk');
    }
  });

  it('does not let traffic updates mutate mission, route, or helper state', async () => {
    const { game } = await booted();
    const house = game.world.grid.houses[0];
    const traffic = game.world.traffic;
    const motor = game.world.motor;
    if (house === undefined || traffic === undefined || motor === undefined) {
      throw new Error('The coexistence fixture did not mount');
    }
    if (!game.lightFire(house.id)) {
      throw new Error('The fire mission did not start');
    }
    const destination = { x: game.world.spawn.x + 0.9, z: game.world.spawn.z };
    motor.setPath({ waypoints: [], destination });
    const setPath = vi.spyOn(motor, 'setPath');
    const before = {
      mission: game.world.mission.snapshot(),
      idle: game.world.hand.secondsIdle(),
      position: { ...motor.position },
      driving: motor.isDriving(),
    };

    for (let frame = 0; frame < 120; frame += 1) {
      traffic.update(1 / 60);
    }

    expect(game.world.mission.snapshot()).toEqual(before.mission);
    expect(game.world.hand.secondsIdle()).toBe(before.idle);
    expect({ ...motor.position }).toEqual(before.position);
    expect(motor.isDriving()).toBe(before.driving);
    expect(setPath).not.toHaveBeenCalled();
  });
});

/** A booted controller with its ports still in reach for assertions. */
async function booted(): Promise<{
  game: ReturnType<typeof createGame>;
  attached: GameDeps;
}> {
  const attached = deps();
  const game = createGame(attached);
  await game.ready;
  return { game, attached };
}

/** Lets every pending microtask (and the async morph) settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

type TestVehicleActor = Awaited<ReturnType<typeof createVehicleActor>>;

type Deferred<T> = {
  readonly promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
};

/** A hand-controlled promise for deterministic async ordering tests. */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

/** Gives each mocked actor a distinct object identity for scene assertions. */
function testActor(label = 'vehicle'): TestVehicleActor {
  return {
    object: { label } as unknown as TestVehicleActor['object'],
    sync: vi.fn(),
  };
}

/** Holds the registry boundary so a test can release a tap in a chosen order. */
function holdMissionTap(game: ReturnType<typeof createGame>): Deferred<boolean> {
  const pending = deferred<boolean>();
  vi.spyOn(game.world.missions, 'tap').mockReturnValueOnce(pending.promise);
  return pending;
}

// The async model pipeline is faked at the actor boundary. Reset only that
// boundary per test: the production code must still receive a fresh actor for
// each mount, while a test can replace one call with a deferred promise.
beforeEach(() => {
  vi.mocked(createVehicleActor).mockReset();
  vi.mocked(createVehicleActor).mockImplementation(async () => testActor());
});

describe('session rules: pickup, spawn and the mission frame (Phase 3)', () => {
  it('answers the park errand on the first drive-over and morphs to the truck', async () => {
    const { game } = await booted();
    game.startPark();
    const piece = game.world.litter[0];
    if (piece === undefined) {
      throw new Error('The park round laid no litter');
    }

    game.absorb({ collected: [piece], gulp: false, complete: false }, true);
    await settle();

    // Driving over a piece while the errand is unanswered IS the answer: the
    // mission responds and the fleet becomes the garbage truck.
    expect(game.world.park.snapshot().state).toBe('responding');
    expect(game.world.fleet.activeId()).toBe('garbage');
    expect(game.world.litter.some((live) => live.id === piece.id)).toBe(false);
  });

  it('voices one gulp for a sweep while each drive-over piece earns its own', async () => {
    const { game, attached } = await booted();
    const play = attached.audio.play as ReturnType<typeof vi.fn>;
    game.startPark();
    const [first, second] = game.world.litter;
    if (first === undefined || second === undefined) {
      throw new Error('The park round laid fewer than two pieces');
    }

    // The cast's sweep already sounded its own gulp for the group, so the
    // pickup it drives in must stay silent however many pieces it took.
    game.absorb({ collected: [first, second], gulp: true, complete: false }, false);
    expect(play).not.toHaveBeenCalledWith('gulp');

    // A drive-over piece is its own event, and that one is voiced.
    const third = game.world.litter[0];
    if (third === undefined) {
      throw new Error('The park round ran out of pieces early');
    }
    game.absorb({ collected: [third], gulp: true, complete: false }, true);
    expect(play).toHaveBeenCalledWith('gulp');
  });

  it('does not answer the errand twice once it is already running', async () => {
    const { game, attached } = await booted();
    const setActive = attached.hud.setActive as ReturnType<typeof vi.fn>;
    game.startPark();
    const first = game.world.litter[0];
    if (first === undefined) {
      throw new Error('The park round laid no litter');
    }
    game.absorb({ collected: [first], gulp: false, complete: false }, false);
    await settle();
    setActive.mockClear();

    const second = game.world.litter[0];
    if (second === undefined) {
      throw new Error('The park round ran out of pieces early');
    }
    game.absorb({ collected: [second], gulp: false, complete: false }, false);
    await settle();

    expect(game.world.park.snapshot().state).toBe('responding');
    expect(setActive).not.toHaveBeenCalled();
  });

  it('celebrates the park clean-up exactly once, at the last piece', async () => {
    const { game } = await booted();
    game.startPark();
    const all = [...game.world.litter];
    const onBurst = vi.spyOn(game.world.fx, 'burst');
    const cheers = (): number =>
      onBurst.mock.calls.filter((call) => call[0] === 'confetti').length;

    game.absorb({ collected: all, gulp: false, complete: true }, false);
    const afterFirst = cheers();
    expect(afterFirst).toBeGreaterThan(0);
    expect(game.world.park.snapshot().state).toBe('complete');

    // A second completion can never fire the celebration again.
    game.absorb(
      {
        collected: [{ id: 'synthetic', tile: { x: 0, y: 0 }, position: { x: 0, z: 0 } }],
        gulp: false,
        complete: true,
      },
      false,
    );
    expect(cheers()).toBe(afterFirst);
  });

  it('opens a park round atomically and ignores a second ask', async () => {
    const { game, attached } = await booted();
    const play = attached.audio.play as ReturnType<typeof vi.fn>;
    const add = attached.scene.add as ReturnType<typeof vi.fn>;

    game.startPark();

    expect(game.world.litter.length).toBeGreaterThan(0);
    const field = game.world.litterField;
    expect(field).toBeDefined();
    expect(add).toHaveBeenCalledWith(field?.object);
    expect(play).toHaveBeenCalledWith('chime');
    expect(game.world.parkCelebration.isArmed()).toBe(true);

    // A running clean-up is never re-laid: the field object is the same one.
    add.mockClear();
    game.startPark();
    expect(game.world.litterField).toBe(field);
    expect(add).not.toHaveBeenCalled();
  });

  it('draws the pup round once, with its owner and the police ask', async () => {
    const { game, attached } = await booted();
    const play = attached.audio.play as ReturnType<typeof vi.fn>;
    const pulse = attached.hud.setPolicePulse as ReturnType<typeof vi.fn>;

    game.startPuppy();

    expect(game.world.puppyPending).toBe(true);
    expect(game.world.puppySpot).toBeDefined();
    expect(game.world.puppyOwnerHouseId).toBeDefined();
    expect(game.world.spotPup.visible).toBe(true);
    expect(play).toHaveBeenCalledWith('bark');
    expect(pulse).toHaveBeenCalledWith(true);
    expect(game.world.puppyCelebration.isArmed()).toBe(true);

    // A second draw while one is pending changes nothing.
    const spot = game.world.puppySpot;
    game.startPuppy();
    expect(game.world.puppySpot).toBe(spot);
  });

  it('lights a fire and an order atomically, and refuses a lot that is not there', async () => {
    const { game, attached } = await booted();
    const play = attached.audio.play as ReturnType<typeof vi.fn>;
    const house = attached.grid.houses[0];
    if (house === undefined) {
      throw new Error('The town has no houses');
    }

    expect(game.lightFire(house.id)).toBe(true);
    expect(game.world.mission.snapshot().fireHouseId).toBe(house.id);
    expect(game.world.sun.isShowing()).toBe(false);
    expect(play).toHaveBeenCalledWith('chime');

    expect(game.lightOrder(house.id)).toBe(true);
    expect(game.world.orders.snapshot().orderHouseId).toBe(house.id);
    expect(game.world.orderMarker.isShowing()).toBe(true);

    // No such lot: the round never opens and the town never cheers for it.
    play.mockClear();
    expect(game.lightFire('no-such-house')).toBe(false);
    expect(play).not.toHaveBeenCalledWith('chime');
    expect(game.world.mission.snapshot().fireHouseId).toBe(house.id);
  });

  it('runs the four mission ticks in the registry order', async () => {
    const { game } = await booted();
    const onFire = vi.spyOn(game.world.mission, 'update');
    const onOrder = vi.spyOn(game.world.orders, 'update');
    const onPark = vi.spyOn(game.world.park, 'update');
    const onPuppy = vi.spyOn(game.world.puppy, 'update');

    game.missionsTick(0.016, game.world.spawn);

    expect(onFire).toHaveBeenCalled();
    expect(onOrder).toHaveBeenCalled();
    expect(onPark).toHaveBeenCalled();
    expect(onPuppy).toHaveBeenCalled();
    expect(onFire.mock.invocationCallOrder[0]).toBeLessThan(
      onOrder.mock.invocationCallOrder[0] ?? 0,
    );
    expect(onOrder.mock.invocationCallOrder[0]).toBeLessThan(
      onPark.mock.invocationCallOrder[0] ?? 0,
    );
    expect(onPark.mock.invocationCallOrder[0]).toBeLessThan(
      onPuppy.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('routes each due mission to its own starter, one per frame', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    if (house === undefined) {
      throw new Error('The town has no houses');
    }

    const onRotation = vi.spyOn(game.world.rotation, 'update').mockReturnValue('fire');
    game.tickPacers(0.016);
    // The fire's own pacer picks the lot, so the round is open on *a* house.
    expect(game.world.mission.snapshot().fireHouseId).toBeDefined();
    // Only the chosen mission is considered: the else-if chain is the rule.
    expect(game.world.orders.snapshot().orderHouseId).toBeUndefined();
    expect(game.world.park.snapshot().state).toBe('idle');
    expect(game.world.puppyPending).toBe(false);

    onRotation.mockReturnValue('park');
    game.tickPacers(0.016);
    expect(game.world.litter.length).toBeGreaterThan(0);

    onRotation.mockReturnValue('puppy');
    game.tickPacers(0.016);
    expect(game.world.puppyPending).toBe(true);

    onRotation.mockReturnValue('iceCream');
    game.tickPacers(0.016);
    expect(game.world.orders.snapshot().orderHouseId).toBeDefined();
  });

  it('pauses every pacer while a mission is still waiting on the kid', async () => {
    const { game } = await booted();
    const onRotation = vi.spyOn(game.world.rotation, 'update');
    const house = game.world.grid.houses[0];

    game.tickPacers(0.016);
    expect(onRotation).toHaveBeenLastCalledWith(0.016, false);

    if (house === undefined) {
      throw new Error('The town has no houses');
    }
    game.lightFire(house.id);
    onRotation.mockReturnValue(undefined);
    game.tickPacers(0.016);

    // The town is busy, so the rotation is told so — and because the real
    // rotation answers `undefined` while busy, nothing new opens.
    expect(onRotation).toHaveBeenLastCalledWith(0.016, true);
    expect(game.world.puppyPending).toBe(false);
    expect(game.world.mission.snapshot().fireHouseId).toBe(house.id);
  });
});

describe('session rules: the closures Phase 3 had to bring with them', () => {
  it('activates the fleet and tells the serve latch which truck is driving', async () => {
    const { game, attached } = await booted();
    const setActive = attached.hud.setActive as ReturnType<typeof vi.fn>;
    const setAbility = attached.hud.setAbility as ReturnType<typeof vi.fn>;

    game.activate('garbage');

    expect(game.world.fleet.activeId()).toBe('garbage');
    expect(setActive).toHaveBeenCalledWith('garbage');
    expect(setAbility).toHaveBeenCalledWith('garbage');
  });

  it('builds the replacement car before removing the old one', async () => {
    const { game, attached } = await booted();
    const remove = attached.scene.remove as ReturnType<typeof vi.fn>;
    const before = game.world.actor;
    remove.mockClear();
    vi.mocked(createVehicleActor).mockClear();

    await game.swapVehicle('police');

    // The replacement is built first, so no frame is ever empty.
    expect(vi.mocked(createVehicleActor).mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      remove.mock.invocationCallOrder[0] ?? 0,
    );
    expect(remove).toHaveBeenCalledWith(before?.object);
    expect(game.world.actor).not.toBe(before);
  });

  it('arms serve only on the ice-cream truck, after a jingle, in range', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    if (house === undefined || motor === undefined) {
      throw new Error('The town or the car is missing');
    }
    game.lightOrder(house.id);

    expect(game.serveArmedNow()).toBe(false);

    game.activate('iceCream');
    expect(game.serveArmedNow()).toBe(false);

    game.world.serveGate.noteJingle();
    motor.snapTo({ x: house.position.x + 10, z: house.position.z });
    game.missionsTick(0.016, motor.position);
    expect(game.serveArmedNow()).toBe(false);

    // The order itself only becomes servable once the kid answered it and the
    // truck is on the house: spawned -> driving -> active.
    expect(game.world.orders.respond()).toBe(true);
    motor.snapTo(house.position);
    game.missionsTick(0.016, motor.position);
    expect(game.serveArmedNow()).toBe(true);

    // A jingle only survives on the truck that sang it.
    game.activate('police');
    expect(game.serveArmedNow()).toBe(false);
  });

  it('hops the pup out at the car, runs it to the door, then celebrates', async () => {
    const { game } = await booted();
    game.startPuppy();
    const spot = game.world.puppySpot;
    const ownerId = game.world.puppyOwnerHouseId;
    if (spot === undefined || ownerId === undefined) {
      throw new Error('The pup round drew nothing');
    }
    const owner = game.world.grid.houseById(ownerId);
    if (owner === undefined) {
      throw new Error('The drawn owner house is missing');
    }

    // The siren latch itself is the ability path's own test; here it is set
    // directly so the door run is what is under test.
    game.world.puppy.siren();
    game.world.puppyPending = false;
    game.missionsTick(0.016, spot.position);

    expect(game.world.puppy.snapshot().state).toBe('carrying');
    expect(game.world.riderPup.visible).toBe(true);
    expect(game.world.riderPup.position.y).toBe(0.28);

    game.deliverPuppy(owner.position);

    // The pup hops out at the car, the rider leaves the roof, and the town
    // applauds the hand-off.
    expect(game.world.riderPup.visible).toBe(false);
    expect(game.world.spotPup.visible).toBe(true);
    expect(game.world.spotPup.position.x).toBeCloseTo(spot.position.x);
    expect(game.world.spotPup.position.z).toBeCloseTo(spot.position.z);
    expect(game.world.puppyCelebration.isArmed()).toBe(false);

    // Halfway through the door run it is between the car and the door.
    game.missionsTick(0.35, spot.position);
    const midway = game.world.spotPup.position;
    expect(midway.x).toBeCloseTo((spot.position.x + owner.position.x) / 2, 1);

    // And it is home: the run takes DOOR_RUN_SECONDS, then the stage clears.
    game.missionsTick(0.4, spot.position);
    expect(game.world.spotPup.position.x).toBeCloseTo(owner.position.x, 5);
    expect(game.world.spotPup.visible).toBe(true);
  });
});

describe('ability, siren, helper hand and the tap surface (Phase 3)', () => {
  it("dispatches each vehicle's cast from one press", async () => {
    const { game, attached } = await booted();
    const playAbility = attached.audio.playAbility as ReturnType<typeof vi.fn>;
    const onBurst = vi.spyOn(game.world.fx, 'burst');
    const onFlash = vi.spyOn(game.world.fx, 'flash');

    game.activate('fire');
    game.pressAbility();
    expect(playAbility).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'spray' }),
    ]);
    expect(onBurst).toHaveBeenCalledWith('spray', expect.anything(), 0);
    game.world.fleet.update(2);

    game.activate('iceCream');
    game.pressAbility();
    expect(playAbility).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'jingle' }),
      expect.objectContaining({ kind: 'cones' }),
    ]);
    expect(onBurst).toHaveBeenCalledWith('cones', expect.anything(), 0);

    game.activate('garbage');
    game.pressAbility();
    expect(onBurst).toHaveBeenCalledWith('gulp', expect.anything(), 0);

    game.activate('police');
    game.pressAbility();
    expect(onFlash).toHaveBeenCalled();
  });

  it('counts a hose burst only while the hose is in reach', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    if (house === undefined || motor === undefined) {
      throw new Error('The town or the car is missing');
    }
    game.lightFire(house.id);
    game.activate('fire');
    // The fire answers the house tap before the hose is ever in reach.
    expect(game.world.mission.respond()).toBe(true);
    const before = game.world.mission.snapshot().burstsLeft;

    // Parked on the burning house: the hose arrives with proximity, and the
    // spray is the rescue.
    motor.snapTo(house.position);
    for (let step = 0; step < 3; step += 1) {
      game.missionsTick(0.016, motor.position);
    }
    expect(game.world.mission.isHoseReady(game.distanceToFire(motor.position))).toBe(
      true,
    );
    game.pressAbility();
    expect(game.world.mission.snapshot().burstsLeft).toBe(before - 1);

    // Away from it, the same cast is a trick and the fire is untouched.
    game.world.fleet.update(2);
    const afterFirst = game.world.mission.snapshot().burstsLeft;
    motor.snapTo({ x: house.position.x + 8, z: house.position.z + 8 });
    for (let step = 0; step < 3; step += 1) {
      game.missionsTick(0.016, motor.position);
    }
    game.pressAbility();
    expect(game.world.mission.snapshot().burstsLeft).toBe(afterFirst);
  });

  it('latches the pup answer exactly once, on the siren', async () => {
    const { game, attached } = await booted();
    const play = attached.audio.play as ReturnType<typeof vi.fn>;
    const onShow = vi.spyOn(game.world.pawMarker, 'show');

    game.startPuppy();
    game.activate('police');
    game.pressAbility();

    expect(game.world.puppyPending).toBe(false);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('bark');

    // A second siren has no pending pup left to answer.
    play.mockClear();
    onShow.mockClear();
    game.pressAbility();
    expect(onShow).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalledWith('bark');
  });

  it('points the hand at the siren button while the pup is waiting', async () => {
    const { game } = await booted();
    const onFlash = vi.spyOn(game.world.fx, 'flash');

    game.startPuppy();
    game.tickHelperHand(11, game.world.spawn);

    // The hand demos the siren itself: be the police, then press.
    await settle();
    expect(game.world.fleet.activeId()).toBe('police');
    expect(onFlash).toHaveBeenCalled();
  });

  it('demos exactly one tap, then cools down', async () => {
    const { game, attached } = await booted();
    const onSetPath = vi.spyOn(
      game.world.motor as NonNullable<typeof game.world.motor>,
      'setPath',
    );
    const onShow = vi.spyOn(game.world.helperTrace, 'show');
    const house = attached.grid.houses[0];
    if (house === undefined) {
      throw new Error('The town has no houses');
    }
    // A burning house is something the kid still has to answer, so the hand
    // has a reason to point.
    game.lightFire(house.id);

    game.tickHelperHand(11, game.world.spawn);
    expect(onShow).toHaveBeenCalledTimes(1);

    // The trace finishes, and the demo tap it announced is made exactly once.
    // The tap answers the fire first (which morphs the car) and only then
    // routes, so it settles across microtasks.
    vi.spyOn(game.world.helperTrace, 'isDone').mockReturnValue(true);
    game.tickHelperHand(0.016, game.world.spawn);
    await settle();
    expect(onSetPath).toHaveBeenCalledTimes(1);

    // The hand's patience has reset: no second demo on the very next frame.
    game.tickHelperHand(0.016, game.world.spawn);
    expect(onSetPath).toHaveBeenCalledTimes(1);
  });

  it('answers missions against the aim while the car drives to the target', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const prop = attached.grid.props[0];
    const motor = game.world.motor;
    if (house === undefined || prop === undefined || motor === undefined) {
      throw new Error('The town or the car is missing');
    }
    game.lightFire(house.id);
    game.activate('fire');
    motor.snapTo({ x: house.position.x + 6, z: house.position.z + 6 });
    game.missionsTick(0.016, motor.position);

    // The finger landed on a prop beside the burning house, and the tap was
    // sent to the house: a hydrant beside a fire may not steal the hose.
    await game.tapAt(house.position, prop.position);
    expect(game.world.mission.snapshot().state).toBe('spawned');
    expect(motor.isDriving()).toBe(true);
  });

  it('lets a cone beside an ordered house not steal the serve', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const prop = attached.grid.props[0];
    const motor = game.world.motor;
    if (house === undefined || prop === undefined || motor === undefined) {
      throw new Error('The town or the car is missing');
    }
    game.lightOrder(house.id);
    game.activate('iceCream');
    // The order answers to the house tap first, then the truck arriving is
    // what arms the serve — and the jingle is the key that keeps it armed.
    expect(game.world.orders.respond()).toBe(true);
    motor.snapTo(house.position);
    game.missionsTick(0.016, motor.position);
    expect(game.serveArmedNow()).toBe(false);
    game.pressAbility();
    expect(game.serveArmedNow()).toBe(true);

    // Aimed at a cone, not the house: the order stays open and the car drives
    // to the tapped point instead.
    await game.tapAt(prop.position, prop.position);
    expect(game.world.orders.snapshot().state).not.toBe('complete');

    // Aimed squarely at the house: the one cone changes hands.
    await game.tapAt(house.position, house.position);
    expect(game.world.orders.snapshot().state).toBe('complete');
  });

  it('drops the demo when the town stops needing the kid', async () => {
    const { game, attached } = await booted();
    const onHide = vi.spyOn(game.world.helperTrace, 'hide');
    const house = attached.grid.houses[0];
    if (house === undefined) {
      throw new Error('The town has no houses');
    }
    game.lightFire(house.id);
    game.tickHelperHand(11, game.world.spawn);
    onHide.mockClear();

    // The errand is over (the town's quiet again), so the trace is dropped and
    // the announced demo never happens.
    game.world.mission.abort();
    game.tickHelperHand(0.016, game.world.spawn);
    expect(onHide).toHaveBeenCalled();
    expect(game.world.helperTrace.isDone()).toBe(false);
  });
});

describe('the rest of the tap surface and the round edges', () => {
  it('claims the fire without morphing when that truck is already driving', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    if (house === undefined || motor === undefined) {
      throw new Error('The town or the car is missing');
    }
    game.lightFire(house.id);
    game.activate('fire');
    const onSetPath = vi.spyOn(motor, 'setPath');
    motor.snapTo({ x: house.position.x + 6, z: house.position.z + 6 });

    await game.tapAt(house.position, house.position);

    // The errand is answered and the car drives, with no second morph.
    expect(game.world.mission.snapshot().state).not.toBe('spawned');
    expect(game.world.fleet.activeId()).toBe('fire');
    expect(onSetPath).toHaveBeenCalled();
  });

  it('answers an order without morphing when the truck is already out', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    if (house === undefined || motor === undefined) {
      throw new Error('The town or the car is missing');
    }
    game.lightOrder(house.id);
    game.activate('iceCream');
    motor.snapTo({ x: house.position.x + 6, z: house.position.z + 6 });

    await game.tapAt(house.position, house.position);
    expect(game.world.orders.snapshot().state).not.toBe('spawned');
    expect(game.world.fleet.activeId()).toBe('iceCream');
  });

  it('lets a tap past every mission that is not waiting', async () => {
    const { game, attached } = await booted();
    const motor = game.world.motor;
    const onSetPath = vi.spyOn(motor as NonNullable<typeof game.world.motor>, 'setPath');
    const road = attached.grid.spawnPoints[0];
    if (motor === undefined || road === undefined) {
      throw new Error('The car or the road is missing');
    }

    // Nothing is spawned and no pup is carried, so every mission ignores it
    // and the tap stays a drive.
    await game.tapAt(road, road);
    expect(onSetPath).toHaveBeenCalled();
    expect(game.world.park.snapshot().state).toBe('idle');
    expect(game.world.puppy.snapshot().state).toBe('idle');
  });

  it('answers the park errand on a piece and drives to the tap', async () => {
    const { game } = await booted();
    game.startPark();
    const piece = game.world.litter[0];
    if (piece === undefined) {
      throw new Error('The park round laid no litter');
    }

    await game.tapAt(piece.position, piece.position);
    await settle();

    expect(game.world.park.snapshot().state).not.toBe('spawned');
    expect(game.world.fleet.activeId()).toBe('garbage');
  });

  it('does nothing for an empty pickup or a ghosted dog deliver', async () => {
    const { game } = await booted();
    const onBurst = vi.spyOn(game.world.fx, 'burst');

    game.absorb({ collected: [], gulp: true, complete: true }, true);
    expect(onBurst).not.toHaveBeenCalled();

    // The pup is not carrying, so the door run never starts.
    game.deliverPuppy({ x: 1, z: 1 });
    expect(game.world.spotPup.visible).toBe(false);
    expect(game.world.doorRun).toBeUndefined();
  });

  it('ignores a press while the one-shot is still in flight', async () => {
    const { game, attached } = await booted();
    const playAbility = attached.audio.playAbility as ReturnType<typeof vi.fn>;

    game.activate('fire');
    game.pressAbility();
    playAbility.mockClear();
    game.pressAbility();

    expect(playAbility).not.toHaveBeenCalled();
  });

  it('stays put when the road network cannot reach the tap', async () => {
    const { game } = await booted();
    const motor = game.world.motor;
    if (motor === undefined) {
      throw new Error('The car is missing');
    }
    const onSetPath = vi.spyOn(motor, 'setPath');
    const onShow = vi.spyOn(game.world.ring, 'show');
    vi.mocked(findPath).mockReturnValueOnce(undefined);

    // The ring still answers the tap, even where the road network gives up.
    await game.tapAt({ x: 500, z: 500 });
    expect(onShow).toHaveBeenCalledWith({ x: 500, z: 500 });
    expect(onSetPath).not.toHaveBeenCalled();
  });

  it('replaces a live litter field when a new round opens', async () => {
    const { game } = await booted();
    game.startPark();
    const first = game.world.litterField;
    if (first === undefined) {
      throw new Error('The park round laid no field');
    }

    // Tear the errand down, then open a fresh one: the outgoing field is
    // unmounted and released, never left on the stage.
    game.world.park.abort();
    game.startPark();

    expect(game.world.litterField).not.toBe(first);
    expect(game.world.park.snapshot().state).toBe('spawned');
  });

  it('refuses a second fire or order while one is already open', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    if (house === undefined) {
      throw new Error('The town has no houses');
    }

    expect(game.lightFire(house.id)).toBe(true);
    expect(game.lightFire(house.id)).toBe(false);

    expect(game.lightOrder(house.id)).toBe(true);
    expect(game.lightOrder(house.id)).toBe(false);
  });

  it('runs the litter frame and clears the pup stage after the cheer', async () => {
    const { game } = await booted();
    const onHide = vi.spyOn(game.world.pawMarker, 'hide');
    const onBurst = vi.spyOn(game.world.fx, 'burst');

    // The park frame: the field bounces and the wheels collect.
    game.startPark();
    const piece = game.world.litter[0];
    if (piece === undefined) {
      throw new Error('The park round laid no litter');
    }
    game.world.motor?.snapTo(piece.position);
    game.missionsTick(0.05, piece.position);
    expect(onBurst).toHaveBeenCalledWith('poof', piece.position, 0);

    // The pup stage: once the errand is over, the street is clear again.
    game.startPuppy();
    const spot = game.world.puppySpot;
    if (spot === undefined) {
      throw new Error('The pup round drew nothing');
    }
    game.world.puppy.siren();
    game.world.puppyPending = false;
    game.missionsTick(0.016, spot.position);
    game.deliverPuppy(spot.position);
    onHide.mockClear();
    for (let step = 0; step < 200; step += 1) {
      game.missionsTick(0.05, spot.position);
    }
    expect(game.world.puppy.snapshot().state).toBe('idle');
    expect(game.world.spotPup.visible).toBe(false);
    expect(game.world.riderPup.visible).toBe(false);
    expect(onHide).toHaveBeenCalled();
  });

  it('celebrates a finished fire and a served order exactly once each', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    if (house === undefined || motor === undefined) {
      throw new Error('The town or the car is missing');
    }
    const onBurst = vi.spyOn(game.world.fx, 'burst');
    const confetti = (): number =>
      onBurst.mock.calls.filter((call) => call[0] === 'confetti').length;

    // The fire: hose it down until the errand is done.
    game.lightFire(house.id);
    game.world.mission.respond();
    game.activate('fire');
    motor.snapTo(house.position);
    for (let press = 0; press < 6; press += 1) {
      for (let step = 0; step < 3; step += 1) {
        game.missionsTick(0.016, motor.position);
      }
      game.world.fleet.update(2);
      game.pressAbility();
      game.missionsTick(0.016, motor.position);
    }
    expect(game.world.mission.snapshot().state).toBe('complete');
    const afterFire = confetti();
    expect(afterFire).toBeGreaterThan(0);
    game.missionsTick(0.016, motor.position);
    expect(confetti()).toBe(afterFire);

    // The order: answer it, arrive, and the cone changes hands.
    game.world.mission.abort();
    game.lightOrder(house.id);
    game.activate('iceCream');
    game.world.orders.respond();
    motor.snapTo(house.position);
    game.missionsTick(0.016, motor.position);
    game.pressAbility();
    await game.tapAt(house.position, house.position);
    game.missionsTick(0.016, motor.position);
    expect(game.world.orders.snapshot().state).toBe('complete');
    expect(confetti()).toBeGreaterThan(afterFire);
  });
});

describe('the frame, the camera order and the boot window (Phase 4)', () => {
  it('aims the camera inside the vehicle frame and never eases the rig itself', async () => {
    const { game, attached } = await booted();
    const setTarget = attached.camera.setTarget as ReturnType<typeof vi.fn>;
    const followSun = attached.camera.followSun as ReturnType<typeof vi.fn>;
    const motor = game.world.motor;
    if (motor === undefined) {
      throw new Error('The car is missing');
    }
    motor.snapTo({ x: motor.position.x + 1, z: motor.position.z + 1 });

    game.advance(0.016);

    // The target is the car, and the shadow frustum follows it in the same
    // frame — in that order, so the map is texel-still while the town slides.
    expect(setTarget).toHaveBeenCalledWith(motor.position);
    expect(followSun).toHaveBeenCalledWith(motor.position);
    expect(setTarget.mock.invocationCallOrder[0]).toBeLessThan(
      followSun.mock.invocationCallOrder[0] ?? 0,
    );
    // The rig's own `update` is the edge's business; the camera port has no
    // such member, so a call would have thrown through the proxy already.
    expect(Object.keys(attached.camera).sort()).toEqual([
      'facing',
      'followSun',
      'setTarget',
    ]);
  });

  it('holds the camera still before the car exists, and follows it every frame after', async () => {
    const attached = deps();
    const game = createGame(attached);
    const setTarget = attached.camera.setTarget as ReturnType<typeof vi.fn>;
    const followSun = attached.camera.followSun as ReturnType<typeof vi.fn>;

    // The boot window: the sky is up, the models are loading, the camera has
    // nothing to follow yet.
    game.advance(0.016);
    game.advance(0.016);
    expect(setTarget).not.toHaveBeenCalled();
    expect(followSun).not.toHaveBeenCalled();

    await game.ready;
    game.advance(0.016);
    game.advance(0.016);
    expect(setTarget).toHaveBeenCalledTimes(2);
    expect(followSun).toHaveBeenCalledTimes(2);
  });

  it('keeps the ability-busy edge firing on the fleet clock, not every frame', async () => {
    const { game, attached } = await booted();
    const setBusy = attached.hud.setAbilityBusy as ReturnType<typeof vi.fn>;

    game.advance(0.016);
    game.advance(0.016);
    // A quiet fleet never crosses the edge, so the button is never touched.
    expect(setBusy).not.toHaveBeenCalled();

    game.world.fleet.requestAbility();
    game.advance(0.016);
    expect(setBusy).toHaveBeenCalledTimes(1);
    expect(setBusy).toHaveBeenLastCalledWith(true);

    // Still bursting, still no edge.
    game.advance(0.016);
    expect(setBusy).toHaveBeenCalledTimes(1);

    game.world.fleet.update(2);
    game.advance(0.016);
    expect(setBusy).toHaveBeenCalledTimes(2);
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it('starts the loop before the mount resolves, so the sky is up while models stream (AC5)', () => {
    const attached = deps();
    let settled = false;
    const game = createGame(attached);
    // The mount is still in flight at the moment the edge gets its game.
    void game.ready.then(() => {
      settled = true;
    });

    expect(settled).toBe(false);
    expect(typeof game.advance).toBe('function');
    expect(game.world.spawn).toBeDefined();
    expect(game.world.town).toBeUndefined();
    expect(() => game.advance(1 / 60)).not.toThrow();
  });

  it('runs the whole mission frame from one advance call', async () => {
    const { game, attached } = await booted();
    const onRotation = vi.spyOn(game.world.rotation, 'update');
    const house = attached.grid.houses[0];
    if (house === undefined) {
      throw new Error('The town has no houses');
    }

    // The pacers and the hand are inside the frame now, not separate calls.
    vi.mocked(findPath).mockClear();
    game.advance(0.016);
    expect(onRotation).toHaveBeenCalled();
    expect(game.world.frameCarPosition).toEqual(game.world.motor?.position);
  });

  it('rejects `driven` when the mount dies before the car exists', async () => {
    // A model fetch failing is the realistic case: offline-first means the
    // first visit really can fail. The edge awaits `driven` before `ready`, so
    // a mount that never reaches the motor must reject it - otherwise the boot
    // parks on a promise nobody will ever settle and the failure is swallowed.
    const boom = new Error('model fetch failed');
    vi.mocked(mountTown).mockRejectedValueOnce(boom);
    const game = createGame(deps());

    await expect(game.driven).rejects.toThrow('model fetch failed');
    await expect(game.ready).rejects.toThrow('model fetch failed');
  });
});

describe('async intent arbitration (regression coverage)', () => {
  it('keeps the newest destination when taps resume out of order', async () => {
    const { game, attached } = await booted();
    const motor = game.world.motor;
    const [firstPoint, secondPoint] = attached.grid.spawnPoints;
    if (motor === undefined || firstPoint === undefined || secondPoint === undefined) {
      throw new Error('The car or spawn points are missing');
    }

    const firstMission = deferred<boolean>();
    const secondMission = deferred<boolean>();
    vi.spyOn(game.world.missions, 'tap')
      .mockReturnValueOnce(firstMission.promise)
      .mockReturnValueOnce(secondMission.promise);
    const onRing = vi.spyOn(game.world.ring, 'show');
    const onPlay = attached.audio.play as ReturnType<typeof vi.fn>;
    const onSetPath = vi.spyOn(motor, 'setPath');
    onRing.mockClear();
    onPlay.mockClear();

    const firstTap = game.tapAt(firstPoint, firstPoint);
    const secondTap = game.tapAt(secondPoint, secondPoint);

    expect(onRing).toHaveBeenNthCalledWith(1, firstPoint);
    expect(onRing).toHaveBeenNthCalledWith(2, secondPoint);
    expect(onPlay).toHaveBeenCalledTimes(2);

    secondMission.resolve(false);
    await secondTap;
    expect(onSetPath).toHaveBeenCalledTimes(1);

    firstMission.resolve(false);
    await firstTap;

    expect(onSetPath).toHaveBeenCalledTimes(1);
    expect(onSetPath.mock.calls[0]?.[0].destination).toEqual(secondPoint);
  });

  it('keeps a pre-ready selection when the initial actor resolves', async () => {
    const attached = deps();
    const initialActor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor).mockReturnValueOnce(initialActor.promise);
    const game = createGame(attached);
    await game.driven;
    expect(game.world.actor).toBeUndefined();

    const selectedActor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor).mockReturnValueOnce(selectedActor.promise);
    const onAdd = attached.scene.add as ReturnType<typeof vi.fn>;
    const onRemove = attached.scene.remove as ReturnType<typeof vi.fn>;
    onAdd.mockClear();
    onRemove.mockClear();

    const selection = game.selectVehicle('police');
    await settle();
    const committedActor = testActor('selected-police');
    selectedActor.resolve(committedActor);
    await selection;

    expect(game.world.actor).toBe(committedActor);
    expect(onAdd).toHaveBeenCalledWith(committedActor.object);

    const bootActor = testActor('initial');
    initialActor.resolve(bootActor);
    await game.ready;

    expect(game.world.actor).toBe(committedActor);
    expect(onAdd).not.toHaveBeenCalledWith(bootActor.object);
    expect(onRemove).not.toHaveBeenCalledWith(committedActor.object);
  });

  it('waits for a claimed morph before committing a newer destination', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    const [newerPoint] = attached.grid.spawnPoints;
    if (house === undefined || motor === undefined || newerPoint === undefined) {
      throw new Error('The town, car, or spawn point is missing');
    }

    game.activate('police');
    game.lightFire(house.id);
    const actor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor).mockReturnValueOnce(actor.promise);
    const onSetPath = vi.spyOn(motor, 'setPath');
    const missionTap = game.tapAt(house.position, house.position);
    await Promise.resolve();
    const newerTap = game.tapAt(newerPoint, newerPoint);
    await Promise.resolve();

    expect(onSetPath).not.toHaveBeenCalled();

    actor.resolve(testActor('fire'));
    await Promise.all([newerTap, missionTap]);
    expect(onSetPath).toHaveBeenCalledTimes(1);
    expect(onSetPath.mock.calls[0]?.[0].destination).toEqual(newerPoint);
  });

  it('does not resurrect an older route when the newest destination is unreachable', async () => {
    const { game, attached } = await booted();
    const motor = game.world.motor;
    const [firstPoint, secondPoint] = attached.grid.spawnPoints;
    if (motor === undefined || firstPoint === undefined || secondPoint === undefined) {
      throw new Error('The car or spawn points are missing');
    }

    const firstMission = deferred<boolean>();
    const secondMission = deferred<boolean>();
    vi.spyOn(game.world.missions, 'tap')
      .mockReturnValueOnce(firstMission.promise)
      .mockReturnValueOnce(secondMission.promise);
    const onSetPath = vi.spyOn(motor, 'setPath');
    // The newer tap resolves first and has no route; the older tap then finds
    // one, but it must not resurrect that superseded destination.
    vi.mocked(findPath)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ waypoints: [firstPoint], destination: firstPoint });

    const firstTap = game.tapAt(firstPoint, firstPoint);
    const secondTap = game.tapAt(secondPoint, secondPoint);
    secondMission.resolve(false);
    await secondTap;
    firstMission.resolve(false);
    await firstTap;

    expect(onSetPath).not.toHaveBeenCalled();
  });

  it('keeps a claimed fire morph atomic while applying the newest destination', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    const [newerPoint] = attached.grid.spawnPoints;
    if (house === undefined || motor === undefined || newerPoint === undefined) {
      throw new Error('The town or spawn points are missing');
    }

    game.activate('police');
    game.lightFire(house.id);
    const actor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor).mockReturnValueOnce(actor.promise);
    const onSetPath = vi.spyOn(motor, 'setPath');
    const missionTap = game.tapAt(house.position, house.position);

    await Promise.resolve();
    expect(game.world.mission.snapshot().state).not.toBe('spawned');

    const newerTap = game.tapAt(newerPoint, newerPoint);
    await Promise.resolve();
    actor.resolve(testActor('fire'));
    await Promise.all([newerTap, missionTap]);

    expect(game.world.mission.snapshot().state).not.toBe('spawned');
    expect(game.world.fleet.activeId()).toBe('fire');
    const finalPath = onSetPath.mock.calls[onSetPath.mock.calls.length - 1]?.[0];
    expect(finalPath?.destination).toEqual(newerPoint);
  });

  it('keeps a claimed ice-cream morph atomic while applying a later tap', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    const [newerPoint] = attached.grid.spawnPoints;
    if (house === undefined || motor === undefined || newerPoint === undefined) {
      throw new Error('The town or spawn points are missing');
    }

    game.activate('police');
    game.lightOrder(house.id);
    const actor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor).mockReturnValueOnce(actor.promise);
    const onSetPath = vi.spyOn(motor, 'setPath');
    const missionTap = game.tapAt(house.position, house.position);

    await Promise.resolve();
    expect(game.world.orders.snapshot().state).not.toBe('spawned');

    const newerTap = game.tapAt(newerPoint, newerPoint);
    await Promise.resolve();
    actor.resolve(testActor('iceCream'));
    await Promise.all([newerTap, missionTap]);

    expect(game.world.orders.snapshot().state).not.toBe('spawned');
    expect(game.world.fleet.activeId()).toBe('iceCream');
    const finalPath = onSetPath.mock.calls[onSetPath.mock.calls.length - 1]?.[0];
    expect(finalPath?.destination).toEqual(newerPoint);
  });

  it('keeps a claimed park morph atomic while applying a later tap', async () => {
    const { game, attached } = await booted();
    const motor = game.world.motor;
    const [newerPoint] = attached.grid.spawnPoints;
    if (motor === undefined || newerPoint === undefined) {
      throw new Error('The town or spawn points are missing');
    }

    game.startPark();
    const piece = game.world.litter[0];
    if (piece === undefined) {
      throw new Error('The park round laid no litter');
    }
    game.activate('police');
    const actor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor).mockReturnValueOnce(actor.promise);
    const onSetPath = vi.spyOn(motor, 'setPath');
    const missionTap = game.tapAt(piece.position, piece.position);

    await settle();
    expect(game.world.park.snapshot().state).not.toBe('spawned');

    const newerTap = game.tapAt(newerPoint, newerPoint);
    await Promise.resolve();
    actor.resolve(testActor('garbage'));
    await Promise.all([newerTap, missionTap]);

    expect(game.world.park.snapshot().state).not.toBe('spawned');
    expect(game.world.fleet.activeId()).toBe('garbage');
    const finalPath = onSetPath.mock.calls[onSetPath.mock.calls.length - 1]?.[0];
    expect(finalPath?.destination).toEqual(newerPoint);
  });

  it('rolls back a failed mission morph and permits a later retry', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    const beforeActor = game.world.actor;
    if (house === undefined || motor === undefined || beforeActor === undefined) {
      throw new Error('The town or car is missing');
    }

    game.activate('police');
    const activeBefore = game.world.fleet.activeId();
    const onHudActive = attached.hud.setActive as ReturnType<typeof vi.fn>;
    const onRemove = vi.spyOn(attached.scene, 'remove');
    const onSetPath = vi.spyOn(motor, 'setPath');
    const actor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor).mockReturnValueOnce(actor.promise);
    game.lightFire(house.id);
    const failedTap = game.tapAt(house.position, house.position);

    await settle();
    actor.reject(new Error('actor load failed'));

    await expect(failedTap).resolves.toBeUndefined();
    expect(game.world.actor).toBe(beforeActor);
    expect(game.world.fleet.activeId()).toBe(activeBefore);
    expect(onHudActive).toHaveBeenLastCalledWith(activeBefore);
    expect(onSetPath).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalledWith(beforeActor.object);

    const retryActor = testActor('fire-retry');
    vi.mocked(createVehicleActor).mockResolvedValueOnce(retryActor);
    await game.selectVehicle('fire');

    expect(game.world.actor).toBe(retryActor);
    expect(game.world.fleet.activeId()).toBe('fire');
  });

  it('serializes A-then-B vehicle selection and removes the superseded actor', async () => {
    const { game, attached } = await booted();
    const onAdd = attached.scene.add as ReturnType<typeof vi.fn>;
    const onRemove = attached.scene.remove as ReturnType<typeof vi.fn>;
    const onHudActive = attached.hud.setActive as ReturnType<typeof vi.fn>;
    onAdd.mockClear();
    onRemove.mockClear();
    onHudActive.mockClear();
    vi.mocked(createVehicleActor).mockClear();

    const firstActor = deferred<TestVehicleActor>();
    const secondActor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor)
      .mockReturnValueOnce(firstActor.promise)
      .mockReturnValueOnce(secondActor.promise);

    const firstRequest = game.selectVehicle('police');
    const secondRequest = game.selectVehicle('iceCream');
    await settle();

    // The second selection must wait rather than start a concurrent swap.
    expect(vi.mocked(createVehicleActor)).toHaveBeenCalledTimes(1);

    const policeActor = testActor('police');
    firstActor.resolve(policeActor);
    await firstRequest;
    await settle();
    await settle();
    expect(vi.mocked(createVehicleActor)).toHaveBeenCalledTimes(2);

    const iceCreamActor = testActor('iceCream');
    secondActor.resolve(iceCreamActor);
    await secondRequest;

    expect(game.world.actor).toBe(iceCreamActor);
    expect(game.world.fleet.activeId()).toBe('iceCream');
    expect(onHudActive).toHaveBeenLastCalledWith('iceCream');
    expect(onAdd).toHaveBeenCalledWith(policeActor.object);
    expect(onAdd).toHaveBeenCalledWith(iceCreamActor.object);
    expect(onRemove).toHaveBeenCalledWith(policeActor.object);
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it('serializes a mission-required morph before the latest HUD selection', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    if (house === undefined) {
      throw new Error('The town has no houses');
    }

    game.activate('police');
    game.lightFire(house.id);
    const fireActor = deferred<TestVehicleActor>();
    const hudActor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor)
      .mockReturnValueOnce(fireActor.promise)
      .mockReturnValueOnce(hudActor.promise);
    const onHudActive = attached.hud.setActive as ReturnType<typeof vi.fn>;
    onHudActive.mockClear();
    vi.mocked(createVehicleActor).mockClear();

    const missionTap = game.tapAt(house.position, house.position);
    await settle();
    const selection = game.selectVehicle('iceCream');
    await Promise.resolve();

    // The mission-required fire morph owns the in-flight slot first.
    expect(vi.mocked(createVehicleActor)).toHaveBeenCalledTimes(1);
    expect(game.world.mission.snapshot().state).not.toBe('spawned');

    const fireVehicle = testActor('fire');
    fireActor.resolve(fireVehicle);
    await settle();
    expect(game.world.actor).toBe(fireVehicle);
    expect(onHudActive).toHaveBeenLastCalledWith('fire');

    const iceCreamVehicle = testActor('iceCream');
    hudActor.resolve(iceCreamVehicle);
    await Promise.all([selection, missionTap]);

    expect(game.world.actor).toBe(iceCreamVehicle);
    expect(game.world.fleet.activeId()).toBe('iceCream');
    expect(onHudActive).toHaveBeenLastCalledWith('iceCream');
  });

  it('keeps a helper-hand demo from overwriting a newer child tap', async () => {
    const { game, attached } = await booted();
    const house = attached.grid.houses[0];
    const motor = game.world.motor;
    const [childPoint] = attached.grid.spawnPoints;
    if (house === undefined || motor === undefined || childPoint === undefined) {
      throw new Error('The town, car, or spawn point is missing');
    }

    game.activate('police');
    game.lightFire(house.id);
    const actor = deferred<TestVehicleActor>();
    vi.mocked(createVehicleActor).mockClear();
    vi.mocked(createVehicleActor).mockReturnValueOnce(actor.promise);
    game.tickHelperHand(11, game.world.spawn);
    vi.spyOn(game.world.helperTrace, 'isDone').mockReturnValue(true);
    game.tickHelperHand(0.016, game.world.spawn);
    await settle();

    const onSetPath = vi.spyOn(motor, 'setPath');
    const childTap = game.tapAt(childPoint, childPoint);
    await Promise.resolve();
    expect(onSetPath).not.toHaveBeenCalled();

    actor.resolve(testActor('fire'));
    await Promise.all([childTap, settle()]);

    expect(onSetPath).toHaveBeenCalledTimes(1);
    expect(onSetPath.mock.calls[0]?.[0].destination).toEqual(childPoint);
  });
});
