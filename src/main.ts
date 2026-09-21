import { PCFShadowMap, WebGLRenderer } from 'three';
import { createModelLibrary } from './game/assets/modelLibrary';
import { TOWN_MODELS, VEHICLE_MODELS } from './game/assets/modelRegistry';
import { createAudioEngine, type SampledSound } from './game/audio/audioEngine';
import { SOUND_MODELS } from './game/audio/audioRegistry';
import { createCameraRig } from './game/camera';
import { collectObstacles } from './game/collision/collision';
import { createTargetRing } from './game/feedback/targetRing';
import { createInputRouter, ndcFromPoint } from './game/input/inputRouter';
import { findPath } from './game/path/pathfinder';
import { startRenderLoop } from './game/renderLoop';
import { createScene } from './game/scene';
import { createTownGrid } from './game/town/townGrid';
import { mountTown } from './game/town/townRenderer';
import { createVehicleActor } from './game/vehicle/vehicleActor';
import { createVehicleMotor, type VehicleMotor } from './game/vehicle/vehicleMotor';
import { createVehicleSystem } from './game/vehicle/vehicleSystem';

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

  // The car and its motor arrive only once the town has been measured, because
  // the hitboxes *are* the mounted art. Until then the loop just holds the sky.
  let motor: VehicleMotor | undefined;
  let actor: Awaited<ReturnType<typeof createVehicleActor>> | undefined;

  let bonks = 0;

  startRenderLoop(renderer, scene, rig.camera, ({ delta }) => {
    motor?.update(delta);
    actor?.sync();
    ring.update(delta);
    // The camera eases after the car, which is the only thing that moves.
    if (motor !== undefined) {
      rig.setTarget(motor.position);
      // The engine note rides the speed: silent parked, chugging under way.
      audio.setEngine(motor.isDriving() ? fleet.engineRate(motor.speed()) : 0);
      if (motor.bonkCount() > bonks) {
        bonks = motor.bonkCount();
        audio.play('bonk');
      }
    }
    rig.update(delta);
  });

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
    const rect = renderer.domElement.getBoundingClientRect();
    const command = router.tapAt(ndcFromPoint(event.clientX, event.clientY, rect));
    if (command.kind === 'honk') {
      ring.show(command.at);
      return;
    }
    if (!router.isCurrent(command)) {
      return;
    }
    // Ring before routing: a tap is answered within a frame even on the way to
    // a destination the road network cannot reach.
    ring.show(command.target);
    audio.play('tap');
    const path = findPath(grid, vehicle.position, command.target);
    if (path === undefined) {
      return;
    }
    vehicle.setPath(path);
  });

  const car = await createVehicleActor(library, VEHICLE_MODELS.truck, vehicle);
  scene.add(car.object);
  actor = car;
  await Promise.all(TOWN_MODELS.map((url) => library.load(url)));
}

await main();
