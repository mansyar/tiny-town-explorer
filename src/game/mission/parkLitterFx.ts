/**
 * What the park's litter looks like (FR1): two small primitive builds — a
 * tied bag and a crumpled sheet of paper — in the props' lit material family,
 * flat colours chosen to stay readable at 48 px on a tablet.
 *
 * Each factory returns a group whose origin sits at the ground plane, so a
 * piece drops flush wherever `spawnParkLitter` placed it and the idle bounce
 * (Phase 5) can bob it from its own base. Named meshes, no textures: the
 * whole point of primitives is that they cost nothing and never 404.
 *
 * Scene/visual code — manual-verify per the workflow's Guiding Principle, no
 * red/green here.
 */

import {
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three';
import type { LitterPiece } from './parkLitter';

/** Lifted just above the grass so a piece never z-fights its tile. */
export const LITTER_SURFACE_HEIGHT = 0.02;

/** Roughly a fifth of a tile: a clear target without cluttering the park. */
export const LITTER_SIZE = 0.22;

/** A tied carrier bag: pale, slumped, with a pinched knot on top. */
export function createTiedBag(): Group {
  const group = new Group();
  group.name = 'parkTiedBag';

  const material = new MeshLambertMaterial({ color: 0xe8eef2 });

  const body = new Mesh(new SphereGeometry(0.1, 8, 6), material);
  body.name = 'parkTiedBag-body';
  body.scale.set(1, 0.75, 0.9);
  body.position.y = 0.075;
  group.add(body);

  const knot = new Mesh(new ConeGeometry(0.03, 0.05, 5), material);
  knot.name = 'parkTiedBag-knot';
  knot.position.y = 0.16;
  group.add(knot);

  return group;
}

/** A crumpled sheet: flat-shaded facets so it catches light like scrunched paper. */
export function createCrumpledPaper(): Group {
  const group = new Group();
  group.name = 'parkCrumpledPaper';

  const material = new MeshLambertMaterial({ color: 0xf4e9c8, flatShading: true });

  const wad = new Mesh(new IcosahedronGeometry(0.1, 0), material);
  wad.name = 'parkCrumpledPaper-wad';
  wad.scale.set(1, 0.55, 0.9);
  wad.position.y = 0.055;
  wad.rotation.set(0.3, 0.7, 0.1);
  group.add(wad);

  return group;
}

/** Seconds per idle bounce — slow enough to read as waiting, not jumping. */
const FIELD_BOUNCE_SECONDS = 1.1;
/** How far a bounce lifts a piece, in world units. */
const FIELD_BOUNCE_HEIGHT = 0.045;

/** One laid-out piece of litter: a mesh bobbing on its own phase. */
interface FieldEntry {
  readonly node: Group;
  readonly base: number;
  readonly phase: number;
}

/**
 * The whole field as one scene object (FR1's pieces "bounce gently"): pieces
 * sit at their `spawnParkLitter` positions, each bobs on a staggered phase,
 * and a collected piece simply leaves. `main.ts` owns *when* it is built.
 */
export interface LitterField {
  readonly object: Group;
  /** A piece was collected: it stops bouncing and leaves the show. */
  remove(id: string): void;
  /** Advances every remaining piece's bounce. */
  update(deltaSeconds: number): void;
}

export function createLitterField(pieces: readonly LitterPiece[]): LitterField {
  const object = new Group();
  object.name = 'parkLitterField';

  const active = new Map<string, FieldEntry>();
  pieces.forEach((piece, index) => {
    const node = index % 2 === 0 ? createTiedBag() : createCrumpledPaper();
    node.position.set(piece.position.x, LITTER_SURFACE_HEIGHT, piece.position.z);
    object.add(node);
    active.set(piece.id, {
      node,
      base: LITTER_SURFACE_HEIGHT,
      phase: (index / Math.max(1, pieces.length)) * FIELD_BOUNCE_SECONDS,
    });
  });

  let seconds = 0;
  return {
    object,

    remove(id): void {
      const entry = active.get(id);
      if (entry === undefined) {
        return;
      }
      entry.node.visible = false;
      active.delete(id);
    },

    update(deltaSeconds): void {
      seconds += Math.max(0, deltaSeconds);
      for (const entry of active.values()) {
        const cycle =
          ((seconds + entry.phase) % FIELD_BOUNCE_SECONDS) / FIELD_BOUNCE_SECONDS;
        // Half-cosine: always back at the surface each cycle, never drifting.
        entry.node.position.y =
          entry.base + FIELD_BOUNCE_HEIGHT * (0.5 - 0.5 * Math.cos(cycle * Math.PI * 2));
      }
    },
  };
}
