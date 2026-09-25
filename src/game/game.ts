import { createModelLibrary } from './assets/modelLibrary';
import type { SampledSound } from './audio/audioEngine';
import { collectObstacles } from './collision/collision';
import { createAbilityFx } from './feedback/abilityFx';
import { createPondWatcher } from './feedback/pondSplash';
import { createTargetRing } from './feedback/targetRing';
import { createFireFx } from './mission/fireFx';
import {
  createFireMission,
  distanceBetween,
  FIRE_FLAME,
  fireAwaitsKid,
} from './mission/fireMission';
import { createFirePacer } from './mission/firePacer';
import { createHelperHand } from './mission/helperHand';
import { createHelperTrace } from './mission/helperTrace';
import { createIceCreamMission, ORDER_CONE } from './mission/iceCreamMission';
import { createIceCreamPacer } from './mission/iceCreamPacer';
import {
  createCelebration,
  type MissionCelebrationDeps,
} from './mission/missionCelebration';
import { missionFocus } from './mission/missionFocus';
import {
  markerArmed,
  markerTap,
  markerVisible,
  syncMarker,
} from './mission/missionMarkers';
import { createMissionRegistry, type MissionTapContext } from './mission/missionRegistry';
import { createMissionRotation } from './mission/missionRotation';
import {
  createOrderBeats,
  isTapOnHouse,
  MISSION_SNAP_RADIUS,
  orderIsOpen,
  resolveOrderTap,
} from './mission/orderFlow';
import { createOrderMarker } from './mission/orderMarker';
import { type LitterPiece, spawnParkLitter } from './mission/parkLitter';
import { createLitterField, type LitterField } from './mission/parkLitterFx';
import { createParkMission, PARK_FIELD, resolveParkTap } from './mission/parkMission';
import { createParkPickup, type PickupResult } from './mission/parkPickup';
import { createPuppy } from './mission/puppyFx';
import { createHeartMarker, createPawMarker } from './mission/puppyMarker';
import {
  createPuppyMission,
  PUPPY_HEART,
  PUPPY_PAW,
  resolvePuppyTap,
} from './mission/puppyMission';
import { createPuppySpots, type PuppySpot } from './mission/puppySpots';
import { createServeGate } from './mission/serveGate';
import { createSunFx, type SunFacing } from './mission/sunFx';
import { findPath } from './path/pathfinder';
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
import {
  type AbilityEvent,
  createVehicleSystem,
  VEHICLE_IDS,
  type VehicleId,
} from './vehicle/vehicleSystem';

/** How high the carried pup rides, on the roof of whichever car drives. */
const RIDE_HEIGHT = 0.28;
/** Seconds for the hop-out run to the owner's door (FR10). */
const DOOR_RUN_SECONDS = 0.7;

/** Which caller owns a serialized actor replacement. */
type VehicleRequestMode = 'mission' | 'selection' | 'direct';
type VehicleActor = Awaited<ReturnType<typeof createVehicleActor>>;

