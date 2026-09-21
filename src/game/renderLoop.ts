import type { Camera, Scene, WebGLRenderer } from 'three';
import { Timer } from 'three';

/** Timing information handed to per-frame hooks. */
export interface FrameInfo {
  /** Seconds since the previous frame. */
  readonly delta: number;
  /** Seconds since the loop started. */
  readonly elapsed: number;
}

/**
 * Drives the requestAnimationFrame loop: measures frame time, runs the
 * optional per-frame hook, and renders.
 *
 * The timer connects to the document's Page Visibility API when a DOM is
 * available, so backgrounding the app never produces an oversized delta
 * (one enormous simulation step) when play resumes.
 *
 * @returns A stop function that cancels the pending frame.
 */
export function startRenderLoop(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  onFrame?: (frame: FrameInfo) => void,
): () => void {
  const timer = new Timer();
  if (typeof document !== 'undefined') {
    timer.connect(document);
  }
  let frameHandle = 0;

  const renderFrame = (timestamp: number): void => {
    timer.update(timestamp);
    onFrame?.({ delta: timer.getDelta(), elapsed: timer.getElapsed() });
    renderer.render(scene, camera);
    frameHandle = requestAnimationFrame(renderFrame);
  };

  frameHandle = requestAnimationFrame(renderFrame);

  return () => {
    cancelAnimationFrame(frameHandle);
    timer.dispose();
  };
}
