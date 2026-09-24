/**
 * The pond's waddling ducks (FR5): chunky low-poly primitives at the water's
 * edge in the puppy's pattern — shared materials, zero new art files,
 * ~200 triangles each. Scenery only: no collision, no tap, no sound. They
 * waddle in place with a gentle squash-and-stretch while the car splashes by.
 *
 * Scene/visual code — manual-verify per the workflow's Guiding Principle, no
 * red/green here.
 */

import type { Object3D } from 'three';
import { ConeGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';
import type { TownGrid } from './townGrid';

/** Body yellow — the kit family's warm yellow swatch. */
export const DUCK_COLOR = 0xffe44b;
/** Bill and feet — the family's warm cone swatch. */
export const DUCK_BEAK_COLOR = 0xdba33d;
export const DUCK_EYE_COLOR = 0x2b2b2b;

/** Where the flock stands on its pond tile: near the edges, never the centre. */
const DUCK_SPOTS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 0.26, y: -0.16 },
  { x: -0.24, y: -0.2 },
  { x: 0.02, y: 0.3 },
];

export interface PondDucks {
  readonly group: Object3D;
  /** Waddle-in-place: squash-and-stretch with a gentle sway. */
  update(deltaSeconds: number): void;
}

/** A low-poly duck facing +x: round body, small head, flat bill, stub tail. */
function createDuck(): Object3D {
  const group = new Group();
  group.name = 'duck';

  const yellow = new MeshLambertMaterial({ color: DUCK_COLOR });
  const bill = new MeshLambertMaterial({ color: DUCK_BEAK_COLOR });
  const eye = new MeshLambertMaterial({ color: DUCK_EYE_COLOR });

  const body = new Mesh(new SphereGeometry(0.055, 8, 6), yellow);
  body.name = 'duck-body';
  body.scale.set(1.25, 0.9, 0.95);
  body.position.set(-0.01, 0.05, 0);
  group.add(body);

  const head = new Mesh(new SphereGeometry(0.034, 6, 4), yellow);
  head.name = 'duck-head';
  head.position.set(0.06, 0.1, 0);
  group.add(head);

  const beak = new Mesh(new ConeGeometry(0.016, 0.04, 6), bill);
  beak.name = 'duck-bill';
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.1, 0.095, 0);
  group.add(beak);

  const tail = new Mesh(new ConeGeometry(0.018, 0.04, 5), yellow);
  tail.name = 'duck-tail';
  tail.position.set(-0.08, 0.08, 0);
  tail.rotation.z = 0.9;
  group.add(tail);

  // One eye per side, set wide so the face reads at play distance.
  for (const side of [-1, 1]) {
    const dot = new Mesh(new SphereGeometry(0.008, 4, 3), eye);
    dot.name = side < 0 ? 'duck-eye-l' : 'duck-eye-r';
    dot.position.set(0.08, 0.11, side * 0.02);
    group.add(dot);
  }

  return group;
}

/**
 * The flock on the town's pond green: three ducks at the water's edge with
 * deterministic poses. An empty group on a town without a pond tile.
 */
export function createPondDucks(grid: TownGrid): PondDucks {
  const group = new Group();
  group.name = 'pond-ducks';

  // Map-driven like every derived placement: the pond is wherever the town
  // authors its 'pond' green, never a hardcoded tile.
  let pond: { x: number; y: number } | undefined;
  for (let y = 0; y < grid.size && pond === undefined; y += 1) {
    for (let x = 0; x < grid.size; x += 1) {
      if (grid.tileAt({ x, y }) === 'pond') {
        pond = { x, y };
        break;
      }
    }
  }

  const ducks: { readonly duck: Object3D; readonly facing: number }[] = [];
  if (pond !== undefined) {
    const centre = grid.tileToWorld(pond);
    DUCK_SPOTS.forEach((spot, index) => {
      const duck = createDuck();
      duck.position.set(
        centre.x + spot.x * grid.tileSize,
        0,
        centre.z + spot.y * grid.tileSize,
      );
      const facing = -0.5 + index * 1.1;
      duck.rotation.y = facing;
      group.add(duck);
      ducks.push({ duck, facing });
    });
  }

  let time = 0;
  return {
    group,
    update: (deltaSeconds) => {
      time += deltaSeconds;
      for (const [index, entry] of ducks.entries()) {
        // Squash-and-stretch: as the body dips it spreads, as it rises it
        // stretches — a toy waddle on the spot, never a step away.
        const waddle = Math.sin(time * 3 + index * 2.1);
        entry.duck.scale.set(1 - waddle * 0.06, 1 + waddle * 0.08, 1 - waddle * 0.06);
        entry.duck.rotation.y = entry.facing + waddle * 0.1;
      }
    },
  };
}
