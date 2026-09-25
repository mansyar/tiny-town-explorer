import { describe, expect, it, vi } from 'vitest';
import { createGame, type GameDeps } from './game';
import { mountParkedShadows } from './town/parkedShadows';
import { createTownGrid } from './town/townGrid';
import { mountTrafficShadows } from './traffic/trafficShadows';
import { createVehicleActor } from './vehicle/vehicleActor';

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
    expect(Object.keys(attached.hud).sort()).toEqual([
      'setAbility',
      'setAbilityBusy',
      'setAbilityVisible',
      'setActive',
      'setPolicePulse',
    ]);
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
