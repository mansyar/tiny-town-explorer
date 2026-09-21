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
import { createFireFx } from './game/mission/fireFx';
import { createFirePacer } from './game/mission/firePacer';
import { createHelperHand } from './game/mission/helperHand';
import { createHelperTrace } from './game/mission/helperTrace';
import { createIceCreamMission } from './game/mission/iceCreamMission';
import { createIceCreamPacer } from './game/mission/iceCreamPacer';
import { isTownBusy } from './game/mission/missionBusy';
import {
  createMissionManager,
  distanceBetween,
  type MissionSnapshot,
} from './game/mission/missionManager';
import { createOrderBeats, orderIsOpen } from './game/mission/orderFlow';
import { createOrderMarker } from './game/mission/orderMarker';
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

  // The second mission: a house that wants ice cream. The pacer decides when
  // and where, the state machine owns the delivery, the marker shows the order,
  // and the beats keep its cue and its celebration to one each per order.
  const orders = createIceCreamMission();
  const orderPacer = createIceCreamPacer({ houses: houseLots });
  const orderMarker = createOrderMarker();
  scene.add(orderMarker.object);
  const orderBeats = createOrderBeats();

  // Bursts the fire started with, for the flame's size; one celebration per
  // fire; whether the ability button is on screen; the demo tap the hand owes.
  let fireTotal = 0;
  let celebrated = false;
  let abilityVisible = true;
  let pendingDemo: Vec2 | undefined;

  /** How close a tap must land to count as aiming at the burning house. */
  const snapToFire = 0.9;

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
      distanceBetween(point, burning) <= snapToFire
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
    // A fresh destination is the child driving off, so any ability still in
    // flight ends where it is rather than playing out behind a departing car.
    fleet.interruptBurst();
    vehicle.setPath(route);
  }

  /**
   * One tick of the town's own story, for both missions at once: the pacers
   * decide when the town is due another, each mission owns the one it is given,
   * the fire and the cone icon are drawn from the very state the missions keep,
   * and the hand offers one tap if the kid has gone quiet with one still
   * waiting.
   */
  function tickMissions(delta: number, carPosition: Vec2): void {
    // Both missions arm and disarm from a fresh distance every frame: arriving
    // arms the hose, driving off takes it away again. That is what makes either
    // mission interruptible instead of cancellable.
    mission.update(delta, distanceToFire(carPosition));
    orders.update(delta, distanceToOrder(carPosition));

    tickPacers(delta);
    tickFireMission(carPosition);
    tickOrderMission(carPosition);
    tickHelperHand(delta, carPosition, mission.snapshot());

    // A trace, and the demo tap it announced, belong only to a mission that
    // still needs the kid; when the town goes quiet, both are dropped.
    if (mission.snapshot().state === 'idle' && orders.snapshot().state === 'idle') {
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
   * The two pacers, kept in one place so the shared gate is read once: one
   * town, one turn, whichever mission takes it first.
   */
  function tickPacers(delta: number): void {
    let busy = isTownBusy(mission.snapshot(), orders.snapshot());

    const fireDue = pacer.update(delta, busy);
    if (fireDue !== undefined && lightFire(fireDue)) {
      // The fire took the town's turn this frame, so an order that came due in
      // the very same frame waits rather than landing on top of it.
      busy = true;
    }
    const orderDue = orderPacer.update(delta, busy);
    if (orderDue !== undefined) {
      lightOrder(orderDue);
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
    const showAbility = snapshot.state !== 'spawned' && snapshot.state !== 'driving';
    if (showAbility !== abilityVisible) {
      abilityVisible = showAbility;
      hud?.setAbilityVisible(showAbility);
    }

    if (snapshot.fireHouseId === undefined) {
      fire.extinguish();
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
  }

  /**
   * The order's feedback: the cone icon over the house, the jingle cue that
   * arrives with it, and the handoff celebration.
   */
  function tickOrderMission(carPosition: Vec2): void {
    const snapshot = orders.snapshot();

    // The cone icon floats over the ordering house while the order is open, and
    // the celebration clears it: one order, one beat of attention.
    const marker = orderIsOpen(snapshot.state);
    if (marker !== orderMarker.isShowing()) {
      if (marker) {
        orderMarker.show();
      } else {
        orderMarker.hide();
      }
    }

    // Cues fire on the edge, never on the state: `spawned` lasts as long as the
    // kid takes, but the jingle is owed once.
    const beats = orderBeats(snapshot);
    if (beats.orderOpened) {
      // Sound and visual pair: the cone icon's other half is the truck's own
      // jingle, which is exactly the hint about which vehicle delivers it.
      audio.playAbility([{ kind: 'jingle' }]);
    }
    if (beats.served) {
      const where = orderPoint() ?? carPosition;
      fx.burst('confetti', where, 0);
      fx.burst('cones', where, 0);
      sun.show(where);
      audio.play('cheer');
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

  /** Opens an order at a lot: mission state and cone icon in one step. */
  function lightOrder(houseId: string): boolean {
    const lot = grid.houseById(houseId);
    if (lot === undefined || !orders.spawn(houseId)) {
      return false;
    }
    orderMarker.place(lot.position);
    orderMarker.show();
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
}

await main();
