import { OrthographicCamera } from 'three';

/**
 * Vertical world extent the camera shows. Sized here to frame the whole 6x6
 * town for layout verification; the CameraRig task replaces this with
 * car-following framing (car ≈15–20% of viewport height).
 */
export const VIEW_HEIGHT = 9;

/**
 * Fixed ~45° tilt from above the town center. Orthographic framing ignores
 * this distance, but fog and depth precision do not — so the camera stays
 * close to the town it is watching.
 */
const CAMERA_POSITION = { x: 5, y: 7, z: 5 } as const;

/** Creates the fixed orthographic town camera used until the CameraRig lands. */
export function createCamera(aspect: number): OrthographicCamera {
  const camera = new OrthographicCamera(0, 0, 0, 0, 0.1, 400);
  updateCameraFrustum(camera, aspect);
  camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
  camera.lookAt(0, 0, 0);
  return camera;
}

/**
 * Refits the frustum so a fixed vertical world extent fills any viewport,
 * which keeps framing stable across portrait/landscape orientation changes.
 */
export function updateCameraFrustum(camera: OrthographicCamera, aspect: number): void {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfHeight = VIEW_HEIGHT / 2;
  const halfWidth = halfHeight * safeAspect;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}
