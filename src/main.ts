import { PCFShadowMap, WebGLRenderer } from 'three';
import { createModelLibrary } from './game/assets/modelLibrary';
import { TOWN_MODELS } from './game/assets/modelRegistry';
import { createCameraRig } from './game/camera';
import { startRenderLoop } from './game/renderLoop';
import { createScene } from './game/scene';
import { createTownGrid } from './game/town/townGrid';
import { mountTown } from './game/town/townRenderer';

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

  // Models load over the network on first visit and are then precached by the
  // service worker. The camera opens on the primary spawn point immediately so
  // the sky is on screen while the town arrives.
  const rig = createCameraRig(container.clientWidth / container.clientHeight);
  rig.snapTo(grid.spawnPoints[0] ?? { x: 0, z: 0 });

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

  startRenderLoop(renderer, scene, rig.camera, ({ delta }) => {
    rig.update(delta);
  });

  const library = createModelLibrary();
  const town = await mountTown(grid, library);
  scene.add(town.group);
  await Promise.all(TOWN_MODELS.map((url) => library.load(url)));
}

await main();
