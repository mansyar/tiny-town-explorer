import { createModelLibrary } from './assets/modelLibrary';
import type { SampledSound } from './audio/audioEngine';
import { collectObstacles } from './collision/collision';
import { createAbilityFx } from './feedback/abilityFx';
import { createPondWatcher } from './feedback/pondSplash';
import { createTargetRing } from './feedback/targetRing';
import { createFireFx } from './mission/fireFx';
import { createFireMission } from './mission/fireMission';
import { createFirePacer } from './mission/firePacer';
import { createHelperHand } from './mission/helperHand';
import { createHelperTrace } from './mission/helperTrace';
import { createIceCreamMission } from './mission/iceCreamMission';
import { createIceCreamPacer } from './mission/iceCreamPacer';
import {
  createCelebration,
  type MissionCelebrationDeps,
} from './mission/missionCelebration';
import { createMissionRotation } from './mission/missionRotation';
import { createOrderBeats } from './mission/orderFlow';
import { createOrderMarker } from './mission/orderMarker';
import { createParkMission } from './mission/parkMission';
import { createParkPickup } from './mission/parkPickup';
import { createPuppy } from './mission/puppyFx';
import { createHeartMarker, createPawMarker } from './mission/puppyMarker';
import { createPuppyMission } from './mission/puppyMission';
import { createPuppySpots } from './mission/puppySpots';
import { createServeGate } from './mission/serveGate';
import { createSunFx, type SunFacing } from './mission/sunFx';
import { mountParkedShadows } from './town/parkedShadows';
import { createPondDucks } from './town/pondDucks';
import type { TownGrid } from './town/townGrid';
import { mountTown } from './town/townRenderer';
import type { Vec2 } from './town/townTypes';
import { mountTrafficActors } from './traffic/trafficActors';
import { mountTrafficShadows } from './traffic/trafficShadows';
import { createTrafficSystem } from './traffic/trafficSystem';
import { createVehicleActor } from './vehicle/vehicleActor';
import { createVehicleMotor } from './vehicle/vehicleMotor';
import { createVehicleSystem } from './vehicle/vehicleSystem';

/**
 * The slice of the audio engine the controller calls. The engine itself is
 * built at the edge (`main.ts`) and handed in, so unit tests pass a fake and
 * the suite never touches Web Audio (FR2).
 */
export interface GameAudio {
  /** Fire a loaded sample. Silent until unlocked. */
  play(id: SampledSound): void;
  /** Play whatever the ability events call for, sampled or synthesized. */
  playAbility(events: readonly { readonly kind: string }[]): void;
  /** The dead-zone honk: a two-note toy beep. */
  honk(): void;
  /** The pond splash: a soft round drop of tones. */
  sploosh(): void;
  /** Set the engine's note from `VehicleSystem.engineRate`; `0` stops it. */
  setEngine(rate: number): void;
}

/**
 * The slice of the vehicle HUD the controller calls: dimming the ability
 * button while its one-shot runs. Everything else (selection, ability
 * dispatch, mute) is DOM wiring owned by `main.ts`.
 */
export interface GameHud {
  /** Dim the ability button while its one-shot is running. */
  setAbilityBusy(busy: boolean): void;
}

/**
 * The slice of the scene the controller calls: mounting and unmounting only.
 * `remove` lands with `swapVehicle` in Phase 3; until then the set stays
 * closed at these two members.
 */
export interface GameScene {
  /** Mount a node on the stage. */
  add(object: unknown): void;
  /** Unmount a node from the stage. */
  remove(object: unknown): void;
}

/**
 * The slice of the camera rig the controller calls. Phase 2 only needs the
 * facing for the sun effect; `setTarget`/`followSun` arrive with the vehicle
 * frame in Phase 4.
 */
export interface GameCamera {
  /** The live camera the sun effect reads for its facing. */
  readonly facing: SunFacing;
}

/** The dev-only calm-gap override, resolved at the edge and passed as data. */
export interface GameCalmGap {
  readonly minSeconds?: number;
  readonly maxSeconds?: number;
}

/** Everything `createGame` needs that it does not build itself. */
export interface GameDeps {
  readonly audio: GameAudio;
  readonly hud: GameHud;
  readonly scene: GameScene;
  readonly camera: GameCamera;
  readonly grid: TownGrid;
  readonly calmGap?: GameCalmGap;
}

