import { WebGLRenderer } from 'three';
import { createCamera, updateCameraFrustum } from './game/camera';
import { startRenderLoop } from './game/renderLoop';
import { createTownScene } from './game/scene';

/**
 * Creates the single WebGL renderer. Antialiasing plus a pixel ratio capped
 * at 2 keeps the iPad-9th-gen frame budget safe on Retina displays.
 */
function createRenderer(container: HTMLElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
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
  const { scene } = createTownScene();
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
