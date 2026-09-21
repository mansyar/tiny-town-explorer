import {
  Box3,
  type BufferGeometry,
  Group,
  type Material,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  Vector3,
} from 'three';
import type { ModelLibrary } from '../assets/modelLibrary';
import type { TownGrid } from './townGrid';
import { type ModelPlacement, planTown, type TownPlan } from './townLayout';

/**
 * Mounts a town plan: ground quads plus one instantiated kit model per
 * placement.
 *
 * Two things every kit model needs are handled here rather than trusted to
 * authoring, because the kits disagree with each other about both:
 *
 * - **Seating.** Models are measured and lifted so their lowest point rests on
 *   the ground. City Kit (Roads) already stands on its origin, while the Toy
 *   Car Kit's connectable track hangs a full unit below it; measuring makes the
 *   difference invisible to the caller.
 * - **Fitting.** A placement may cap its footprint (`fitWithin`). Kit buildings
 *   run up to 1.83 units wide against one-tile lots, so they are uniformly
 *   scaled down rather than allowed to overhang the road.
 */

/** The mounted town plus the teardown for everything it owns. */
export interface TownMount {
  readonly group: Group;
  /** Frees ground geometry/materials and empties the group. Models are owned by
   * the library that loaded them. */
  dispose(): void;
}

/**
 * Builds the town's scene graph.
 *
 * @param grid Authored town data.
 * @param library Source of kit models (shared templates, cloned instances).
 * @param plan Precomputed plan, defaulting to {@link planTown}.
 */
export async function mountTown(
  grid: TownGrid,
  library: ModelLibrary,
  plan: TownPlan = planTown(grid),
): Promise<TownMount> {
  const group = new Group();
  group.name = 'town';

  // One unit plane shared by every ground tile; each mesh lays it flat and
  // scales it to its tile, which keeps setup cost flat as the map grows.
  const groundGeometry = new PlaneGeometry(1, 1);
  const groundMaterials = new Map<number, Material>();

  const groundMaterial = (color: number): Material => {
    const existing = groundMaterials.get(color);
    if (existing !== undefined) {
      return existing;
    }
    const material = new MeshLambertMaterial({ color });
    groundMaterials.set(color, material);
    return material;
  };

  for (const placement of plan.placements) {
    if (placement.kind === 'ground') {
      group.add(mountGround(placement, groundGeometry, groundMaterial(placement.color)));
      continue;
    }
    group.add(await mountModel(placement, library));
  }

  return {
    group,
    dispose(): void {
      groundGeometry.dispose();
      for (const material of groundMaterials.values()) {
        material.dispose();
      }
      groundMaterials.clear();
      group.clear();
    },
  };
}

function mountGround(
  placement: {
    readonly name: string;
    readonly position: { x: number; z: number };
    readonly size: number;
  },
  geometry: BufferGeometry,
  material: Material,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = placement.name;
  mesh.position.set(placement.position.x, 0, placement.position.z);
  // The plane is authored in XY; lay it flat, then stretch it in its own x/y so
  // the quad covers the tile in world x/z.
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(placement.size, placement.size, 1);
  mesh.receiveShadow = true;
  return mesh;
}

async function mountModel(
  placement: ModelPlacement,
  library: ModelLibrary,
): Promise<Object3D> {
  const object = await library.instantiate(placement.url);

  if (placement.fitWithin !== undefined) {
    const scale = fitScale(placement.fitWithin, object);
    if (scale < 1) {
      object.scale.multiplyScalar(scale);
    }
  }
  object.position.y -= new Box3().setFromObject(object).min.y;
  object.position.x += placement.position.x;
  object.position.z += placement.position.z;
  object.rotation.y = placement.yaw;
  object.name = placement.name;
  return object;
}

/** Uniform scale that brings a model's widest horizontal extent under a cap. */
function fitScale(cap: number, object: Object3D): number {
  const size = new Box3().setFromObject(object).getSize(new Vector3());
  const widest = Math.max(size.x, size.z);
  return widest > 0 ? Math.min(1, cap / widest) : 1;
}
