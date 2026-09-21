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
import {
  createMissionManager,
  distanceBetween,
  fireAwaitsKid,
} from './game/mission/missionManager';
import { createMissionRegistry } from './game/mission/missionRegistry';
import {
  createOrderBeats,
  isTapOnHouse,
  MISSION_SNAP_RADIUS,
  orderAwaitsKid,
  orderIsOpen,
  resolveOrderTap,
} from './game/mission/orderFlow';
import { createOrderMarker } from './game/mission/orderMarker';
import { createServeGate } from './game/mission/serveGate';
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
  // Whether the kid has jingled since this order opened. Serve is a tap on the
  // house, but only on a truck that has already sang (spec AC2).
  const serveGate = createServeGate();

  // Bursts the fire started with, for the flame's size; one celebration per
  // fire; whether the ability button is on screen; the demo tap the hand owes.
  let fireTotal = 0;
  let celebrated = false;
  let abilityVisible = true;
  let serveArmed = false;
  let pendingDemo: Vec2 | undefined;
  // The car's position for this frame's mission pass, set in `tickMissions`.
  let frameCarPosition: Vec2 = spawn;

  // The seam that lets a third mission join without a third tick/tap block
  // here (spec FR13): fire and ice-cream contribute; the registry owns order.
  const missions = createMissionRegistry([
    {
      id: 'fire',
      tick: (delta) => {
        mission.update(delta, distanceToFire(frameCarPosition));
        tickFireMission(frameCarPosition);
      },
      tap: async (aim) => {
        const burning = firePoint();
        if (
          mission.snapshot().state !== 'spawned' ||
          burning === undefined ||
          distanceBetween(aim, burning) > MISSION_SNAP_RADIUS
        ) {
          return false;
        }
        mission.respond();
        if (fleet.activeId() !== 'fire') {
          activate('fire');
          await swapVehicle('fire');
        }
        return true;
      },
      focus: (carPosition) => {
        const fireAt = firePoint();
        if (fireAt !== undefined && fireAwaitsKid(mission.snapshot().state)) {
          return { awaiting: true, destination: fireAt };
        }
        return { awaiting: false, destination: carPosition };
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
      focus: (carPosition) => {
        const orderAt = orderPoint();
        if (orderAt !== undefined && orderAwaitsKid(orders.snapshot().state)) {
          return { awaiting: true, destination: orderAt };
        }
        return { awaiting: false, destination: carPosition };
      },
      isIdle: () => orders.snapshot().state === 'idle',
    },
  ]);

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
    onAbility: () => {
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
   * The two pacers, kept in one place so the shared gate is read once: one
   * town, one turn, whichever mission takes it first.
   */
  function tickPacers(delta: number): void {
    let busy = missions.isBusy();

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

    // The serve affordance: the ring blooms on the house on the frame serve is
    // first armed, so "you are close enough, on the right truck, and it sang"
    // reads as a place to tap rather than a state the kid has to deduce.
    const armed = serveArmedNow();
    if (armed && !serveArmed) {
      const waiting = orderPoint();
      if (waiting !== undefined) {
        ring.show(waiting);
      }
    }
    serveArmed = armed;

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
      // Two pairs, both complete: the cone handoff is the `cones` burst the
      // free-play ability throws, with the same one-shot it sounds for `cones`
      // there, and the win is confetti plus the sun plus a cheer - the exact
      // celebration a doused fire gets. Nothing here is heard without being
      // seen, and nothing is seen without being heard.
      const where = orderPoint() ?? carPosition;
      fx.burst('confetti', where, 0);
      fx.burst('cones', where, 0);
      sun.show(where);
      audio.play('drop');
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
    // A fresh order starts with no jingle: the one that served the last cone
    // must not carry over into this delivery.
    serveGate.noteOrderOpened();
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
    // Whichever mission is still waiting on the kid is what the hand points at;
    // the registry takes each mission's focus contribution in order.
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
    const route = findPath(grid, carPosition, tap);
    helperTrace.show(
      route === undefined ? [carPosition, tap] : [...route.waypoints, route.destination],
    );
    pendingDemo = tap;
  }
}

await main();