/**
 * The world the controller owns (FR3). Synchronous members are built by
 * `createGame` before it returns; the mount slots (`town`, `traffic`,
 * `motor`, `actor`, …) land once {@link Game.ready} resolves. Phase 4 drops
 * this handle and closes the API to `{ advance, tapAt, honk, noteActivity }`.
 */
export interface GameWorld {
  /** Where the car spawns: grid data, known before a single model loads. */
  readonly spawn: Vec2;
  readonly fleet: ReturnType<typeof createVehicleSystem>;
  readonly ring: ReturnType<typeof createTargetRing>;
  readonly fx: ReturnType<typeof createAbilityFx>;
  readonly mission: ReturnType<typeof createFireMission>;
  readonly pacer: ReturnType<typeof createFirePacer>;
  readonly hand: ReturnType<typeof createHelperHand>;
  readonly fire: ReturnType<typeof createFireFx>;
  readonly helperTrace: ReturnType<typeof createHelperTrace>;
  readonly sun: ReturnType<typeof createSunFx>;
  readonly fireCelebration: ReturnType<typeof createCelebration>;
  readonly orderCelebration: ReturnType<typeof createCelebration>;
  readonly parkCelebration: ReturnType<typeof createCelebration>;
  readonly puppyCelebration: ReturnType<typeof createCelebration>;
  readonly orders: ReturnType<typeof createIceCreamMission>;
  readonly orderPacer: ReturnType<typeof createIceCreamPacer>;
  readonly rotation: ReturnType<typeof createMissionRotation>;
  readonly orderMarker: ReturnType<typeof createOrderMarker>;
  readonly orderBeats: ReturnType<typeof createOrderBeats>;
  readonly serveGate: ReturnType<typeof createServeGate>;
  readonly park: ReturnType<typeof createParkMission>;
  readonly parkPickup: ReturnType<typeof createParkPickup>;
  readonly puppySpots: ReturnType<typeof createPuppySpots>;
  readonly puppy: ReturnType<typeof createPuppyMission>;
  readonly pawMarker: ReturnType<typeof createPawMarker>;
  readonly heartMarker: ReturnType<typeof createHeartMarker>;
  readonly spotPup: ReturnType<typeof createPuppy>;
  readonly riderPup: ReturnType<typeof createPuppy>;
  town: Awaited<ReturnType<typeof mountTown>> | undefined;
  pondWatcher: ReturnType<typeof createPondWatcher> | undefined;
  pondDucks: ReturnType<typeof createPondDucks> | undefined;
  traffic: ReturnType<typeof createTrafficSystem> | undefined;
  trafficActors: Awaited<ReturnType<typeof mountTrafficActors>> | undefined;
  trafficShadows: ReturnType<typeof mountTrafficShadows>;
  motor: ReturnType<typeof createVehicleMotor> | undefined;
  actor: Awaited<ReturnType<typeof createVehicleActor>> | undefined;
}

/** The controller: the world it builds plus the frame that ticks it. */
export interface Game {
  readonly world: GameWorld;
  /** Resolves once the async mount (town, traffic, motor, actors) lands. */
  readonly ready: Promise<void>;
  /** One frame of the world-owned systems; safe to call before `ready`. */
  advance(deltaSeconds: number): void;
}

/**
 * Builds the game controller over the world (FR1, FR3, FR4). The world is
 * usable the moment this returns — `advance` guards every handle the async
 * mount has not landed yet — while the models stream in underneath, exactly
 * as `main.ts` boots today.
 */