interface PendingVehicleRequest {
  readonly id: VehicleId;
  readonly mode: VehicleRequestMode;
  readonly generation: number;
  readonly resolve: (committed: boolean) => void;
}

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
  /** Light up the vehicle the kid is driving. */
  setActive(id: VehicleId): void;
  /** Point the ability button at the active vehicle's trick. */
  setAbility(id: VehicleId): void;
  /** Dim the ability button while its one-shot is running. */
  setAbilityBusy(busy: boolean): void;
  /** Show or hide the ability button; it doubles as the hose button. */
  setAbilityVisible(visible: boolean): void;
  /** Pulse the police button while the town waits for the siren. */
  setPolicePulse(pulsing: boolean): void;
  /**
   * Answer a switch tap the moment it arrives, before the actor has loaded, and
   * withdraw that answer when the request settles. `undefined` means none.
   */
  setPending(id: VehicleId | undefined): void;
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
  /**
   * Starts easing toward the car. Called inside the vehicle frame, before
   * `followSun`, so the shadow map is aimed where the camera is already going.
   * The rig's own `update` stays at the edge and runs after the game frame
   * (FR5), which is why this port declares no `update`.
   */
  setTarget(point: Vec2): void;
  /**
   * Aims the sun's shadow frustum at the car, snapped to the shadow map's
   * texels so the shadows never shimmer (FR7).
   */
  followSun(focus: { readonly x: number; readonly z: number }): void;
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
  /** The town data every placement and route is measured against. */
  readonly grid: TownGrid;
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
  /** The registry that owns tick/tap ordering and the town-wide focus. */
  readonly missions: ReturnType<typeof createMissionRegistry>;
  /** The live litter field, the pup's drawn round and the door run. */
  litter: readonly LitterPiece[];
  litterField: LitterField | undefined;
  puppyPending: boolean;
  puppySpot: PuppySpot | undefined;
  puppyOwnerHouseId: string | undefined;
  doorRun: { readonly from: Vec2; readonly to: Vec2; t: number } | undefined;
  /** The car's position for this frame's mission pass, set in `missionsTick`. */
  frameCarPosition: Vec2;
  library: ReturnType<typeof createModelLibrary> | undefined;
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
  /**
   * Resolves once the motor exists, before the car's first model has loaded.
   * The tap router is wired on this edge, exactly as it was inline in
   * `main.ts`; `ready` is the heavier "everything is on screen" signal.
   */
  readonly driven: Promise<void>;
  /** One frame of the whole game; safe to call before `ready`. */
  advance(deltaSeconds: number): void;
  /** The dead-zone honk: the ring answers the tap and the car says hello. */
  honk(at: Vec2): void;
  /** Any touch at all is a kid playing, so the hand restarts its patience. */
  noteActivity(): void;
  /** The kid picked a vehicle on the HUD: morph the fleet, then the car. */
  selectVehicle(id: VehicleId): Promise<void>;
  /** The car's live position, for the input router at the edge. */
  carPosition(): Vec2;
  /** Which vehicle is driving, for the HUD's opening state. */
  activeVehicle(): VehicleId;
  /** The parent panel's helper toggle: the hand helps, or stays out of it. */
  setHelperEnabled(enabled: boolean): void;
  /**
   * The registry pass for one frame: it records the car's position and gives
   * every mission its turn in registration order. Phase 4 folds this into
   * `advance` together with the pacers and the helper hand.
   */
  missionsTick(deltaSeconds: number, carPosition: Vec2): void;
  /** Lets the shared calm gap decide whose turn it is, one spawn per frame. */
  tickPacers(deltaSeconds: number): void;
  /** Applies one pickup or sweep to the field, the mission and the show. */
  absorb(result: PickupResult, voiceGulp: boolean): void;
  /** How far the car is from whatever is burning; infinity if nothing is. */
  distanceToFire(from: Vec2): number;
  /**
   * The ability button — also the helper hand's siren demo (FR12), so one
   * code path presses it whoever pressed.
   */
  pressAbility(): void;
  /**
   * The one place a destination tap is answered, whether the finger was a
   * child's or the helper hand's demo. `point` is where the car is being sent;
   * `aim` is where the finger landed, and every mission decision is made
   * against the aim.
   */
  tapAt(point: Vec2, aim?: Vec2): Promise<void>;
  /**
   * The hand's frame: what it points at, the trace it draws, the one demo tap
   * it owes, and dropping both when the town stops needing the kid.
   */
  tickHelperHand(deltaSeconds: number, carPosition: Vec2): void;
  /** Opens a clean-up: a fresh field, a reset collector, the town's chime. */
  startPark(): void;
  /** Draws the pup's round: hiding spot, owner house, whine and police ask. */
  startPuppy(): void;
  /** Puts a fire on a lot: mission state, visual and alarm in one step. */
  lightFire(houseId: string): boolean;
  /** Opens an order at a lot: mission state and cone icon in one step. */
  lightOrder(houseId: string): boolean;
  /** Morphs the fleet, telling the serve latch which truck now drives. */
  activate(id: VehicleId): void;
  /** Builds the replacement car, then swaps it in (never an empty frame). */
  swapVehicle(id: VehicleId): Promise<void>;
  /** The respond gesture for the park errand: become the truck, head over. */
  headToGarbageTruck(): Promise<boolean>;
  /** Whether serve is armed right now, read from the live car. */
  serveArmedNow(): boolean;
  /** FR10: hop out at the car, run to the door, then the town applauds. */
  deliverPuppy(ownerAt: Vec2): void;
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
  //
  // INVARIANT: every mount slot below is ONE object in two places — the local
  // the frame reads and the `world.*` field the contract suite observes. They
  // are assigned in pairs, on adjacent lines. If you ever assign only one, the
  // app keeps working off the local while the suite reads a stale mirror; the
  // cleaner fix is to read through `world` and delete the local.
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
  // The model library is the source every car actor is instantiated from, so
  // `swapVehicle` needs it long after the mount that created it.
  let library: GameWorld['library'];

  let abilityBusy = false;
  // Bonks are counted here, not at the edge: the engine chime belongs to the
  // car's frame, which is the controller's.
  let bonks = 0;
  // The tap router is wired the moment the motor exists, which is the same edge
  // `main.ts` used to build it on; `ready` waits for the car model as well.
  // `driven` has to reject as well as resolve: the edge awaits it first, so a
  // mount that dies before the car exists (a model fetch failing, on a first
  // offline visit) must surface there rather than park the boot forever.
  let signalDriven: () => void = () => {};
  let failDriven: (reason: unknown) => void = () => {};
  const driven = new Promise<void>((resolve, reject) => {
    signalDriven = resolve;
    failDriven = reject;
  });
  // Session state the moved rules close over: the fire's burst total, whether
  // the ability and serve affordances are currently showing, and the park and
  // puppy rounds in flight.
  let fireTotal = 0;
  let abilityVisible = true;
  let serveArmed = false;
  // The demo tap the hand owes, once its trace has finished drawing.
  let pendingDemo: Vec2 | undefined;

  // Intent ownership lives here, at the controller edge. A tap gets a
  // generation before it awaits mission work; only the newest tap may commit a
  // route after that await. Vehicle requests are serialized separately so an
  // actor load can finish, commit, and only then let the next request start.
  let latestDestinationGeneration = 0;
  let latestVehicleRequest = 0;
  let latestSelectionGeneration = 0;
  // The generation of the switch tap the HUD is currently answering, if any. It
  // is the same counter the arbitration already stamps, so the pending answer
  // and the intent that supersedes it can never disagree about who is newest.
  let pendingSelectionGeneration: number | undefined;
  let vehicleBusy = false;
  const vehicleQueue: PendingVehicleRequest[] = [];
  const vehicleReadyWaiters: Array<() => void> = [];

  // The seam that lets new missions join without a new tick/tap block here
  // (spec FR13): every mission contributes, the registry owns order, and
  // FR12's `missionFocus` is handed in as the one town-wide focus resolver —
  // a single four-mission answer for the hand, siren marker included. Every
  // contribution reads session state off `world` at call time, so the registry
  // is safe to build before the handle that carries it.
  const missions = createMissionRegistry(
    [
      {
        id: 'fire',
        tick: (delta) => {
          mission.update(delta, distanceToFire(world.frameCarPosition));
          tickFireMission(world.frameCarPosition);
        },
        tap: async (aim, context) => {
          const burning = firePoint();
          const claimed =
            markerTap(FIRE_FLAME, {
              state: mission.snapshot().state,
              onTarget:
                burning !== undefined &&
                distanceBetween(aim, burning) <= MISSION_SNAP_RADIUS,
            }) === 'respond';
          if (!claimed) {
            return false;
          }
          mission.respond();
          if (fleet.activeId() !== 'fire') {
            await requestVehicle('fire', 'mission', context);
          }
          return true;
        },
        isIdle: () => mission.snapshot().state === 'idle',
      },
      {
        id: 'iceCream',
        tick: (delta) => {
          orders.update(delta, distanceToOrder(world.frameCarPosition));
          tickOrderMission(world.frameCarPosition);
        },
        tap: async (aim, context) => {
          const waiting = orderPoint();
          const action =
            waiting === undefined
              ? 'ignore'
              : resolveOrderTap({
                  state: orders.snapshot().state,
                  onOrderHouse: isTapOnHouse(aim, waiting),
                  armed: serveArmedNow(),
                });
          if (action === 'respond') {
            orders.respond();
            if (fleet.activeId() !== 'iceCream') {
              await requestVehicle('iceCream', 'mission', context);
            }
            return true;
          }
          if (action === 'serve') {
            orders.serve();
            return true;
          }
          return false;
        },
        isIdle: () => orders.snapshot().state === 'idle',
      },
      {
        id: 'park',
        tick: (delta) => tickParkMission(delta, world.frameCarPosition),
        tap: async (aim, context) => {
          const onPiece = world.litter.some(
            (piece) => distanceBetween(aim, piece.position) <= MISSION_SNAP_RADIUS,
          );
          if (resolveParkTap({ state: park.snapshot().state, onPiece }) !== 'respond') {
            return false;
          }
          await headToGarbageTruck(context);
          return true;
        },
        isIdle: () => park.snapshot().state === 'idle',
      },
      {
        id: 'puppy',
        tick: (delta) => tickPuppyMission(delta, world.frameCarPosition),
        tap: async (aim) => {
          const ownerAt = ownerPoint();
          const action = resolvePuppyTap({
            state: puppy.snapshot().state,
            onOwnerHouse: ownerAt !== undefined && isTapOnHouse(aim, ownerAt),
            armed: puppy.isDeliverReady(),
          });
          if (action !== 'deliver' || ownerAt === undefined) {
            return false;
          }
          deliverPuppy(ownerAt);
          return true;
        },
        // The pending whine is half an errand with nowhere else to go: busy
        // until the siren answers it (FR6), or until it is carried home.
        isIdle: () => !world.puppyPending && puppy.snapshot().state === 'idle',
      },
    ],
    (carPosition) =>
      missionFocus({
        fireState: mission.snapshot().state,
        fireAt: firePoint(),
        orderState: orders.snapshot().state,
        orderAt: orderPoint(),
        parkState: park.snapshot().state,
        parkAt: nearestLitterPoint(carPosition),
        puppyPending: world.puppyPending,
        puppyState: puppy.snapshot().state,
        puppySpotAt: world.puppySpot?.position,
        puppyOwnerAt: puppy.snapshot().state === 'carrying' ? ownerPoint() : undefined,
        carPosition,
      }),
  );
  const world: GameWorld = {
    grid,
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
    missions,
    litter: [],
    litterField: undefined,
    puppyPending: false,
    puppySpot: undefined,
    puppyOwnerHouseId: undefined,
    doorRun: undefined,
    frameCarPosition: spawn,
    library: undefined,
    town: undefined,
    pondWatcher: undefined,
    pondDucks: undefined,
    traffic: undefined,
    trafficActors: undefined,
    trafficShadows: undefined,
    motor: undefined,
    actor: undefined,
  };

  /**
   * Morphs the fleet by whichever route asked for it, and tells the serve
   * latch on the way: a jingle only survives on the ice-cream truck, so
   * leaving it abandons the serve and coming back needs a fresh one.
   */
  function activate(id: VehicleId): void {
    fleet.setActive(id);
    serveGate.noteActiveVehicle(id);
    hud.setActive(id);
    hud.setAbility(id);
  }

  /**
   * The car's live position. Before the mount lands there is no motor, and the
   * spawn is where the motor starts anyway — so a pre-mount read is still the
   * car's own truth rather than a guess.
   */
  function carPosition(): Vec2 {
    return motor?.position ?? spawn;
  }

  async function loadVehicleActor(id: VehicleId): Promise<VehicleActor | undefined> {
    // The cast is only reachable once the car is on the road: the HUD and the
    // tap router are both wired after the mount.
    if (library === undefined || motor === undefined) {
      return undefined;
    }
    const spec = fleet.spec(id);
    try {
      return await createVehicleActor(library, spec.model, motor, {
        facingYaw: spec.facingYaw,
        fitLength: spec.fitLength,
        castsShadow: false,
      });
    } catch {
      // A failed load leaves the last known-good actor, fleet ID, HUD, and
      // route untouched. The model library can retry this request later.
      return undefined;
    }
  }

  function restoreVehicleActor(
    next: VehicleActor,
    previousActor: VehicleActor | undefined,
    previousActive: VehicleId,
    mode: VehicleRequestMode,
    removedPrevious: boolean,
    addedNext: boolean,
  ): void {
    // These ports are intentionally tiny, but keep a failed commit from
    // poisoning the queue or leaving a half-mounted actor behind.
    if (addedNext) {
      scene.remove(next.object);
    }
    if (removedPrevious && previousActor !== undefined) {
      scene.add(previousActor.object);
    }
    actor = previousActor;
    world.actor = previousActor;
    if (mode !== 'direct') {
      activate(previousActive);
    }
  }

  function commitVehicleActor(
    next: VehicleActor,
    id: VehicleId,
    mode: VehicleRequestMode,
  ): boolean {
    const previousActor = actor;
    const previousActive = fleet.activeId();
    let removedPrevious = false;
    let addedNext = false;
    try {
      // Build first, then commit: no frame is empty and no failed load can
      // partially change the live fleet.
      if (previousActor !== undefined) {
        scene.remove(previousActor.object);
        removedPrevious = true;
      }
      actor = next;
      world.actor = next;
      scene.add(next.object);
      addedNext = true;
      if (mode !== 'direct') {
        activate(id);
      }
      fx.burst('poof', motor?.position ?? spawn, motor?.heading() ?? 0);
      audio.play('poof');
      return true;
    } catch {
      restoreVehicleActor(
        next,
        previousActor,
        previousActive,
        mode,
        removedPrevious,
        addedNext,
      );
      return false;
    }
  }

  async function runVehicleRequest(request: PendingVehicleRequest): Promise<void> {
    try {
      const next = await loadVehicleActor(request.id);
      request.resolve(
        next !== undefined && commitVehicleActor(next, request.id, request.mode),
      );
    } catch {
      // Keep the queue alive even if a future port grows an unexpected throw.
      request.resolve(false);
    } finally {
      // Every accepted request ends in exactly one of commit or failure, so
      // this is the one place the answer has to be withdrawn from. Arbitration
      // still decides what became active; this only stops claiming otherwise.
      settlePendingSelection(request);
    }
  }

  /**
   * Withdraws the pending answer, but only from the request that raised it. A
   * superseded request settling must leave the newest tap's answer standing, or
   * a fast triple-tap would blink the ring off the vehicle the child last chose.
   */
  function settlePendingSelection(request: PendingVehicleRequest): void {
    if (pendingSelectionGeneration !== request.generation) {
      return;
    }
    pendingSelectionGeneration = undefined;
    hud.setPending(undefined);
  }

  function waitForVehicleReady(): Promise<void> {
    if (!vehicleBusy && vehicleQueue.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => vehicleReadyWaiters.push(resolve));
  }

  function releaseVehicleReadyWaiters(): void {
    if (vehicleBusy || vehicleQueue.length > 0) {
      return;
    }
    const waiters = vehicleReadyWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }

  function drainVehicleQueue(): void {
    if (vehicleBusy) {
      return;
    }
    const request = vehicleQueue.shift();
    if (request === undefined) {
      releaseVehicleReadyWaiters();
      return;
    }
    if (
      request.mode === 'selection' &&
      request.generation !== latestSelectionGeneration
    ) {
      // Skipped as stale. It is still a terminal outcome for the answer, but
      // only if it is the one holding it — a newer tap has already claimed it.
      settlePendingSelection(request);
      request.resolve(false);
      drainVehicleQueue();
      return;
    }

    // Starting the first accepted request before returning makes it genuinely
    // in-flight; later selections can only wait behind it.
    vehicleBusy = true;
    void runVehicleRequest(request).finally(() => {
      vehicleBusy = false;
      drainVehicleQueue();
      releaseVehicleReadyWaiters();
    });
  }

  /**
   * Queues one actor replacement behind every earlier replacement. A mission
   * request is never cancelled once its FSM claim is visible; a queued HUD
   * selection may be skipped when a newer HUD selection has arrived.
   */
  function enqueueVehicleRequest(
    id: VehicleId,
    mode: VehicleRequestMode,
  ): Promise<boolean> {
    const generation = ++latestVehicleRequest;
    if (mode === 'selection') {
      latestSelectionGeneration = generation;
      // Answer the tap here, in the same synchronous turn as the pointer event:
      // everything below this line may await an actor load, and the button must
      // not sit mute through it. Only a real tap answers — a mission's own morph
      // and a direct swap are things the child did not ask for.
      pendingSelectionGeneration = generation;
      hud.setPending(id);
    }

    let resolveRequest!: (committed: boolean) => void;
    const result = new Promise<boolean>((resolve) => {
      resolveRequest = resolve;
    });
    vehicleQueue.push({ id, mode, generation, resolve: resolveRequest });
    drainVehicleQueue();
    return result;
  }

  async function requestVehicle(
    id: VehicleId,
    mode: Exclude<VehicleRequestMode, 'direct'>,
    context?: MissionTapContext,
  ): Promise<boolean> {
    const committed = await enqueueVehicleRequest(id, mode);
    if (!committed) {
      context?.morphFailed();
    }
    return committed;
  }

  async function swapVehicle(id: VehicleId): Promise<void> {
    // Keep the controller seam serialised even for direct test/helper callers;
    // direct swaps do not claim the active-ID commit owned by mission/HUD paths.
    await enqueueVehicleRequest(id, 'direct');
  }

  /** The respond gesture for the park errand: become the truck, head over. */
  async function headToGarbageTruck(context?: MissionTapContext): Promise<boolean> {
    if (!park.respond()) {
      return false;
    }
    if (fleet.activeId() !== 'garbage') {
      return requestVehicle('garbage', 'mission', context);
    }
    return true;
  }

  /** Where the fire is burning, if one is. */
  function firePoint(): Vec2 | undefined {
    const id = mission.snapshot().fireHouseId;
    const lot = id === undefined ? undefined : grid.houseById(id);
    return lot?.position;
  }

  /** How far the car is from whatever is burning; infinity if nothing is. */
  function distanceToFire(from: Vec2): number {
    const burning = firePoint();
    return burning === undefined
      ? Number.POSITIVE_INFINITY
      : distanceBetween(from, burning);
  }

  /** Where the ice-cream order is waiting, if one is. */
  function orderPoint(): Vec2 | undefined {
    const id = orders.snapshot().orderHouseId;
    const lot = id === undefined ? undefined : grid.houseById(id);
    return lot?.position;
  }

  /** How far the car is from the ordering house; infinity if nothing is. */
  function distanceToOrder(from: Vec2): number {
    const waiting = orderPoint();
    return waiting === undefined
      ? Number.POSITIVE_INFINITY
      : distanceBetween(from, waiting);
  }

  /**
   * Whether serve is armed right now, read from the live car: the ice-cream
   * truck is driving, it has jingled since the order opened, and it is within
   * `SERVE_RANGE` of the house. The same answer drives both the ring the kid
   * sees and the serve tap itself, so what is shown and what is honoured can
   * never disagree.
   */
  function serveArmedNow(): boolean {
    const waiting = orderPoint();
    if (waiting === undefined) {
      return false;
    }
    return serveGate.canServe(
      fleet.activeId(),
      orders.isServeReady(distanceBetween(carPosition(), waiting)),
    );
  }

  /**
   * The fire's feedback: how the remaining bursts are drawn, whether the hose
   * button belongs on screen, and its celebration.
   */
  function tickFireMission(carPosition: Vec2): void {
    const snapshot = mission.snapshot();

    // The hose arrives with proximity and leaves with it. While a fire is
    // burning the ability button *is* the hose button, so it only exists once
    // the car is close enough to use it. An open order keeps the button: its
    // jingle is how the kid answers one, wherever the truck happens to be.
    const showAbility = !fireAwaitsKid(snapshot.state);
    if (showAbility !== abilityVisible) {
      abilityVisible = showAbility;
      hud.setAbilityVisible(showAbility);
    }

    if (snapshot.fireHouseId === undefined) {
      fire.extinguish();
    } else {
      fire.setBursts(snapshot.burstsLeft, fireTotal);
    }

    if (snapshot.state === 'complete') {
      fireCelebration.fire(firePoint() ?? carPosition);
    }
  }

  /**
   * The order's feedback: the cone icon over the house, the jingle cue that
   * arrives with it, and the handoff celebration.
   */
  function tickOrderMission(carPosition: Vec2): void {
    const snapshot = orders.snapshot();

    // The serve affordance: the ring blooms on the house on the frame serve is
    // first armed, so "you are close enough, on the right truck, and it sang"
    // reads as a place to tap rather than a state the kid has to deduce.
    const armed = markerArmed(ORDER_CONE, snapshot.state, serveArmedNow());
    if (armed && !serveArmed) {
      const waiting = orderPoint();
      if (waiting !== undefined) {
        ring.show(waiting);
      }
    }
    serveArmed = armed;

    // The cone icon floats over the ordering house while the order is open, and
    // the celebration clears it: one order, one beat of attention. Level-synced
    // through the shared marker layer (FR2).
    syncMarker(orderIsOpen(snapshot.state), orderMarker);

    // Cues fire on the edge, never on the state: `spawned` lasts as long as the
    // kid takes, but the jingle is owed once.
    const beats = orderBeats(snapshot);
    if (beats.orderOpened) {
      // Sound and visual pair: the cone icon's other half is the truck's own
      // jingle, which is exactly the hint about which vehicle delivers it.
      audio.playAbility([{ kind: 'jingle' }]);
    }
    if (beats.served) {
      // Two pairs, both complete: the cone handoff is the `cones` burst the
      // free-play ability throws, with the same one-shot it sounds for `cones`
      // there, and the win is the shared celebration plus the unified sparkle
      // - nothing here is heard without being seen, or seen without a sound.
      orderCelebration.fire(orderPoint() ?? carPosition);
    }
  }

  /**
   * One frame of the clean-up (FR1–FR5): the field bounces, the wheels
   * collect whatever they pass, and the FSM learns how far the litter is. The
   * pickup rules own *which* pieces and *when*; this owns the show around
   * them — poofs, gulps, and the one celebration.
   */
  function tickParkMission(delta: number, carPosition: Vec2): void {
    if (markerVisible(PARK_FIELD, park.snapshot().state)) {
      world.litterField?.update(delta);
    }
    if (world.litter.length > 0) {
      absorb(parkPickup.update(delta, carPosition, world.litter), true);
    }
    park.update(delta, distanceToLitter(carPosition));
  }

  /**
   * Applies one pickup or sweep to the field, the mission and the show.
   * `voiceGulp` is false for sweeps: the truck's cast already sounded the one
   * gulp for the group (FR4), while each drive-over piece earns its own (FR3).
   */
  function absorb(result: PickupResult, voiceGulp: boolean): void {
    if (result.collected.length === 0) {
      return;
    }
    // Driving over the litter can *be* the answer (FR2's gesture, drive-first):
    // the first piece taken while still `spawned` responds the mission — FSM
    // synchronously, so `finish()` below always sees an answered errand — and
    // morphs the fleet if the kid brought the wrong truck.
    if (park.snapshot().state === 'spawned') {
      void headToGarbageTruck();
    }
    const taken = new Set(result.collected.map((piece) => piece.id));
    world.litter = world.litter.filter((piece) => !taken.has(piece.id));
    for (const piece of result.collected) {
      world.litterField?.remove(piece.id);
      fx.burst('poof', piece.position, 0);
    }
    if (voiceGulp && result.gulp) {
      audio.play('gulp');
    }
    const last = result.collected[result.collected.length - 1];
    if (result.complete && park.finish() && last !== undefined) {
      // `complete` only ever rides with a non-empty take (parkPickup's rule),
      // so the last piece — and where it fell — is always here to celebrate.
      parkCelebration.fire(last.position);
    }
  }

  /**
   * One frame of the errand (FR6–FR10): distances in, the edges that matter
   * out — the scoop (paw clears, pup rides, heart blooms), the rider on the
   * car, the run to the door, and the quiet stage reset after the cheer.
   */
  function tickPuppyMission(delta: number, carPosition: Vec2): void {
    pawMarker.update(delta);
    heartMarker.update(delta);

    const spotAt = world.puppySpot?.position;
    const ownerAt = ownerPoint();
    const before = puppy.snapshot().state;
    puppy.update(
      delta,
      spotAt === undefined
        ? Number.POSITIVE_INFINITY
        : distanceBetween(carPosition, spotAt),
      ownerAt === undefined
        ? Number.POSITIVE_INFINITY
        : distanceBetween(carPosition, ownerAt),
    );
    const after = puppy.snapshot().state;

    // One marker at a time, by state — the shared layer owns which (FR2):
    // the paw while searching, the heart while carrying, neither otherwise.
    syncMarker(markerVisible(PUPPY_PAW, after), pawMarker);
    syncMarker(markerVisible(PUPPY_HEART, after), heartMarker, ownerAt);

    if (before === 'searching' && after === 'carrying') {
      // FR8/FR9: the paw was the last thing to point at; now the pup rides —
      // the markers themselves followed the state rule above; this is the bark.
      spotPup.visible = false;
      riderPup.visible = true;
      audio.play('bark');
    }
    if (after === 'carrying') {
      // The little passenger stands on the roof, wherever the car is headed.
      riderPup.position.set(carPosition.x, RIDE_HEIGHT, carPosition.z);
    }

    advanceDoorRun(delta);
    if (before === 'complete' && after === 'idle') {
      clearPuppyStage();
    }
  }

  /** The hop-out glide: the spot pup closes from the car to the door (FR10). */
  function advanceDoorRun(delta: number): void {
    if (world.doorRun === undefined) {
      return;
    }
    world.doorRun.t = Math.min(1, world.doorRun.t + delta / DOOR_RUN_SECONDS);
    spotPup.position.x =
      world.doorRun.from.x +
      (world.doorRun.to.x - world.doorRun.from.x) * world.doorRun.t;
    spotPup.position.z =
      world.doorRun.from.z +
      (world.doorRun.to.z - world.doorRun.from.z) * world.doorRun.t;
    if (world.doorRun.t >= 1) {
      world.doorRun = undefined;
    }
  }

  /** The pup went inside; the street is clean for whatever is drawn next. */
  function clearPuppyStage(): void {
    spotPup.visible = false;
    riderPup.visible = false;
    pawMarker.hide();
    heartMarker.hide();
  }

  /** FR10: hop out at the car, run to the door, then the town applauds. */
  function deliverPuppy(ownerAt: Vec2): void {
    if (!puppy.deliver()) {
      return;
    }
    heartMarker.hide();
    riderPup.visible = false;
    spotPup.position.set(world.frameCarPosition.x, 0, world.frameCarPosition.z);
    spotPup.visible = true;
    world.doorRun = {
      from: { ...world.frameCarPosition },
      to: ownerAt,
      t: 0,
    };
    puppyCelebration.fire(ownerAt);
  }

  /** Opens a clean-up: a fresh field, a reset collector, the town's chime. */
  function startPark(): void {
    if (!park.spawn()) {
      return;
    }
    world.litter = spawnParkLitter({ grid });
    parkPickup.reset();
    if (world.litterField !== undefined) {
      scene.remove(world.litterField.object);
      world.litterField.dispose();
    }
    const field = createLitterField(world.litter);
    world.litterField = field;
    scene.add(field.object);
    audio.play('chime');
    parkCelebration.rearm();
  }

  /**
   * Draws the pup's round (FR6): hiding spot, owner house ≥2 tiles away, the
   * quiet whine, and the pending flag that makes the town busy and the hand
   * point at the siren button until the kid answers.
   */
  function startPuppy(): void {
    if (puppy.snapshot().state !== 'idle' || world.puppyPending) {
      return;
    }
    const spot = puppySpots.drawSpot();
    const ownerId = puppySpots.drawOwnerHouse(spot);
    if (ownerId === undefined) {
      return;
    }
    world.puppySpot = spot;
    world.puppyOwnerHouseId = ownerId;
    world.puppyPending = true;
    spotPup.position.set(spot.position.x, 0, spot.position.z);
    spotPup.visible = true;
    riderPup.visible = false;
    audio.play('bark');
    // FR6: the pulse is the quiet town's ask; the siren's answer clears it.
    hud.setPolicePulse(true);
    puppyCelebration.rearm();
  }

  /** The nearest live piece of litter, for the hand's destination (FR12). */
  function nearestLitterPoint(from: Vec2): Vec2 | undefined {
    let bestDistance = Number.POSITIVE_INFINITY;
    let best: Vec2 | undefined;
    for (const piece of world.litter) {
      const distance = distanceBetween(from, piece.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = piece.position;
      }
    }
    return best;
  }

  /** How far the truck is from the nearest piece; infinity when none remain. */
  function distanceToLitter(from: Vec2): number {
    const nearest = nearestLitterPoint(from);
    return nearest === undefined
      ? Number.POSITIVE_INFINITY
      : distanceBetween(from, nearest);
  }

  /** Where the owner's door is for this round, if the pup has been drawn. */
  function ownerPoint(): Vec2 | undefined {
    return world.puppyOwnerHouseId === undefined
      ? undefined
      : grid.houseById(world.puppyOwnerHouseId)?.position;
  }

  /** Puts a fire on a lot: mission state, visual and alarm in one step. */
  function lightFire(houseId: string): boolean {
    const lot = grid.houseById(houseId);
    if (lot === undefined || !mission.spawn(houseId)) {
      return false;
    }
    fire.place(lot.position);
    fireTotal = mission.snapshot().burstsLeft;
    fire.setBursts(fireTotal, fireTotal);
    fireCelebration.rearm();
    sun.hide();
    audio.play('chime');
    return true;
  }

  /** Opens an order at a lot: mission state and cone icon in one step. */
  function lightOrder(houseId: string): boolean {
    const lot = grid.houseById(houseId);
    if (lot === undefined || !orders.spawn(houseId)) {
      return false;
    }
    orderMarker.place(lot.position);
    orderMarker.show();
    // A fresh order starts with no jingle: the one that served the last cone
    // must not carry over into this delivery.
    serveGate.noteOrderOpened();
    orderCelebration.rearm();
    return true;
  }

  /**
   * One shared calm gap for the town (spec FR11): the rotation says when the
   * town is next due and, never the same mission twice, whose turn it is — so
   * only one spawn can be considered per frame, and the chosen mission's own
   * pacer picks where it lands.
   */
  function tickPacers(delta: number): void {
    const due = rotation.update(delta, missions.isBusy());

    if (due === 'fire') {
      const house = pacer.pickHouse();
      if (house !== undefined) {
        lightFire(house);
      }
    } else if (due === 'iceCream') {
      const house = orderPacer.pickHouse();
      if (house !== undefined) {
        lightOrder(house);
      }
    } else if (due === 'park') {
      startPark();
    } else if (due === 'puppy') {
      startPuppy();
    }
  }

  /**
   * The registry's frame: it records the car's position and gives every
   * mission its turn in order (FSM then feedback). The pacers and the helper
   * hand follow in `tickMissions`, which stays at the edge until Phase 4.
   */
  function missionsTick(delta: number, carPosition: Vec2): void {
    world.frameCarPosition = carPosition;
    missions.tick(delta);
  }

  /**
   * The ability button — also the helper hand's siren demo (FR12), so one
   * code path presses it whoever pressed. Each cast sounds and shows itself
   * through the events below; the siren event's second job is answering the
   * pup (FR7), while with no pup waiting it is exactly today's free-play
   * siren. The cast is the active vehicle's, so only the police car's press
   * can be an answer — the vehicle gate lives in the fleet itself.
   */
  function pressAbility(): void {
    const events = fleet.requestAbility();
    if (events.length === 0) {
      return;
    }
    audio.playAbility(events);
    // The jingle is the key that arms serve: remember it until the kid
    // morphs away or the order closes.
    if (events.some((event) => event.kind === 'jingle')) {
      serveGate.noteJingle();
    }
    for (const event of events) {
      applyAbilityEvent(event);
    }
    // Water on a live fire is the rescue, not just the trick: the press that
    // sprays is also the press that counts a burst off the fire.
    if (
      events.some((event) => event.kind === 'spray') &&
      mission.isHoseReady(distanceToFire(carPosition()))
    ) {
      mission.spray();
    }
  }

  /**
   * One cast event, seen and heard: the bursts every vehicle has always had,
   * the garbage truck's sweep (FR4), and the siren's second job (FR7).
   */
  function applyAbilityEvent(event: AbilityEvent): void {
    switch (event.kind) {
      case 'spray':
      case 'cones':
        fx.burst(event.kind, carPosition(), motor?.heading() ?? 0);
        break;
      case 'gulp':
        fx.burst('gulp', carPosition(), motor?.heading() ?? 0);
        // FR4: the same press also sweeps a nearby cluster — the cast's one
        // gulp voices the group, each piece poofing on its own way out.
        if (world.litter.length > 0) {
          absorb(parkPickup.sweep(carPosition(), world.litter), false);
        }
        break;
      case 'siren':
        onSirenCast();
        break;
      default:
        // The ice-cream jingle is heard rather than seen; its cones are
        // their own event and burst above.
        break;
    }
  }

  /**
   * The police car's siren (FR7): the flash is the free-play siren it has
   * always been. If the town is waiting on a drawn pup, the press is also the
   * answer — it latches once, blooms the paw over the spot, and the yip says
   * the puppy heard you.
   */
  function onSirenCast(): void {
    fx.flash(carPosition());
    if (!world.puppyPending || !puppy.siren()) {
      return;
    }
    world.puppyPending = false;
    hud.setPolicePulse(false);
    const spot = world.puppySpot;
    if (spot !== undefined) {
      pawMarker.place(spot.position);
    }
    pawMarker.show();
    audio.play('bark');
  }

  /**
   * The one place a destination tap is answered, whether the finger was a
   * child's or the helper hand's demo.
   *
   * Answering the alarm is the same gesture as driving somewhere: tap the
   * burning house and the car becomes the fire truck and heads over. That is
   * also how the camera reaches the fire - it follows the car, so the car going
   * there *is* the pan, with no separate camera state to get stuck in.
   *
   * An ice-cream order answers to the same gesture with one tap doing two jobs:
   * tap the ordering house and the car becomes the truck and heads over, tap it
   * again once serve is armed and one cone changes hands.
   *
   * `point` is where the car is being sent; `aim` is where the finger landed.
   * They differ when the router snapped the tap onto a prop, and every mission
   * decision is made against the aim - a cone beside an ordered house must not
   * be able to steal the serve, nor a hydrant beside a burning one the hose.
   */
  async function tapAt(point: Vec2, aim: Vec2 = point): Promise<void> {
    const generation = ++latestDestinationGeneration;
    const vehicle = motor;
    if (vehicle === undefined) {
      return;
    }
    let morphFailed = false;
    const context: MissionTapContext = {
      morphFailed: () => {
        morphFailed = true;
      },
    };

    // Ring before routing: a tap is answered within a frame even on the way to
    // a destination the road network cannot reach.
    ring.show(point);
    audio.play('tap');

    await answerMissions(aim, context);
    await waitForVehicleReady();

    // Mission claims are atomic, but their destination route is not. A newer
    // tap owns the route, and a failed required morph owns no route at all.
    if (morphFailed || generation !== latestDestinationGeneration) {
      return;
    }

    const route = findPath(grid, vehicle.position, point);
    if (route === undefined) {
      return;
    }
    // A fresh destination is the child driving off, so any ability still in
    // flight ends where it is rather than playing out behind a departing car.
    fleet.interruptBurst();
    vehicle.setPath(route);
  }

  /**
   * Whether that tap also answers a mission, before it becomes a destination.
   *
   * Each mission claims taps through the registry in registration order: fire
   * answers the burning house, ice-cream the ordering house (or serves a cone
   * when armed). The first claim wins; later missions never see that aim.
   */
  async function answerMissions(aim: Vec2, context?: MissionTapContext): Promise<void> {
    await missions.tap(aim, context);
  }

  /**
   * The hand helps while a mission is still waiting on the kid; once the hose
   * (or the serve) is in reach the kid has arrived and needs no help. Its trace
   * runs first and the poke at the end is the demo tap itself, which is the same
   * destination tap a finger would have made - so the demo answers whichever
   * mission is waiting.
   */
  function tickHelperHand(delta: number, carPosition: Vec2): void {
    // Whichever mission is still waiting on the kid is what the hand points
    // at; `missionFocus` is the registry's resolver, so this is the one
    // four-mission answer (FR12) — the siren marker included.
    const focus = missions.focus(carPosition);
    // The hand is ticked even when the town is quiet, with nothing to point at:
    // between missions its patience resets, so a new one always gets the full
    // ten seconds rather than inheriting a count from an empty street.
    const tap = hand.update(delta, {
      missionActive: focus.awaiting,
      destination: focus.destination,
    });
    if (tap !== undefined) {
      // The siren button lives on the HUD, not in the world: the demo makes the
      // press itself — into the police car first, so the cast is a siren.
      if (focus.target === 'siren') {
        void demoSiren();
      } else {
        const route = findPath(grid, carPosition, tap);
        helperTrace.show(
          route === undefined
            ? [carPosition, tap]
            : [...route.waypoints, route.destination],
        );
        pendingDemo = tap;
      }
    }

    // A trace, and the demo tap it announced, belong only to a mission that
    // still needs the kid; when the town goes quiet, both are dropped.
    if (!missions.isBusy()) {
      helperTrace.hide();
      pendingDemo = undefined;
    }

    if (pendingDemo !== undefined && helperTrace.isDone()) {
      const demo = pendingDemo;
      pendingDemo = undefined;
      helperTrace.hide();
      void tapAt(demo);
    }
  }

  /** The hand's demo of the siren button (FR12): be the police, then press. */
  async function demoSiren(): Promise<void> {
    if (fleet.activeId() !== 'police') {
      const committed = await requestVehicle('police', 'mission');
      if (!committed) {
        return;
      }
    }
    pressAbility();
  }

  /**
   * Fills the library's cache for every vehicle the child could switch into,
   * while the boot overlay is still up.
   *
   * The child is already waiting here, every one of these four GLBs is already
   * precached, and the work that follows — traffic actors, then the hero car —
   * is all in flight regardless. So the warm is close to free, and it is the
   * difference between a switch being a cache hit and a switch being a fetch
   * nobody has started (FR2).
   *
   * Never awaited. A slow or failing warm must not hold the boot, and a warm
   * that fails is not a boot failure: `load` evicts a failed model from the
   * cache, so the tap that needs it retries, which is the existing recovery
   * path and needs no help from here.
   */
  function warmFleet(): void {
    for (const id of VEHICLE_IDS) {
      // `load`, not `instantiate`: the warm wants the parsed template, and must
      // not build a scene graph for a vehicle nobody is driving yet.
      void library?.load(fleet.spec(id).model).catch(() => {
        // Nothing to do, and nothing to say. A switch retries.
      });
    }
  }

  async function mount(): Promise<void> {
    library = createModelLibrary();
    world.library = library;
    const town = await mountTown(grid, library, undefined, {
      // Add the synchronous base as soon as the renderer has it. The later
      // shadows, ducks, traffic actors, and car still join the same group.
      onBaseReady: (group) => scene.add(group),
    });
    world.town = town;
    // Started only once the base is on screen, so the warm rides behind the
    // traffic and hero loads instead of competing with the town's own.
    warmFleet();
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

    // Six ambient actors wander the rings on their own errands: four cars and
    // two small creatures.
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
    // The town group was added from the base-ready seam above.

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
    signalDriven();

    const spec = fleet.spec(fleet.activeId());
    const car = await createVehicleActor(library, spec.model, vehicle, {
      facingYaw: spec.facingYaw,
      fitLength: spec.fitLength,
      castsShadow: false,
    });
    // A mission or explicit selection may have committed while the first model
    // was still loading. The boot actor is only the default; never overwrite a
    // replacement that won during the driven-before-ready window.
    if (actor !== undefined) {
      return;
    }
    scene.add(car.object);
    actor = car;
    world.actor = car;
  }

  /**
   * The car's frame: the engine note rides its speed, its bonks chime, the
   * missions read its position, and the pond raises one splash per entry
   * (FR4) — its droplet poof (FR10) the visual counterpart the sploosh
   * always shares, so muted play still reads the water.
   */
  function tickVehicle(delta: number): void {
    if (motor === undefined) {
      return;
    }
    // The camera eases after the car, which is the only thing that moves.
    camera.setTarget(motor.position);
    // The sun's shadows ride with the car (FR7): the map stays texel-still
    // while the town slides beneath it.
    camera.followSun(motor.position);
    // The engine note rides the speed: silent parked, chugging under way.
    audio.setEngine(motor.isDriving() ? fleet.engineRate(motor.speed()) : 0);
    if (motor.bonkCount() > bonks) {
      bonks = motor.bonkCount();
      audio.play('bonk');
    }
    tickMissions(delta, motor.position);
    if (world.pondWatcher?.note(motor.position)) {
      fx.burst('poof', motor.position, motor.heading());
      audio.sploosh();
    }
  }

  /**
   * One tick of the town's own story: the registry gives every mission its
   * frame in order (FSM then feedback), the pacers decide when the town is due
   * another, and the hand offers one tap if the kid has gone quiet with one
   * still waiting.
   */
  function tickMissions(delta: number, carPosition: Vec2): void {
    missionsTick(delta, carPosition);
    tickPacers(delta);
    tickHelperHand(delta, carPosition);
  }

  /**
   * One frame of the whole game, in the order the pieces depend on it. Named
   * rather than inlined so the loop and any verification drive the same code.
   * The rig's own easing stays at the edge and runs after this returns (FR5),
   * so the camera never lags a frame behind the car it is chasing.
   *
   * Everything here guards the handles the mount has not landed yet, so
   * calling it before `ready` only ticks what already exists.
   */
  function advance(deltaSeconds: number): void {
    // The wanderers go first, so the kid's sweep meets where they now stand.
    traffic?.update(deltaSeconds);
    trafficActors?.sync(deltaSeconds);
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
    // This edge used to carry a `hud !== undefined` guard. It does not need one
    // because the port no-ops before the HUD is built, and because nothing can
    // arm a burst that early: only the fire truck bursts, and the sole pre-HUD
    // caller (the helper hand's siren demo) casts the police car's zero-second
    // siren. If a cast ever gains a burst, restore the old guard.
    if (fleet.isBursting() !== abilityBusy) {
      abilityBusy = fleet.isBursting();
      hud.setAbilityBusy(abilityBusy);
    }
    tickVehicle(deltaSeconds);
  }

  /** The dead-zone honk: the ring answers the tap and the car says hello. */
  function honk(at: Vec2): void {
    ring.show(at);
    audio.honk();
  }

  /** Any touch at all is a kid playing, so the hand restarts its patience. */
  function noteActivity(): void {
    hand.noteActivity();
  }

  /** The kid picked a vehicle on the HUD: queue the latest explicit request. */
  async function selectVehicle(id: VehicleId): Promise<void> {
    await requestVehicle(id, 'selection');
  }

  /** The car's live position, for the input router at the edge. */
  function carAt(): Vec2 {
    return carPosition();
  }

  /** Which vehicle is driving, for the HUD's opening state. */
  function activeVehicle(): VehicleId {
    return fleet.activeId();
  }

  /** The parent panel's helper toggle: the hand helps, or stays out of it. */
  function setHelperEnabled(enabled: boolean): void {
    hand.setEnabled(enabled);
  }

  const ready = mount();
  // A mount that fails before the car exists never reaches `signalDriven`, so
  // the failure is handed to `driven` as well — the edge is waiting there.
  void ready.catch(failDriven);

  return {
    world,
    ready,
    driven,
    advance,
    tapAt,
    honk,
    noteActivity,
    selectVehicle,
    pressAbility,
    carPosition: carAt,
    activeVehicle,
    setHelperEnabled,
    // The rule handles below are the contract suite's surface, not the edge's:
    // `main.ts` reaches the game through the entries above and nothing else.
    // They are what lets `game.test.ts` pin each rule in isolation instead of
    // re-deriving it from a whole frame (AC3).
    missionsTick,
    tickPacers,
    absorb,
    distanceToFire,
    tickHelperHand,
    startPark,
    startPuppy,
    lightFire,
    lightOrder,
    activate,
    swapVehicle,
    headToGarbageTruck,
    serveArmedNow,
    deliverPuppy,
  };
}
