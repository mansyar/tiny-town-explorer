/**
 * What an ice-cream order looks like: a bouncing ice-cream cone with a little
 * music note beside it, floating above the ordering house's lot.
 *
 * Same shape as `fireFx` - the parts worth getting right (how high the bounce
 * lifts, how far the sway leans) are pure functions with tests, and the meshes
 * are a thin layer over them. Everything is primitives (no new GLBs), in the
 * spec's 50k-tri budget, and the marker floats above the roof so the house's
 * 72px tap target stays untouched.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  SphereGeometry,
} from 'three';
import type { Vec2 } from '../town/townTypes';

/** How high the bounce lifts the marker, in world units. */
export const MARKER_BOUNCE_HEIGHT = 0.15;

/** Seconds per bounce: quick enough to catch the eye, slow enough to stay calm. */
export const MARKER_BOUNCE_SECONDS = 0.7;

/** How far the marker sways side to side, in world units. */
export const MARKER_SWAY_WIDTH = 0.08;

/** Base height: above a Kenney house roof, below the camera's sightline. */
export const MARKER_BASE_HEIGHT = 1.7;

export const CONE_COLOR = 0xd9a066;

export const SCOOP_COLOR = 0xffb3c7;

export const NOTE_COLOR = 0x3b5bdb;

/**
 * How high above the base the marker floats, `seconds` after it appeared.
 * Always back at the base each cycle, so the marker never drifts skyward.
 */
export function markerBounce(seconds: number): number {
  const cycle = (seconds % MARKER_BOUNCE_SECONDS) / MARKER_BOUNCE_SECONDS;
  return MARKER_BOUNCE_HEIGHT * (0.5 - 0.5 * Math.cos(cycle * Math.PI * 2));
}

/** A slow lean side to side, so the marker never sits perfectly still. */
export function markerSway(seconds: number): number {
  return MARKER_SWAY_WIDTH * Math.sin(seconds * 2);
}

export interface OrderMarker {
  readonly object: Object3D;
  /** Moves the marker onto a house's lot. */
  place(point: Vec2): void;
  show(): void;
  hide(): void;
  isShowing(): boolean;
  update(deltaSeconds: number): void;
}

export function createOrderMarker(): OrderMarker {
  const object = new Group();
  object.name = 'orderMarker';
  object.visible = false;

  const waffleMaterial = new MeshBasicMaterial({ color: CONE_COLOR });
  const cone = new Mesh(new ConeGeometry(0.22, 0.4, 8), waffleMaterial);
  cone.name = 'orderCone';
  // Apex down, like a cone held upside-down: scoop sits on the wide end.
  cone.rotation.x = Math.PI;
  cone.position.y = 0.2;
  object.add(cone);

  const scoop = new Mesh(
    new SphereGeometry(0.24, 8, 6),
    new MeshBasicMaterial({ color: SCOOP_COLOR }),
  );
  scoop.name = 'orderScoop';
  scoop.position.y = 0.48;
  object.add(scoop);

  // A quaver-ish note: head, stem, flag. It reads as "music" next to the cone.
  const noteMaterial = new MeshBasicMaterial({ color: NOTE_COLOR });
  const note = new Group();
  note.name = 'orderNote';
  const head = new Mesh(new SphereGeometry(0.09, 8, 6), noteMaterial);
  head.position.y = 0.1;
  note.add(head);
  const stem = new Mesh(new CylinderGeometry(0.025, 0.025, 0.3, 6), noteMaterial);
  stem.position.set(0.08, 0.28, 0);
  note.add(stem);
  const flag = new Mesh(new BoxGeometry(0.14, 0.05, 0.02), noteMaterial);
  flag.position.set(0.13, 0.42, 0);
  flag.rotation.z = -0.4;
  note.add(flag);
  note.position.set(0.45, 0.35, 0);
  object.add(note);

  let showing = false;
  let seconds = 0;

  return {
    object,

    place: (point) => {
      object.position.set(point.x, MARKER_BASE_HEIGHT, point.z);
    },

    show: () => {
      showing = true;
      seconds = 0;
      object.visible = true;
    },

    hide: () => {
      showing = false;
      object.visible = false;
    },

    isShowing: () => showing,

    update: (deltaSeconds) => {
      const delta = Math.max(deltaSeconds, 0);
      seconds += delta;
      if (!showing) {
        return;
      }
      object.position.y = MARKER_BASE_HEIGHT + markerBounce(seconds);
      object.rotation.y = markerSway(seconds);
    },
  };
}
