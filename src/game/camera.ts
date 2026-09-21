import { OrthographicCamera, Vector3 } from 'three';
import type { Vec2 } from './town/townTypes';

/**
 * Share of viewport height a car should occupy (spec FR10 asks for 15–20%,
 * which leaves the next two or three houses readable around it).
 */
export const CAR_VIEW_SHARE = 0.17;

/** Car length in world units; refined against the Kenney kit in the asset task. */
export const CAR_LENGTH = 0.9;

/** Vertical world extent the camera shows, derived from the framing rule. */
export const VIEW_HEIGHT = CAR_LENGTH / CAR_VIEW_SHARE;

/** Seconds for the follow easing to close ~63% of the remaining gap. */
const FOLLOW_TIME_CONSTANT = 0.35;

/**
 * Distance from the focus point to the camera. Orthographic framing ignores
 * it, but fog ranges and depth precision do not.
 */
const CAMERA_DISTANCE = 9;

/** Equal vertical and horizontal offset gives the fixed ~45 degree tilt. */
const CAMERA_DIRECTION = new Vector3(1, Math.SQRT2, 1).normalize();

/**
 * The town camera: a fixed 45-degree orthographic view that eases after a
 * focus point and refits its frustum to any orientation.
 */
export interface CameraRig {
  readonly camera: OrthographicCamera;
  /** Focus point in world space, updated in place by {@link CameraRig.update}. */
  readonly focus: Vector3;
  /** Starts easing toward a new focus point. */
  setTarget(point: Vec2): void;
  /** Jumps to a focus point with no easing (spawns, camera cuts). */
  snapTo(point: Vec2): void;
  /** Advances the follow easing; `deltaSeconds` is the frame time. */
  update(deltaSeconds: number): void;
  /** Refits the frustum for a new viewport aspect ratio. */
  resize(aspect: number): void;
}

/**
 * Creates the camera rig.
 *
 * @param aspect Viewport aspect ratio (width / height).
 * @param initialFocus World point to frame before any target is set.
 */
export function createCameraRig(
  aspect: number,
  initialFocus: Vec2 = { x: 0, z: 0 },
): CameraRig {
  const camera = new OrthographicCamera(0, 0, 0, 0, 0.1, 200);
  const focus = new Vector3(initialFocus.x, 0, initialFocus.z);
  const target = new Vector3(initialFocus.x, 0, initialFocus.z);

  const place = (): void => {
    camera.position.copy(focus).addScaledVector(CAMERA_DIRECTION, CAMERA_DISTANCE);
    camera.lookAt(focus);
  };

  const rig: CameraRig = {
    camera,
    focus,
    setTarget(point: Vec2): void {
      target.set(point.x, 0, point.z);
    },
    snapTo(point: Vec2): void {
      focus.set(point.x, 0, point.z);
      target.copy(focus);
      place();
    },
    update(deltaSeconds: number): void {
      // Exponential smoothing keeps the travel distance identical for a
      // given elapsed time no matter how the frames fall.
      const elapsed = Math.max(deltaSeconds, 0);
      if (elapsed === 0) {
        return;
      }
      focus.lerp(target, 1 - Math.exp(-elapsed / FOLLOW_TIME_CONSTANT));
      place();
    },
    resize(nextAspect: number): void {
      const safeAspect = Number.isFinite(nextAspect) && nextAspect > 0 ? nextAspect : 1;
      const halfHeight = VIEW_HEIGHT / 2;
      const halfWidth = halfHeight * safeAspect;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    },
  };

  rig.resize(aspect);
  place();
  return rig;
}
