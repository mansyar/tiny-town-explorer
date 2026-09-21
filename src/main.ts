import { PCFShadowMap, WebGLRenderer } from 'three';
import { createModelLibrary } from './game/assets/modelLibrary';
import { TOWN_MODELS } from './game/assets/modelRegistry';
import { createAudioEngine, type SampledSound } from './game/audio/audioEngine';
import { SOUND_MODELS } from './game/audio/audioRegistry';
import { createCameraRig } from './game/camera';
import { collectObstacles } from './game/collision/collision';
import { createAbilityFx } from './game/feedback/abilityFx';
import { createTargetRing } from './game/feedback/targetRing';
import { createVehicleHud, type VehicleHud } from './game/hud/vehicleHud';
import { createInputRouter, ndcFromPoint } from './game/input/inputRouter';
import { createFireFx } from './game/mission/fireFx';
import { createFirePacer } from './game/mission/firePacer';
import { createHelperHand } from './game/mission/helperHand';
import { createHelperTrace } from './game/mission/helperTrace';
import {
  createMissionManager,
  distanceBetween,
  type MissionSnapshot,
} from './game/mission/missionManager';
import { createSunFx } from './game/mission/sunFx';
import { findPath } from './game/path/pathfinder';
import { startRenderLoop } from './game/renderLoop';
import { createScene } from './game/scene';
import { createTownGrid } from './game/town/townGrid';
import { mountTown } from './game/town/townRenderer';
import type { Vec2 } from './game/town/townTypes';
import {
  createVehicleActor,
  type VehicleActorOptions,
} from './game/vehicle/vehicleActor';
import { createVehicleMotor, type VehicleMotor } from './game/vehicle/vehicleMotor';
import { createVehicleSystem, type VehicleId } from './game/vehicle/vehicleSystem';

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

  // The mission needs the town's lots, which the grid already holds: a pacer
  // that decides when a fire is due and where, the state machine that owns it,
  // the hand that helps after ten quiet seconds, and the fire and route trace
  // they draw. None of it waits on the models, so the loop can tick it from the
  // first frame.
  const mission = createMissionManager();
  const pacer = createFirePacer({
    houses: grid.houses.map((house) => ({
      id: house.id,
      position: house.position,
    })),
  });
  const hand = createHelperHand();
  const fire = createFireFx();
  scene.add(fire.object);
  const helperTrace = createHelperTrace();
  scene.add(helperTrace.object);
  // The town's own applause: a smiling sun that comes out when a fire is out.
  const sun = createSunFx();
  scene.add(sun.object);

  // Bursts the fire started with, for the flame's size; one celebration per
  // fire; whether the ability button is on screen; the demo tap the hand owes.
  let fireTotal = 0;
  let celebrated = false;
  let abilityVisible = true;
  let pendingDemo: Vec2 | undefined;

  /** How close a tap must land to count as aiming at the burning house. */
  const SnapToFire = 0.9;

  // Sound waits for a gesture. The context and its samples are prepared up
  // front so the very first tap has something to play; only `unlock` (below,
  // on the first pointerdown) makes any of it audible.
  const audio = createAudioEngine();
  void Promise.all(
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
    void tapAt(command.target);
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
      fleet.setActive(id);
      hudControls.setActive(id);
      hudControls.setAbility(id);
      void swapVehicle(id);
    },
    onAbility: () => {
      const events = fleet.requestAbility();
      if (events.length === 0) {
        return;
      }
      audio.playAbility(events);
      for (const event of events) {
        switch (event.kind) {
          case 'spray':
          case 'cones':
          case 'gulp':
            fx.burst(event.kind, vehicle.position, vehicle.heading());
            break;
          case 'siren':
            fx.flash(vehicle.position);
            break;
          default:
            // The ice-cream jingle is heard rather than seen; its cones are
            // their own event and burst above.
            break;
        }
      }
      // Water on a live fire is the rescue, not just the trick: the press that
      // sprays is also the press that counts a burst off the fire.
      if (
        events.some((event) => event.kind === 'spray') &&
        mission.isHoseReady(distanceToFire(vehicle.position))
      ) {
        mission.spray();
      }
    },
    onMute: (muted) => audio.setMuted(muted),
  });
  hud = hudControls;
  document.body.append(hudControls.element);
  hudControls.setActive(fleet.activeId());
  hudControls.setAbility(fleet.activeId());
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
    helperTrace.update(delta);
    sun.update(delta, rig.camera);
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
      tickMission(delta, motor.position);
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

  /**
   * The one place a destination tap is answered, whether the finger was a
   * child's or the helper hand's demo.
   *
   * Answering the alarm is the same gesture as driving somewhere: tap the
   * burning house and the car becomes the fire truck and heads over. That is
   * also how the camera reaches the fire - it follows the car, so the car going
   * there *is* the pan, with no separate camera state to get stuck in.
   */
  async function tapAt(point: Vec2): Promise<void> {
    // Ring before routing: a tap is answered within a frame even on the way to
    // a destination the road network cannot reach.
    ring.show(point);
    audio.play('tap');

    const snapshot = mission.snapshot();
    const burning = firePoint();
    if (
      snapshot.state === 'spawned' &&
      burning !== undefined &&
      distanceBetween(point, burning) <= SnapToFire
    ) {
      mission.respond();
      if (fleet.activeId() !== 'fire') {
        fleet.setActive('fire');
        hud?.setActive('fire');
        hud?.setAbility('fire');
        await swapVehicle('fire');
      }
    }

    const route = findPath(grid, vehicle.position, point);
    if (route === undefined) {
      return;
    }
    vehicle.setPath(route);
  }

  /**
   * One tick of the town's own story: the pacer decides when another fire is
   * due, the mission owns it once it is lit, the fire is drawn from the very
   * count the mission keeps, and the hand offers one tap if the kid has gone
   * quiet with a fire still waiting.
   */
  function tickMission(delta: number, carPosition: Vec2): void {
    // The hose arms when the car is close enough and disarms when it drives
    // away, so the mission needs a fresh distance every frame. This is also
    // what makes a rescue interruptible instead of cancellable.
    mission.update(delta, distanceToFire(carPosition));

    // While a mission is in flight it is the kid's turn; the town waits its
    // turn, which is also what gives the next fire a full calm gap.
    fireIfDue(delta, mission.snapshot().state !== 'idle');

    const snapshot = mission.snapshot();
    const burning = snapshot.state !== 'idle';

    // The hose arrives with proximity and leaves with it. While a fire is
    // burning the ability button *is* the hose button, so it only exists once
    // the car is close enough to use it.
    const showAbility = !burning || snapshot.state === 'active';
    if (showAbility !== abilityVisible) {
      abilityVisible = showAbility;
      hud?.setAbilityVisible(showAbility);
    }

    if (snapshot.fireHouseId === undefined) {
      fire.extinguish();
      helperTrace.hide();
      pendingDemo = undefined;
    } else {
      fire.setBursts(snapshot.burstsLeft, fireTotal);
    }

    if (snapshot.state === 'complete' && !celebrated) {
      celebrated = true;
      const where = firePoint() ?? carPosition;
      fx.burst('confetti', where, 0);
      sun.show(where);
      audio.play('cheer');
    }

    tickHelperHand(delta, carPosition, snapshot);

    if (pendingDemo !== undefined && helperTrace.isDone()) {
      const demo = pendingDemo;
      pendingDemo = undefined;
      helperTrace.hide();
      void tapAt(demo);
    }
  }

  /** Lights the next fire whenever the pacer says the town is due one. */
  function fireIfDue(delta: number, burning: boolean): void {
    const due = pacer.update(delta, burning);
    if (due !== undefined) {
      lightFire(due);
    }
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
    celebrated = false;
    sun.hide();
    audio.play('chime');
    return true;
  }

  /**
   * The hand helps while the fire is still waiting on the kid; once the hose is
   * in reach the kid has arrived and needs no help. Its trace runs first and the
   * poke at the end is the demo tap itself.
   */
  function tickHelperHand(
    delta: number,
    carPosition: Vec2,
    snapshot: MissionSnapshot,
  ): void {
    const awaiting = snapshot.state === 'spawned' || snapshot.state === 'driving';
    const destination = firePoint();
    if (destination === undefined) {
      return;
    }
    const tap = hand.update(delta, { missionActive: awaiting, destination });
    if (tap === undefined) {
      return;
    }
    const route = findPath(grid, carPosition, tap);
    helperTrace.show(
      route === undefined ? [carPosition, tap] : [...route.waypoints, route.destination],
    );
    pendingDemo = tap;
  }

  await Promise.all(TOWN_MODELS.map((url) => library.load(url)));
}

await main();
