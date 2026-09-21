import { PCFShadowMap, WebGLRenderer } from 'three';
import { createModelLibrary } from './game/assets/modelLibrary';
import { TOWN_MODELS, VEHICLE_MODELS } from './game/assets/modelRegistry';
import { createCameraRig } from './game/camera';
import { createInputRouter, ndcFromPoint } from './game/input/inputRouter';
import { findPath } from './game/path/pathfinder';
import { startRenderLoop } from './game/renderLoop';
import { createScene } from './game/scene';
import { createTownGrid } from './game/town/townGrid';
import { mountTown } from './game/town/townRenderer';
import { createVehicleActor } from './game/vehicle/vehicleActor';
import { createVehicleMotor } from './game/vehicle/vehicleMotor';

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
  const motor = createVehicleMotor();
  const spawn = grid.spawnPoints[0] ?? { x: 0, z: 0 };
  motor.snapTo(spawn);

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

  // Every tap is answered: a destination becomes a route the car drives, and a
  // tap under the car is a honk (its squish and ring land with the feedback
  // pass). Taps that arrive while a route is running simply replace it.
  const router = createInputRouter({
    camera: rig.camera,
    grid,
    getCarPosition: () => motor.position,
  });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const command = router.tapAt(ndcFromPoint(event.clientX, event.clientY, rect));
    if (command.kind !== 'drive' || !router.isCurrent(command)) {
      return;
    }
    const path = findPath(grid, motor.position, command.target);
    if (path === undefined) {
      return;
    }
    motor.setPath(path);
  });

  let actor: Awaited<ReturnType<typeof createVehicleActor>> | undefined;
  startRenderLoop(renderer, scene, rig.camera, ({ delta }) => {
    motor.update(delta);
    actor?.sync();
    // The camera eases after the car, which is the only thing that moves.
    rig.setTarget(motor.position);
    rig.update(delta);
  });

  const library = createModelLibrary();
  const [town, car] = await Promise.all([
    mountTown(grid, library),
    createVehicleActor(library, VEHICLE_MODELS.truck, motor),
  ]);
  scene.add(town.group);
  scene.add(car.object);
  actor = car;
  await Promise.all(TOWN_MODELS.map((url) => library.load(url)));
}

await main();
