/**
 * What a fire looks like: a flame that shrinks with every burst of water, and
 * smoke that drifts off it.
 *
 * Same shape as `targetRing` and `abilityFx` - the parts worth getting right
 * (how big the flame is now, how a puff rises and fades) are pure functions
 * with tests, and the meshes are a thin layer over them. The flame's size is a
 * function of *bursts left* rather than a countdown, so the visual can never
 * disagree with the mission state that owns it.
 */

import {
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  SphereGeometry,
} from 'three';
import type { Vec2 } from '../town/townTypes';

/** Flame size at full strength, in world units. */
export const FLAME_HEIGHT = 1.2;

export const FLAME_RADIUS = 0.5;

export const FLAME_COLOR = 0xff7a1a;

/** Just above the lawn so the flame never z-fights with the lot. */
export const FLAME_SURFACE_HEIGHT = 0.02;

export const SMOKE_COUNT = 5;

export const SMOKE_SECONDS = 1.6;

export const SMOKE_COLOR = 0xbfc4cc;

/** How high a puff drifts before it fades out. */
export const SMOKE_RISE = 1.5;

/**
 * How big the flame stands with `burstsLeft` of `burstsTotal` bursts to go.
 * Zero means out, so a doused fire needs no separate state to hide it.
 */
export function flameScale(burstsLeft: number, burstsTotal: number): number {
  if (burstsLeft <= 0 || burstsTotal <= 0) {
    return 0;
  }
  return 0.25 + 0.75 * (burstsLeft / burstsTotal);
}

/** A small wobble, so the flame never sits perfectly still. */
export function flameFlicker(seconds: number): number {
  return 1 + 0.06 * Math.sin(seconds * 6) + 0.04 * Math.sin(seconds * 11 + 1.3);
}

export interface SmokeFrame {
  readonly scale: number;
  readonly opacity: number;
  readonly finished: boolean;
}

/** A puff growing and thinning as it climbs. */
export function smokeFrame(elapsedSeconds: number): SmokeFrame {
  const progress = Math.min(Math.max(elapsedSeconds / SMOKE_SECONDS, 0), 1);
  return {
    scale: 0.25 + 0.75 * progress,
    opacity: (1 - progress) * 0.7,
    finished: progress >= 1,
  };
}

export interface FireFx {
  readonly object: Object3D;
  /** Moves the fire onto a house's lot. */
  place(point: Vec2): void;
  /** Tells the flame how much of it is left. */
  setBursts(burstsLeft: number, burstsTotal: number): void;
  /** Douses it: the flame goes out and the smoke stops. */
  extinguish(): void;
  isBurning(): boolean;
  update(deltaSeconds: number): void;
}

export function createFireFx(): FireFx {
  const object = new Group();
  object.name = 'fireFx';

  const flameGeometry = new ConeGeometry(1, 1, 8);
  const flameMaterial = new MeshBasicMaterial({
    color: FLAME_COLOR,
    transparent: true,
  });
  const flame = new Mesh(flameGeometry, flameMaterial);
  flame.name = 'fireFlame';
  flame.visible = false;
  object.add(flame);

  const smokeGeometry = new SphereGeometry(0.4, 6, 4);
  const smokeMaterial = new MeshBasicMaterial({
    color: SMOKE_COLOR,
    transparent: true,
    depthWrite: false,
  });
  const puffs: Mesh[] = [];
  for (let index = 0; index < SMOKE_COUNT; index += 1) {
    const puff = new Mesh(smokeGeometry, smokeMaterial);
    puff.name = `fireSmoke-${index}`;
    puff.visible = false;
    puff.rotation.set(index * 0.7, index * 1.1, index * 0.5);
    puffs.push(puff);
    object.add(puff);
  }

  let burstsLeft = 0;
  let burstsTotal = 0;
  let seconds = 0;

  return {
    object,

    place: (point) => {
      object.position.set(point.x, FLAME_SURFACE_HEIGHT, point.z);
    },

    setBursts: (left, total) => {
      burstsLeft = Math.max(left, 0);
      burstsTotal = Math.max(total, 0);
      flame.visible = burstsLeft > 0;
    },

    extinguish: () => {
      burstsLeft = 0;
      flame.visible = false;
      for (const puff of puffs) {
        puff.visible = false;
      }
    },

    isBurning: () => burstsLeft > 0,

    update: (deltaSeconds) => {
      const delta = Math.max(deltaSeconds, 0);
      seconds += delta;

      if (burstsLeft <= 0) {
        return;
      }

      const scale = flameScale(burstsLeft, burstsTotal) * flameFlicker(seconds);
      flame.scale.set(FLAME_RADIUS * scale, FLAME_HEIGHT * scale, FLAME_RADIUS * scale);
      flame.position.y = (FLAME_HEIGHT * scale) / 2;
      flameMaterial.opacity = 0.85;

      for (const [index, puff] of puffs.entries()) {
        // Each puff runs the same cycle, offset so they are not in lockstep.
        const offset = (index / SMOKE_COUNT) * SMOKE_SECONDS;
        const frame = smokeFrame((seconds + offset) % SMOKE_SECONDS);
        const rise = frame.scale * SMOKE_RISE;
        puff.visible = true;
        puff.position.set(
          Math.sin(seconds * 0.8 + index) * 0.12,
          FLAME_HEIGHT * 0.9 + rise,
          Math.cos(seconds * 0.7 + index) * 0.12,
        );
        puff.scale.setScalar(frame.scale);
        smokeMaterial.opacity = frame.opacity;
      }
    },
  };
}
