import { PCFShadowMap, WebGLRenderer } from 'three';
import { createModelLibrary } from './game/assets/modelLibrary';
import { createAudioEngine, type SampledSound } from './game/audio/audioEngine';
import { SOUND_MODELS } from './game/audio/audioRegistry';
import { createCameraRig } from './game/camera';
import { collectObstacles } from './game/collision/collision';
import { createAbilityFx } from './game/feedback/abilityFx';
import { createTargetRing } from './game/feedback/targetRing';
import { createHoldGate } from './game/hud/holdGate';
import {
  createInstallHint,
  HINT_SESSION_KEY,
  platformFrom,
  shouldShowHint,
} from './game/hud/installHint';
import { createParentPanel } from './game/hud/parentPanel';
import { createVehicleHud, type VehicleHud } from './game/hud/vehicleHud';
import { createInputRouter, ndcFromPoint } from './game/input/inputRouter';
import { calmGapOverride } from './game/mission/devCalmGap';
import { createFireFx } from './game/mission/fireFx';
import { createFirePacer } from './game/mission/firePacer';
import { createHelperHand } from './game/mission/helperHand';
import { createHelperTrace } from './game/mission/helperTrace';
import { createIceCreamMission, ORDER_CONE } from './game/mission/iceCreamMission';
import { createIceCreamPacer } from './game/mission/iceCreamPacer';
import {
  createCelebration,
  type MissionCelebrationDeps,
} from './game/mission/missionCelebration';
import { missionFocus } from './game/mission/missionFocus';
import {
  createMissionManager,
  distanceBetween,
  FIRE_FLAME,
  fireAwaitsKid,
} from './game/mission/missionManager';
import {
  markerArmed,
  markerTap,
  markerVisible,
  syncMarker,
} from './game/mission/missionMarkers';
import { createMissionRegistry } from './game/mission/missionRegistry';
import { createMissionRotation } from './game/mission/missionRotation';
import {
  createOrderBeats,
  isTapOnHouse,
  MISSION_SNAP_RADIUS,
  orderIsOpen,
  resolveOrderTap,
} from './game/mission/orderFlow';
import { createOrderMarker } from './game/mission/orderMarker';
import { type LitterPiece, spawnParkLitter } from './game/mission/parkLitter';
import { createLitterField, type LitterField } from './game/mission/parkLitterFx';
import {
  createParkMission,
  PARK_FIELD,
  resolveParkTap,
} from './game/mission/parkMission';
import { createParkPickup, type PickupResult } from './game/mission/parkPickup';
import { createPuppy } from './game/mission/puppyFx';
import { createHeartMarker, createPawMarker } from './game/mission/puppyMarker';
import {
  createPuppyMission,
  PUPPY_HEART,
  PUPPY_PAW,
  resolvePuppyTap,
} from './game/mission/puppyMission';
import { createPuppySpots, type PuppySpot } from './game/mission/puppySpots';
import { createServeGate } from './game/mission/serveGate';
import { createSunFx } from './game/mission/sunFx';
import { findPath } from './game/path/pathfinder';
import { startRenderLoop } from './game/renderLoop';
import { createScene } from './game/scene';
import { mountParkedShadows } from './game/town/parkedShadows';
import { createTownGrid } from './game/town/townGrid';
import { mountTown } from './game/town/townRenderer';
import type { Vec2 } from './game/town/townTypes';
import {
  createVehicleActor,
  type VehicleActorOptions,
} from './game/vehicle/vehicleActor';
import { createVehicleMotor, type VehicleMotor } from './game/vehicle/vehicleMotor';
import {
  type AbilityEvent,
  createVehicleSystem,
  type VehicleId,
} from './game/vehicle/vehicleSystem';

/** How high the carried pup rides, on the roof of whichever car drives. */
const RIDE_HEIGHT = 0.28;
/** Seconds for the hop-out run to the owner's door (FR10). */
const DOOR_RUN_SECONDS = 0.7;

