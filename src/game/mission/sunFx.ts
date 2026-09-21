/**
 * The smiling sun that comes out when a fire is out.
 *
 * The spec's resolution is "confetti + a smiling sun": the confetti is a party
 * trick the car did, and the sun is the town itself being pleased. It rises
 * over the house that was burning, turns gently, and fades before a child can
 * get bored of it.
 *
 * Same shape as the rest of the feedback layer: the pop, the fade and the turn
 * are pure functions with tests, and the meshes (a disc, eight rays and a face)
 * hang off them. It faces the camera so the smile reads from any angle.
 */

import {
  CircleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  RingGeometry,
} from 'three';
import type { Vec2 } from '../town/townTypes';

/** How long the sun is up before the town goes back to normal. */
export const SUN_SECONDS = 2.2;

/** How high above the lot it rises, so it is never lost behind a roof. */
export const SUN_HEIGHT = 2.6;

export const SUN_COLOR = 0xffd34b;

export const SUN_FACE_COLOR = 0x4a3a1a;

export const SUN_RAY_COUNT = 8;

/** Radians per second of gentle turn. */
export const SUN_SPIN_RATE = 0.6;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export interface SunFrame {
  readonly scale: number;
  readonly opacity: number;
  readonly turn: number;
  readonly finished: boolean;
}

/** The sun's pop, fade and turn at a moment in its life. */
export function sunFrame(elapsedSeconds: number): SunFrame {
  const progress = clamp(elapsedSeconds / SUN_SECONDS, 0, 1);

  // Rises quickly, overshoots a touch as it arrives, then holds; fades over the
  // last quarter rather than snapping off.
  const grow = clamp(progress / 0.25, 0, 1);
  const overshoot = Math.sin(grow * Math.PI) * 0.08;
  const fade = progress > 0.75 ? 1 - (progress - 0.75) / 0.25 : 1;

  return {
    scale: 1 + overshoot - 0.5 * (1 - grow) ** 3,
    opacity: clamp(fade, 0, 1),
    turn: progress * SUN_SECONDS * SUN_SPIN_RATE,
    finished: progress >= 1,
  };
}

export interface SunFx {
  readonly object: Object3D;
  /** Brings the sun out over a lot. */
  show(point: Vec2): void;
  hide(): void;
  isShowing(): boolean;
  /** `facing` keeps the face turned to the player; anything with a quaternion. */
  update(deltaSeconds: number, facing?: { readonly quaternion: unknown }): void;
}

export function createSunFx(): SunFx {
  const object = new Group();
  object.name = 'sunFx';

  const discMaterial = new MeshBasicMaterial({
    color: SUN_COLOR,
    transparent: true,
  });
  const faceMaterial = new MeshBasicMaterial({
    color: SUN_FACE_COLOR,
    transparent: true,
  });

  const disc = new Mesh(new CircleGeometry(1, 24), discMaterial);
  disc.name = 'sunDisc';
  object.add(disc);

  const rayGeometry = new ConeGeometry(0.14, 0.42, 3);
  for (let index = 0; index < SUN_RAY_COUNT; index += 1) {
    const angle = (index / SUN_RAY_COUNT) * Math.PI * 2;
    const ray = new Mesh(rayGeometry, discMaterial);
    ray.name = `sunRay-${index}`;
    ray.position.set(Math.cos(angle) * 1.28, Math.sin(angle) * 1.28, 0);
    ray.rotation.z = angle - Math.PI / 2;
    object.add(ray);
  }

  // The face sits just in front of the disc so it never z-fights with it.
  for (const [index, x] of [-0.3, 0.3].entries()) {
    const eye = new Mesh(new CircleGeometry(0.12, 12), faceMaterial);
    eye.name = `sunEye-${index}`;
    eye.position.set(x, 0.24, 0.02);
    object.add(eye);
  }
  const smile = new Mesh(
    new RingGeometry(0.34, 0.46, 16, 1, Math.PI * 1.15, Math.PI * 0.7),
    faceMaterial,
  );
  smile.name = 'sunSmile';
  smile.position.set(0, 0.02, 0.02);
  object.add(smile);

  object.visible = false;

  let elapsed = 0;
  let showing = false;

  return {
    object,

    show: (point) => {
      object.position.set(point.x, SUN_HEIGHT, point.z);
      elapsed = 0;
      showing = true;
      object.visible = true;
      object.scale.setScalar(sunFrame(0).scale);
    },

    hide: () => {
      showing = false;
      object.visible = false;
    },

    isShowing: () => showing,

    update: (deltaSeconds, facing) => {
      if (!showing) {
        return;
      }

      elapsed += Math.max(deltaSeconds, 0);
      const frame = sunFrame(elapsed);
      // The turn accumulates on the group's own axis, so the smile sweeps
      // rather than wobbling back and forth.
      object.rotation.z = frame.turn;
      object.scale.setScalar(frame.scale);
      discMaterial.opacity = frame.opacity;
      faceMaterial.opacity = frame.opacity;

      if (facing !== undefined) {
        // Face the player, keeping the sun's own turn.
        const quaternion = facing.quaternion as {
          readonly x: number;
          readonly y: number;
          readonly z: number;
          readonly w: number;
        };
        object.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        object.rotateZ(frame.turn);
      }

      if (frame.finished) {
        showing = false;
        object.visible = false;
      }
    },
  };
}