export function createGame(deps: GameDeps): Game {
  const { audio, hud, scene, camera, grid, calmGap } = deps;

  // The car starts on the street, so the sky is on screen while the models
  // stream in.
  const spawn = grid.spawnPoints[0] ?? { x: 0, z: 0 };

  // The ring answers every tap, so the touch lands before the car has even
  // turned: its bloom is the only thing that says where the car was sent.
  const ring = createTargetRing();
  scene.add(ring.object);

  // Ability bursts and the morph puff: brief, chunky, and gone before a child
  // looks twice.
  const fx = createAbilityFx();
  scene.add(fx.object);

  // The missions need the town's lots, which the grid already holds: a pacer
  // that decides when a fire is due and where, the state machine that owns it,
  // the hand that helps after ten quiet seconds, and the fire and route trace
  // they draw. None of it waits on the models, so the loop can tick it from the
  // first frame.
  const mission = createFireMission();
  // Both pacers choose from the same lots. They never have to avoid each
  // other's pick, because the two missions never run at once.
  const houseLots = grid.houses.map((house) => ({
    id: house.id,
    position: house.position,
  }));
  const pacer = createFirePacer({ houses: houseLots });
  const hand = createHelperHand();
  const fire = createFireFx();
  scene.add(fire.object);
  const helperTrace = createHelperTrace();
  scene.add(helperTrace.object);
  // The town's own applause: a smiling sun that comes out when a fire is out.
  const sun = createSunFx();
  scene.add(sun.object);

  /**
   * One celebration per mission (FR3): recipes run through the shared module
   * so every completion is confetti/sun/cheer exactly as today, plus the
   * unified sparkle (FR4) — one extra burst at the same site, right after the
   * recipe's cheer, so the reward is never sound-only. The module's latch
   * makes it once per completion; rearms happen at each mission's start.
   */
  const celebrationDeps: MissionCelebrationDeps = {
    play: (what, at) => {
      if (what === 'sun') sun.show(at);
      else if (what === 'cheer') audio.play('cheer');
      else if (what === 'drop') audio.play('drop');
      else fx.burst(what, at, 0);
    },
    sparkle: (at) => fx.burst('sparkle', at, 0),
  };
  const fireCelebration = createCelebration('fire', celebrationDeps);
  const orderCelebration = createCelebration('iceCream', celebrationDeps);
  const parkCelebration = createCelebration('park', celebrationDeps);
  const puppyCelebration = createCelebration('puppy', celebrationDeps);

  // The second mission: a house that wants ice cream. The pacer decides when
  // and where, the state machine owns the delivery, the marker shows the order,
  // and the beats keep its cue and its celebration to one each per order.
  const orders = createIceCreamMission();
  const orderPacer = createIceCreamPacer({ houses: houseLots });
  // One shared calm gap decides *when* the town acts next and — never the
  // same mission twice — *who* goes: all four missions are in the pool, each
  // pacer still deciding *where* its own mission lands. The override arrives
  // as data from the edge, so this module never reads env or location (FR9).
  const rotation = createMissionRotation({
    missions: ['fire', 'iceCream', 'park', 'puppy'],
    ...calmGap,
  });
  const orderMarker = createOrderMarker();
  scene.add(orderMarker.object);
  const orderBeats = createOrderBeats();
  // Whether the kid has jingled since this order opened. Serve is a tap on the
  // house, but only on a truck that has already sang.
  const serveGate = createServeGate();

  // The third mission: litter under the wheels rather than a tap at range.
  // The FSM owns the errand, the pure pickup rules own collection, and the
  // bouncing field is the show they drive.
  const park = createParkMission();
  const parkPickup = createParkPickup();

  // The fourth: the pup hides until the siren finds it. The pending half of
  // the errand lives in Phase 3's session state; the spots, markers and the
  // two pup instances (the one waiting at the spot, and the tiny rider on
  // the car) are world objects owned here.
  const puppySpots = createPuppySpots({ grid });
  const puppy = createPuppyMission();
  const pawMarker = createPawMarker();
  scene.add(pawMarker.object);
  const heartMarker = createHeartMarker();
  scene.add(heartMarker.object);
  const spotPup = createPuppy();
  spotPup.visible = false;
  scene.add(spotPup);
  const riderPup = createPuppy();
  riderPup.visible = false;
  scene.add(riderPup);

  // The fleet is not on screen yet, but its engine curve is what gives the car
  // its voice, so the voice tracks the one vehicle that already drives.
  const fleet = createVehicleSystem();

  // The car and its motor arrive only once the town has been measured, because
  // the hitboxes *are* the mounted art. Until then the loop just holds the sky.
  let motor: GameWorld['motor'];
  let actor: GameWorld['actor'];
  // The wanderers and their actors mount across the same async window (the
  // town's GLBs are still loading), so the loop meets them as undefined too.
  let traffic: GameWorld['traffic'];
  let trafficActors: GameWorld['trafficActors'];
  let trafficShadows: GameWorld['trafficShadows'];
  // The pond's watcher and ducks mount across the same async window, so the
  // loop meets them as undefined too. The watcher only fires inside the
  // vehicle frame (Phase 4); until then it lives on the world handle.
  let pondDucks: GameWorld['pondDucks'];

  let abilityBusy = false;

  const world: GameWorld = {
    spawn,
    fleet,
    ring,
    fx,
    mission,
    pacer,
    hand,
    fire,
    helperTrace,
    sun,
    fireCelebration,
    orderCelebration,
    parkCelebration,
    puppyCelebration,
    orders,
    orderPacer,
    rotation,
    orderMarker,
    orderBeats,
    serveGate,
    park,
    parkPickup,
    puppySpots,
    puppy,
    pawMarker,
    heartMarker,
    spotPup,
    riderPup,
    town: undefined,
    pondWatcher: undefined,
    pondDucks: undefined,
    traffic: undefined,
    trafficActors: undefined,
    trafficShadows: undefined,
    motor: undefined,
    actor: undefined,
  };

  async function mount(): Promise<void> {
    const library = createModelLibrary();
    const town = await mountTown(grid, library);
    world.town = town;
    // The parked cars' faked shadows join the town's own graph: one static mesh
    // seated above the kerb top, so a car reads as resting on the street the way
    // the houses do rather than as a floating box.
    const parkedShadows = mountParkedShadows(grid);
    if (parkedShadows !== undefined) {
      town.group.add(parkedShadows.mesh);
    }

    // The pond's ducks waddle at the water's edge — scenery in the town's
    // own graph — and the watcher arms the splash the car raises.
    const watcher = createPondWatcher(grid);
    const ducks = createPondDucks(grid);
    world.pondWatcher = watcher;
    pondDucks = ducks;
    world.pondDucks = ducks;
    town.group.add(ducks.group);

    // Three of the town's own cars wander the rings on their own errands:
    // silent, seeded and sealed — the system says update/poses/footprints and
    // knows nothing of the camera, the engine note or the taps.
    const wanderers = createTrafficSystem({
      grid,
      // A fixed seed, so the town's wander replays exactly, launch after launch.
      seed: 20260923,
    });
    traffic = wanderers;
    world.traffic = wanderers;
    const actors = await mountTrafficActors(library, wanderers.poses());
    trafficActors = actors;
    world.trafficActors = actors;
    for (const object of actors.objects) {
      town.group.add(object);
    }
    const shadows = mountTrafficShadows(grid, wanderers);
    trafficShadows = shadows;
    world.trafficShadows = shadows;
    if (shadows !== undefined) {
      town.group.add(shadows.mesh);
    }
    scene.add(town.group);

    // Hitboxes come from the same measured models the town just mounted, so the
    // car cannot disagree with the art about where a wall is. The wanderers are
    // the one live feed: crashable like a cone, re-read every sweep.
    const statics = collectObstacles(grid, town.houseFootprints);
    const vehicle = createVehicleMotor({
      obstacles: statics,
      dynamicObstacles: () => traffic?.footprints() ?? [],
    });
    motor = vehicle;
    world.motor = vehicle;
    vehicle.snapTo(spawn);

    const spec = fleet.spec(fleet.activeId());
    const car = await createVehicleActor(library, spec.model, vehicle, {
      facingYaw: spec.facingYaw,
      fitLength: spec.fitLength,
    });
    scene.add(car.object);
    actor = car;
    world.actor = car;
  }

  /**
   * One frame of the world-owned systems, in the order the pieces depend on
   * it. The DOM-owned chrome (hold gate, parent panel, install hint) and the
   * vehicle frame (`tickVehicle`, the rig update) stay with `main.ts` until
   * Phase 4; everything here guards the handles the mount has not landed yet,
   * so calling it before `ready` only ticks what already exists.
   */
  function advance(deltaSeconds: number): void {
    // The wanderers go first, so the kid's sweep meets where they now stand.
    traffic?.update(deltaSeconds);
    trafficActors?.sync();
    trafficShadows?.sync();
    motor?.update(deltaSeconds);
    actor?.sync();
    ring.update(deltaSeconds);
    fx.update(deltaSeconds);
    pondDucks?.update(deltaSeconds);
    fire.update(deltaSeconds);
    orderMarker.update(deltaSeconds);
    helperTrace.update(deltaSeconds);
    sun.update(deltaSeconds, camera.facing);
    // The fleet ticks its own clock. A burst that is never updated never ends,
    // which leaves the ability button dimmed and every later press ignored.
    fleet.update(deltaSeconds);
    if (fleet.isBursting() !== abilityBusy) {
      abilityBusy = fleet.isBursting();
      hud.setAbilityBusy(abilityBusy);
    }
  }

  const ready = mount();

  return { world, ready, advance };
}