/**
 * Creates the single WebGL renderer. Antialiasing, soft shadows, and a pixel
 * ratio capped at 2 keep the iPad-9th-gen frame budget safe on Retina
 * displays.
 */
function createRenderer(container: HTMLElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  container.append(renderer.domElement);
  return renderer;
}

async function main(): Promise<void> {
  const container = document.querySelector<HTMLElement>('#app');
  if (container === null) {
    throw new Error('Bootstrap failed: #app container missing from index.html');
  }

  const renderer = createRenderer(container);
  const { scene } = createScene();
  const grid = createTownGrid();

  // The car starts on the street and the camera opens on it, so the sky is on
  // screen while the models stream in.
  const spawn = grid.spawnPoints[0] ?? { x: 0, z: 0 };
  const rig = createCameraRig(container.clientWidth / container.clientHeight);
  rig.snapTo(spawn);

  // ResizeObserver covers window resizes and orientation changes alike,
  // including the initial layout pass.
  const observer = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    rig.resize(width / height);
  });
  observer.observe(container);

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
  const mission = createMissionManager();
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
  // same mission twice (spec FR11) — *who* goes: all four missions are in
  // the pool, each pacer below still deciding *where* its own mission lands.
  //
  // Dev-only, and dropped from production builds: `?calmGap=2` shortens the
  // gap so a manual walkthrough can see all four missions back to back
  // instead of waiting the shipped 60-90s between each. Nothing else about
  // the rotation changes — the busy pause and the never-twice rule hold.
  const calmGap = import.meta.env.DEV
    ? calmGapOverride(window.location.search)
    : undefined;
  const rotation = createMissionRotation({
    missions: ['fire', 'iceCream', 'park', 'puppy'],
    ...calmGap,
  });
  const orderMarker = createOrderMarker();
  scene.add(orderMarker.object);
  const orderBeats = createOrderBeats();
  // Whether the kid has jingled since this order opened. Serve is a tap on the
  // house, but only on a truck that has already sang (spec AC2).
  const serveGate = createServeGate();

  // The third mission: litter under the wheels rather than a tap at range
  // (FR1–FR5). The FSM owns the errand, the pure pickup rules own collection,
  // and the bouncing field is the show they drive.
  const park = createParkMission();
  const parkPickup = createParkPickup();

  // The fourth: the pup hides until the siren finds it (FR6–FR10). `pending`
  // is the pre-siren half of the errand — whine played, HUD hint owed — and it
  // counts as busy so the town never runs a second mission beside it.
  const puppySpots = createPuppySpots({ grid });
  const puppy = createPuppyMission();
  const pawMarker = createPawMarker();
  scene.add(pawMarker.object);
  const heartMarker = createHeartMarker();
  scene.add(heartMarker.object);
  // Two pup instances: the one waiting at the spot, and the tiny rider on the
  // car. The spot one reappears at the door for the run home (FR10).
  const spotPup = createPuppy();
  spotPup.visible = false;
  scene.add(spotPup);
  const riderPup = createPuppy();
  riderPup.visible = false;
  scene.add(riderPup);

  // Bursts the fire started with, for the flame's size; one celebration per
  // fire; whether the ability button is on screen; the demo tap the hand owes.
  let fireTotal = 0;
  let abilityVisible = true;
  let serveArmed = false;
  let pendingDemo: Vec2 | undefined;
  // The live litter field, the pup's drawn round, and the door run in flight:
  // each set by its own spawn and cleared when its mission goes idle.
  let litter: readonly LitterPiece[] = [];
  let litterField: LitterField | undefined;
  let puppyPending = false;
  let puppySpot: PuppySpot | undefined;
  let puppyOwnerHouseId: string | undefined;
  let doorRun: { from: Vec2; to: Vec2; t: number } | undefined;
  // The car's position for this frame's mission pass, set in `tickMissions`.
  let frameCarPosition: Vec2 = spawn;

  // The seam that lets new missions join without a new tick/tap block here
  // (spec FR13): every mission contributes, the registry owns order, and
  // FR12's `missionFocus` is handed in as the one town-wide focus resolver —
  // a single four-mission answer for the hand, siren marker included.
  const missions = createMissionRegistry(
    [
      {
        id: 'fire',
        tick: (delta) => {
          mission.update(delta, distanceToFire(frameCarPosition));
          tickFireMission(frameCarPosition);
        },
        tap: async (aim) => {
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
            activate('fire');
            await swapVehicle('fire');
          }
          return true;
        },
        isIdle: () => mission.snapshot().state === 'idle',
      },
      {
        id: 'iceCream',
        tick: (delta) => {
          orders.update(delta, distanceToOrder(frameCarPosition));
          tickOrderMission(frameCarPosition);
        },
        tap: async (aim) => {
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
              activate('iceCream');
              await swapVehicle('iceCream');
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
        tick: (delta) => tickParkMission(delta, frameCarPosition),
        tap: async (aim) => {
          const onPiece = litter.some(
            (piece) => distanceBetween(aim, piece.position) <= MISSION_SNAP_RADIUS,
          );
          if (resolveParkTap({ state: park.snapshot().state, onPiece }) !== 'respond') {
            return false;
          }
          await headToGarbageTruck();
          return true;
        },
        isIdle: () => park.snapshot().state === 'idle',
      },
      {
        id: 'puppy',
        tick: (delta) => tickPuppyMission(delta, frameCarPosition),
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
        isIdle: () => !puppyPending && puppy.snapshot().state === 'idle',
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
        puppyPending,
        puppyState: puppy.snapshot().state,
        puppySpotAt: puppySpot?.position,
        puppyOwnerAt: puppy.snapshot().state === 'carrying' ? ownerPoint() : undefined,
        carPosition,
      }),
  );

  // Sound waits for a gesture. The context and its samples are prepared up
  // front so the very first tap has something to play; only `unlock` (below,
  // on the first pointerdown) makes any of it audible.
  const audio = createAudioEngine();
  void Promise.all(
    // Object.entries widens every key to `string`; SOUND_MODELS keys are the
    // closed SampledSound union, so the assertion restores what the record knows.
    (Object.entries(SOUND_MODELS) as [SampledSound, string][]).map(([id, url]) =>
      audio.load(id, url),
    ),
  );

  // The fleet is not on screen yet, but its engine curve is what gives the car
  // its voice, so the voice tracks the one vehicle that already drives.
  const fleet = createVehicleSystem();
  const fleetActorOptions = (id: VehicleId): VehicleActorOptions => {
    const spec = fleet.spec(id);
    return { facingYaw: spec.facingYaw, fitLength: spec.fitLength };
  };

  // The parent settings, and the only way in: a three-second hold on the gear.
  const gate = createHoldGate();
  const panel = createParentPanel({
    onToggle: (id, on) => {
      if (id === 'sfx') {
        audio.setMuted(!on);
        hud?.setMuted(!on);
        return;
      }
      hand.setEnabled(on);
    },
  });
  document.body.append(panel.element);
  panel.element.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    gate.press();
  });
  // Any way the press can end counts as letting go: lifting, the system
  // cancelling it, or the finger sliding off the gear.
  for (const ending of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    panel.element.addEventListener(ending, () => {
      gate.release();
      panel.setHoldProgress(0);
    });
  }

  // The one-time nudge to put the game on the home screen: session-scoped, and
  // never shown to someone already playing from the home screen.
  const installHint = createInstallHint(platformFrom(navigator.userAgent));
  let hinted = false;
  try {
    hinted = window.sessionStorage.getItem(HINT_SESSION_KEY) !== null;
  } catch {
    // Safari in private mode refuses sessionStorage. A hint is not worth a throw.
    hinted = false;
  }
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes `navigator.standalone`; lib.dom does not type it, so
    // the assertion is the only way to read the flag the platform sets.
    (navigator as { readonly standalone?: boolean }).standalone === true;
  if (shouldShowHint({ installed, hintedThisSession: hinted })) {
    try {
      window.sessionStorage.setItem(HINT_SESSION_KEY, 'yes');
    } catch {
      // As above: the hint has still been shown.
    }
    document.body.append(installHint.element);
    installHint.show();
  }

  // The car and its motor arrive only once the town has been measured, because
  // the hitboxes *are* the mounted art. Until then the loop just holds the sky.
  let motor: VehicleMotor | undefined;
  let actor: Awaited<ReturnType<typeof createVehicleActor>> | undefined;

  let bonks = 0;
  let hud: VehicleHud | undefined;
  let abilityBusy = false;

  startRenderLoop(renderer, scene, rig.camera, ({ delta }) => advance(delta));

  const library = createModelLibrary();
  const town = await mountTown(grid, library);
  // The parked cars' faked shadows join the town's own graph: one static mesh
  // seated above the kerb top, so a car reads as resting on the street the way
  // the houses do rather than as a floating box.
  const parkedShadows = mountParkedShadows(grid);
  if (parkedShadows !== undefined) {
    town.group.add(parkedShadows.mesh);
  }
  scene.add(town.group);

  // Hitboxes come from the same measured models the town just mounted, so the
  // car cannot disagree with the art about where a wall is.
  const vehicle = createVehicleMotor({
    obstacles: collectObstacles(grid, town.houseFootprints),
  });
  motor = vehicle;
  vehicle.snapTo(spawn);
  rig.snapTo(spawn);

  // Every tap is answered: a destination becomes a route the car drives, and a
  // tap under the car is a honk (its squish and sound join the feedback pass).
  // Taps that arrive while a route is running simply replace it.
  const router = createInputRouter({
    camera: rig.camera,
    grid,
    getCarPosition: () => vehicle.position,
  });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    // The first gesture is the only thing that lets the browser start audio.
    void audio.unlock();
    // Any touch at all is a kid playing, so the hand restarts its patience.
    hand.noteActivity();
    const rect = renderer.domElement.getBoundingClientRect();
    const command = router.tapAt(ndcFromPoint(event.clientX, event.clientY, rect));
    if (command.kind === 'honk') {
      ring.show(command.at);
      audio.honk();
      return;
    }
    if (!router.isCurrent(command)) {
      return;
    }
    void tapAt(command.target, command.landed);
  });

  const car = await createVehicleActor(
    library,
    fleet.spec(fleet.activeId()).model,
    vehicle,
    fleetActorOptions(fleet.activeId()),
  );
  scene.add(car.object);
  actor = car;

  const swapVehicle = async (id: VehicleId): Promise<void> => {
    const next = await createVehicleActor(
      library,
      fleet.spec(id).model,
      vehicle,
      fleetActorOptions(id),
    );
    // The replacement is built before the old one goes, so no frame is empty.
    if (actor !== undefined) {
      scene.remove(actor.object);
    }
    actor = next;
    scene.add(next.object);
    fx.burst('poof', vehicle.position, vehicle.heading());
    audio.play('poof');
  };

  const hudControls = createVehicleHud({
    onSelect: (id) => {
      activate(id);
      void swapVehicle(id);
    },
    onAbility: () => pressAbility(),
    onMute: (muted) => audio.setMuted(muted),
  });
  hud = hudControls;
  document.body.append(hudControls.element);
  hudControls.setActive(fleet.activeId());
  hudControls.setAbility(fleet.activeId());

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
      mission.isHoseReady(distanceToFire(vehicle.position))
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
        fx.burst(event.kind, vehicle.position, vehicle.heading());
        break;
      case 'gulp':
        fx.burst('gulp', vehicle.position, vehicle.heading());
        // FR4: the same press also sweeps a nearby cluster — the cast's one
        // gulp voices the group, each piece poofing on its own way out.
        if (litter.length > 0) {
          absorb(parkPickup.sweep(vehicle.position, litter), false);
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
    fx.flash(vehicle.position);
    if (!puppyPending || !puppy.siren()) {
      return;
    }
    puppyPending = false;
    hud?.setPolicePulse(false);
    const spot = puppySpot;
    if (spot !== undefined) {
      pawMarker.place(spot.position);
    }
    pawMarker.show();
    audio.play('bark');
  }

  /**
   * Morphs the fleet by whichever route asked for it, and tells the serve latch
   * on the way: a jingle only survives on the ice-cream truck, so leaving it
   * abandons the serve and coming back needs a fresh one (spec AC2).
   */
  function activate(id: VehicleId): void {
    fleet.setActive(id);
    serveGate.noteActiveVehicle(id);
    hud?.setActive(id);
    hud?.setAbility(id);
  }
  /**
   * One frame of the whole game, in the order the pieces depend on it. Named
   * rather than inlined so the loop and any verification drive the same code.
   */
  function advance(delta: number): void {
    motor?.update(delta);
    actor?.sync();
    ring.update(delta);
    fx.update(delta);
    fire.update(delta);
    orderMarker.update(delta);
    helperTrace.update(delta);
    sun.update(delta, rig.camera);
    // The gear fills its ring while it is held, and the settings open on the
    // frame the hold completes - once, however long the finger stays down.
    if (gate.isHolding()) {
      panel.setHoldProgress(gate.progress());
    }
    if (gate.update(delta)) {
      gate.release();
      panel.setHoldProgress(0);
      panel.show();
    }
    installHint.update(delta);
    // The fleet ticks its own clock. A burst that is never updated never ends,
    // which leaves the ability button dimmed and every later press ignored.
    fleet.update(delta);
    if (hud !== undefined && fleet.isBursting() !== abilityBusy) {
      abilityBusy = fleet.isBursting();
      hud.setAbilityBusy(abilityBusy);
    }
    // The camera eases after the car, which is the only thing that moves.
    if (motor !== undefined) {
      rig.setTarget(motor.position);
      // The engine note rides the speed: silent parked, chugging under way.
      audio.setEngine(motor.isDriving() ? fleet.engineRate(motor.speed()) : 0);
      if (motor.bonkCount() > bonks) {
        bonks = motor.bonkCount();
        audio.play('bonk');
      }
      tickMissions(delta, motor.position);
    }
    rig.update(delta);
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
      orders.isServeReady(distanceBetween(vehicle.position, waiting)),
    );
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
    // Ring before routing: a tap is answered within a frame even on the way to
    // a destination the road network cannot reach.
    ring.show(point);
    audio.play('tap');

    await answerMissions(aim);

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
  async function answerMissions(aim: Vec2): Promise<void> {
    await missions.tap(aim);
  }

  /**
   * One tick of the town's own story: the registry gives every mission its
   * frame in order (FSM then feedback), the pacers decide when the town is due
   * another, and the hand offers one tap if the kid has gone quiet with one
   * still waiting.
   */
  function tickMissions(delta: number, carPosition: Vec2): void {
    frameCarPosition = carPosition;
    // Both missions arm and disarm from a fresh distance every frame: arriving
    // arms the hose, driving off takes it away again. That is what makes either
    // mission interruptible instead of cancellable.
    missions.tick(delta);

    tickPacers(delta);
    tickHelperHand(delta, carPosition);

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
      hud?.setAbilityVisible(showAbility);
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
      litterField?.update(delta);
    }
    if (litter.length > 0) {
      absorb(parkPickup.update(delta, carPosition, litter), true);
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
    litter = litter.filter((piece) => !taken.has(piece.id));
    for (const piece of result.collected) {
      litterField?.remove(piece.id);
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

  /** The respond gesture (FR2): become the garbage truck and head over. */
  async function headToGarbageTruck(): Promise<boolean> {
    if (!park.respond()) {
      return false;
    }
    if (fleet.activeId() !== 'garbage') {
      activate('garbage');
      await swapVehicle('garbage');
    }
    return true;
  }

  /**
   * One frame of the errand (FR6–FR10): distances in, the edges that matter
   * out — the scoop (paw clears, pup rides, heart blooms), the rider on the
   * car, the run to the door, and the quiet stage reset after the cheer.
   */
  function tickPuppyMission(delta: number, carPosition: Vec2): void {
    pawMarker.update(delta);
    heartMarker.update(delta);

    const spotAt = puppySpot?.position;
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
    if (doorRun === undefined) {
      return;
    }
    doorRun.t = Math.min(1, doorRun.t + delta / DOOR_RUN_SECONDS);
    spotPup.position.x = doorRun.from.x + (doorRun.to.x - doorRun.from.x) * doorRun.t;
    spotPup.position.z = doorRun.from.z + (doorRun.to.z - doorRun.from.z) * doorRun.t;
    if (doorRun.t >= 1) {
      doorRun = undefined;
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
    spotPup.position.set(frameCarPosition.x, 0, frameCarPosition.z);
    spotPup.visible = true;
    doorRun = { from: { ...frameCarPosition }, to: ownerAt, t: 0 };
    puppyCelebration.fire(ownerAt);
  }

  /** Opens a clean-up: a fresh field, a reset collector, the town's chime. */
  function startPark(): void {
    if (!park.spawn()) {
      return;
    }
    litter = spawnParkLitter({ grid });
    parkPickup.reset();
    if (litterField !== undefined) {
      scene.remove(litterField.object);
    }
    litterField = createLitterField(litter);
    scene.add(litterField.object);
    audio.play('chime');
    parkCelebration.rearm();
  }

  /**
   * Draws the pup's round (FR6): hiding spot, owner house ≥2 tiles away, the
   * quiet whine, and the pending flag that makes the town busy and the hand
   * point at the siren button until the kid answers.
   */
  function startPuppy(): void {
    if (puppy.snapshot().state !== 'idle' || puppyPending) {
      return;
    }
    const spot = puppySpots.drawSpot();
    const ownerId = puppySpots.drawOwnerHouse(spot);
    if (ownerId === undefined) {
      return;
    }
    puppySpot = spot;
    puppyOwnerHouseId = ownerId;
    puppyPending = true;
    spotPup.position.set(spot.position.x, 0, spot.position.z);
    spotPup.visible = true;
    riderPup.visible = false;
    audio.play('bark');
    // FR6: the pulse is the quiet town's ask; the siren's answer clears it.
    hud?.setPolicePulse(true);
    puppyCelebration.rearm();
  }

  /** The nearest live piece of litter, for the hand's destination (FR12). */
  function nearestLitterPoint(from: Vec2): Vec2 | undefined {
    let bestDistance = Number.POSITIVE_INFINITY;
    let best: Vec2 | undefined;
    for (const piece of litter) {
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
    return puppyOwnerHouseId === undefined
      ? undefined
      : grid.houseById(puppyOwnerHouseId)?.position;
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
    if (tap === undefined) {
      return;
    }
    // The siren button lives on the HUD, not in the world: the demo makes the
    // press itself — into the police car first, so the cast is a siren.
    if (focus.target === 'siren') {
      void demoSiren();
      return;
    }
    const route = findPath(grid, carPosition, tap);
    helperTrace.show(
      route === undefined ? [carPosition, tap] : [...route.waypoints, route.destination],
    );
    pendingDemo = tap;
  }

  /** The hand's demo of the siren button (FR12): be the police, then press. */
  async function demoSiren(): Promise<void> {
    if (fleet.activeId() !== 'police') {
      activate('police');
      await swapVehicle('police');
    }
    pressAbility();
  }
}

await main();
