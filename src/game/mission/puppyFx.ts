/**
 * What the lost puppy looks like (FR14): a chunky primitives build in the
 * props' lit material family — no new GLB, no Blender, four shared materials
 * drawn from the City Kit palette family, ~230 triangles against the 50k
 * budget.
 *
 * Same shape as `fireFx` and `orderMarker`: the mesh is the thin layer, and
 * what it does with the mission's state (hopping aboard, running to the door)
 * is Phase 5 wiring. The group's origin sits between its paws on the ground
 * plane, so it drops flush on any tile and the hop/run animation can lift it
 * from its own base.
 *
 * Scene/visual code — manual-verify per the workflow's Guiding Principle, no
 * red/green here.
 */

import type { Object3D } from 'three';
import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three';

/** Standing height at the shoulder, in world units — readable at play distance. */
export const PUPPY_HEIGHT = 0.2;

export const FUR_COLOR = 0xc98a4b;
/** Ears, paws and muzzle patches — the darker points of the coat. */
export const COAT_DARK_COLOR = 0x7a4f26;

/** Belly, snout and tail tip — the lighter mask that makes the face read. */
export const COAT_LIGHT_COLOR = 0xe8d5b5;

export const EYE_COLOR = 0x2b2b2b;

/**
 * A low-poly pup facing +x: slumped body, big head, floppy ears, stub tail.
 * ~230 triangles across four shared materials; ≈{@link PUPPY_HEIGHT} at the
 * shoulder.
 */
export function createPuppy(): Object3D {
  const group = new Group();
  group.name = 'puppy';

  const fur = new MeshLambertMaterial({ color: FUR_COLOR });
  const dark = new MeshLambertMaterial({ color: COAT_DARK_COLOR });
  const light = new MeshLambertMaterial({ color: COAT_LIGHT_COLOR });
  const eye = new MeshLambertMaterial({ color: EYE_COLOR });

  const body = new Mesh(new SphereGeometry(0.11, 7, 5), fur);
  body.name = 'puppy-body';
  body.scale.set(1.3, 0.9, 0.85);
  body.position.set(-0.02, 0.11, 0);
  group.add(body);

  const head = new Mesh(new SphereGeometry(0.085, 6, 4), fur);
  head.name = 'puppy-head';
  head.position.set(0.12, 0.16, 0);
  group.add(head);

  const snout = new Mesh(new SphereGeometry(0.045, 5, 3), light);
  snout.name = 'puppy-snout';
  snout.scale.set(1.2, 0.8, 0.9);
  snout.position.set(0.19, 0.14, 0);
  group.add(snout);

  const nose = new Mesh(new SphereGeometry(0.018, 4, 3), eye);
  nose.name = 'puppy-nose';
  nose.position.set(0.235, 0.15, 0);
  group.add(nose);

  for (const side of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.035, 0.07, 4), dark);
    ear.name = side < 0 ? 'puppy-ear-l' : 'puppy-ear-r';
    ear.position.set(0.1, 0.23, side * 0.055);
    ear.rotation.x = side * 0.35;
    group.add(ear);

    const paw = new Mesh(new BoxGeometry(0.04, 0.06, 0.04), dark);
    paw.name = side < 0 ? 'puppy-leg-front-l' : 'puppy-leg-front-r';
    paw.position.set(0.07, 0.03, side * 0.055);
    group.add(paw);
    const hind = new Mesh(new BoxGeometry(0.04, 0.06, 0.04), dark);
    hind.name = side < 0 ? 'puppy-leg-back-l' : 'puppy-leg-back-r';
    hind.position.set(-0.1, 0.03, side * 0.055);
    group.add(hind);
  }

  // One eye per side, set wide so the face reads even at 48 px.
  for (const side of [-1, 1]) {
    const dot = new Mesh(new SphereGeometry(0.014, 4, 3), eye);
    dot.name = side < 0 ? 'puppy-eye-l' : 'puppy-eye-r';
    dot.position.set(0.185, 0.185, side * 0.035);
    group.add(dot);
  }

  const tail = new Mesh(new ConeGeometry(0.025, 0.08, 4), light);
  tail.name = 'puppy-tail';
  tail.position.set(-0.15, 0.16, 0);
  tail.rotation.z = -0.9;
  group.add(tail);

  return group;
}
