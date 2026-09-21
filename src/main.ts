import { PCFShadowMap, WebGLRenderer } from 'three';
import { createCamera, updateCameraFrustum } from './game/camera';
import { startRenderLoop } from './game/renderLoop';
import { createScene } from './game/scene';
import { buildTown } from './game/town/townBuilder';
import { createTownGrid } from './game/town/townGrid';

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

function main(): void {
  const container = document.querySelector<HTMLElement>('#app');
  if (container === null) {
    throw new Error('Bootstrap failed: #app container missing from index.html');
  }

  const renderer = createRenderer(container);
  const { scene } = createScene();
  const town = buildTown(createTownGrid());
  scene.add(town.group);
  const camera = createCamera(container.clientWidth / container.clientHeight);

  // ResizeObserver covers window resizes and orientation changes alike,
  // including the initial layout pass.
  const observer = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    updateCameraFrustum(camera, width / height);
  });
  observer.observe(container);

  startRenderLoop(renderer, scene, camera);
}

main();
