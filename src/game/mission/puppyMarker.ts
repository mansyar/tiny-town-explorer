/**
 * The Lost Puppy's two markers (FR7, FR9): a paw print that blooms on the
 * ground over the hiding spot once the siren answers, and a heart floating
 * over the owner's door while the pup rides aboard. Never both — each is
 * shown and hidden from `puppyMission`'s state, so FR9's "one marker at a
 * time" is state-derived rather than remembered.
 *
 * Same shape as `orderMarker`: primitives in the icon family, the shared
 * bounce and sway, a `place/show/hide/update` surface `main.ts` drives.
 * Scene code — manual-verify per the workflow's Guiding Principle.
 */

import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  SphereGeometry,
} from 'three';
import type { Vec2 } from '../town/townTypes';
import { MARKER_BASE_HEIGHT, markerBounce, markerSway } from './orderMarker';

/** The pup's own tan, so the paw reads as *this* puppy's print. */
const PAW_COLOR = 0xc98a4b;
/** Warm heart, in the icon family beside the order's scoop pink. */
const HEART_COLOR = 0xe85d75;
/** The paw sits on the grass at the spot, not on a roof. */
const PAW_BASE_HEIGHT = 0.06;

export interface PuppyMarker {
  readonly object: Object3D;
  /** Moves the marker onto a point of the world. */
  place(point: Vec2): void;
  show(): void;
  hide(): void;
  isShowing(): boolean;
  update(deltaSeconds: number): void;
}

function createMarker(name: string, baseHeight: number, build: () => Group): PuppyMarker {
  const object = new Group();
  object.name = name;
  object.visible = false;
  object.add(build());

  let showing = false;
  let seconds = 0;

  return {
    object,

    place: (point) => {
      object.position.set(point.x, baseHeight, point.z);
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
      object.position.y = baseHeight + markerBounce(seconds);
      object.rotation.y = markerSway(seconds);
    },
  };
}

/** A flat paw print: a pad and four toes, hovering a breath off the grass. */
export function createPawMarker(): PuppyMarker {
  return createMarker('pawMarker', PAW_BASE_HEIGHT, () => {
    const group = new Group();
    group.name = 'pawPrint';
    const material = new MeshBasicMaterial({ color: PAW_COLOR });

    const pad = new Mesh(new SphereGeometry(0.13, 8, 6), material);
    pad.name = 'pawPrint-pad';
    pad.scale.set(1, 0.3, 1.1);
    group.add(pad);

    const toeOffsets = [-0.1, -0.035, 0.035, 0.1];
    toeOffsets.forEach((x, index) => {
      const toe = new Mesh(new SphereGeometry(0.05, 6, 4), material);
      toe.name = `pawPrint-toe-${index}`;
      toe.scale.set(1, 0.3, 1);
      toe.position.set(x, 0, -0.16 - Math.abs(x) * 0.25);
      group.add(toe);
    });

    return group;
  });
}

/** A heart: two lobes over a turned square, floating above the door. */
export function createHeartMarker(): PuppyMarker {
  return createMarker('heartMarker', MARKER_BASE_HEIGHT, () => {
    const group = new Group();
    group.name = 'puppyHeart';
    const material = new MeshBasicMaterial({ color: HEART_COLOR });

    const lobe = (name: string, x: number): void => {
      const mesh = new Mesh(new SphereGeometry(0.12, 8, 6), material);
      mesh.name = name;
      mesh.position.set(x, 0.1, 0);
      group.add(mesh);
    };
    lobe('puppyHeart-lobeL', -0.085);
    lobe('puppyHeart-lobeR', 0.085);

    const point = new Mesh(new BoxGeometry(0.26, 0.26, 0.14), material);
    point.name = 'puppyHeart-point';
    point.position.set(0, -0.04, 0);
    point.rotation.z = Math.PI / 4;
    group.add(point);

    return group;
  });
}
