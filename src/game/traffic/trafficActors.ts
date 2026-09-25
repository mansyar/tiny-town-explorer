import {
  type BufferGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelLibrary } from '../assets/modelLibrary';
import { PARKED_CAR_MODELS } from '../assets/modelRegistry';
import { PARKED_CAR_FIT } from '../town/townTypes';
import { createVehicleActor, ROAD_SURFACE_HEIGHT } from '../vehicle/vehicleActor';
import { FLEET_FACING_YAW } from '../vehicle/vehicleSystem';
import type { TrafficActorKind, TrafficPose } from './trafficSystem';

/**
 * The ambient actor bodies in the scene.
 *
 * Car Kit actors keep the existing fitted model path. The small creatures use
 * the same low-poly primitive language as the pond ducks: no new GLB, no tap
 * identity, and no real shadow-map casters because the shared traffic blobs
 * carry their grounding.
 */

type CreatureKind = Extract<TrafficActorKind, 'cat' | 'rabbit'>;

interface MountedActor {
  readonly object: Group;
  sync(deltaSeconds: number): void;
}

export interface TrafficActors {
  /** Scene nodes to add to the town. */
  readonly objects: readonly Group[];
  /** Copies every actor's pose and advances its profile-specific animation. */
  sync(deltaSeconds?: number): void;
}

/**
 * Mounts one model or primitive per pose and starts them at their live state.
 *
 * @param library Source of kit models (shared templates, cloned instances).
 * @param poses Live pose mirrors from the traffic system.
 */
export async function mountTrafficActors(
  library: ModelLibrary,
  poses: readonly TrafficPose[],
): Promise<TrafficActors> {
  const actors: MountedActor[] = [];
  for (const pose of poses) {
    if (pose.kind === 'cat' || pose.kind === 'rabbit') {
      actors.push(createCreatureActor(pose.kind, pose));
      continue;
    }

    const vehicleActor = await createVehicleActor(
      library,
      PARKED_CAR_MODELS[pose.kind],
      pose,
      {
        facingYaw: FLEET_FACING_YAW,
        fitLength: PARKED_CAR_FIT,
      },
    );
    disableRealShadows(vehicleActor.object);
    actors.push({
      object: vehicleActor.object,
      sync: () => {
        vehicleActor.sync();
      },
    });
  }

  return {
    objects: actors.map((actor) => actor.object),
    sync(deltaSeconds = 0): void {
      for (const actor of actors) {
        actor.sync(deltaSeconds);
      }
    },
  };
}

const CAT_BODY = 0xf29b55;
const CAT_BELLY = 0xffd18a;
const RABBIT_BODY = 0xd9c7b0;
const RABBIT_INNER_EAR = 0xf2a6a6;
const CREATURE_EYE = 0x2b2b2b;

/** One primitive of a creature, in the creature's local space. */
interface CreaturePart {
  readonly geometry: SphereGeometry | ConeGeometry;
  readonly material: MeshLambertMaterial;
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}

/**
 * Builds one creature and merges its parts into a single mesh per material.
 *
 * A creature waddles, hops, and squashes as one rigid body, so its parts never
 * move on their own. Merging them keeps the same picture for three draw calls
 * instead of the dozen a cat is made of, which is what the render budget needs.
 */
function buildCreature(name: string, parts: readonly CreaturePart[]): Group {
  const group = new Group();
  group.name = name;
  const byMaterial = new Map<
    MeshLambertMaterial,
    { name: string; geometries: BufferGeometry[] }
  >();

  for (const part of parts) {
    const transform = new Object3D();
    transform.position.set(...part.position);
    if (part.rotation) {
      transform.rotation.set(...part.rotation);
    }
    if (part.scale) {
      transform.scale.set(...part.scale);
    }
    transform.updateMatrix();

    const bucket = byMaterial.get(part.material);
    // Every part owns a uniquely built geometry, so it can be transformed in
    // place instead of cloned first.
    const geometry = part.geometry.applyMatrix4(transform.matrix);
    if (bucket) {
      bucket.geometries.push(geometry);
      continue;
    }
    byMaterial.set(part.material, { name: part.name, geometries: [geometry] });
  }

  for (const [material, bucket] of byMaterial) {
    const merged = mergeGeometries(bucket.geometries);
    // Spheres and cones carry the same attributes, so a merge only fails if a
    // profile mixes in an incompatible geometry; skipping then loses one
    // creature's body instead of the whole town's actors.
    if (!merged) {
      continue;
    }
    const mesh = new Mesh(merged, material);
    mesh.name = bucket.name;
    group.add(mesh);
  }

  return group;
}

/** A low-poly cat facing +z, the town's heading convention. */
function createCat(): Group {
  const bodyMaterial = new MeshLambertMaterial({ color: CAT_BODY });
  const bellyMaterial = new MeshLambertMaterial({ color: CAT_BELLY });
  const eyeMaterial = new MeshLambertMaterial({ color: CREATURE_EYE });
  const parts: CreaturePart[] = [
    {
      name: 'cat-body',
      geometry: new SphereGeometry(0.1, 8, 6),
      material: bodyMaterial,
      position: [0, 0.09, 0],
      scale: [1.2, 0.82, 1.05],
    },
    {
      name: 'cat-belly',
      geometry: new SphereGeometry(0.065, 7, 5),
      material: bellyMaterial,
      position: [0, 0.075, 0.065],
    },
    {
      name: 'cat-head',
      geometry: new SphereGeometry(0.072, 7, 5),
      material: bodyMaterial,
      position: [0, 0.16, 0.09],
    },
    {
      name: 'cat-tail',
      geometry: new ConeGeometry(0.025, 0.13, 6),
      material: bodyMaterial,
      position: [0, 0.11, -0.12],
      rotation: [Math.PI / 2.6, 0, 0],
    },
  ];

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'l' : 'r';
    parts.push(
      {
        name: `cat-ear-${suffix}`,
        geometry: new ConeGeometry(0.028, 0.07, 5),
        material: bodyMaterial,
        position: [side * 0.045, 0.225, 0.085],
        rotation: [0, 0, side * -0.18],
      },
      {
        name: `cat-eye-${suffix}`,
        geometry: new SphereGeometry(0.009, 4, 3),
        material: eyeMaterial,
        position: [side * 0.025, 0.17, 0.15],
      },
      {
        name: `cat-foot-${suffix}`,
        geometry: new SphereGeometry(0.025, 5, 4),
        material: bodyMaterial,
        position: [side * 0.055, 0.025, 0.025],
      },
    );
  }

  return buildCreature('ambient-creature-cat', parts);
}

/** A low-poly rabbit facing +z, with tall ears that read at play distance. */
function createRabbit(): Group {
  const bodyMaterial = new MeshLambertMaterial({ color: RABBIT_BODY });
  const earMaterial = new MeshLambertMaterial({ color: RABBIT_INNER_EAR });
  const eyeMaterial = new MeshLambertMaterial({ color: CREATURE_EYE });
  const parts: CreaturePart[] = [
    {
      name: 'rabbit-body',
      geometry: new SphereGeometry(0.1, 8, 6),
      material: bodyMaterial,
      position: [0, 0.1, -0.01],
      scale: [1.05, 0.9, 1.2],
    },
    {
      name: 'rabbit-head',
      geometry: new SphereGeometry(0.07, 7, 5),
      material: bodyMaterial,
      position: [0, 0.18, 0.085],
    },
    {
      name: 'rabbit-tail',
      geometry: new SphereGeometry(0.035, 6, 4),
      material: bodyMaterial,
      position: [0, 0.12, -0.13],
    },
  ];

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'l' : 'r';
    parts.push(
      {
        name: `rabbit-ear-${suffix}`,
        geometry: new ConeGeometry(0.027, 0.16, 6),
        material: earMaterial,
        position: [side * 0.035, 0.29, 0.075],
        rotation: [0, 0, side * -0.12],
      },
      {
        name: `rabbit-eye-${suffix}`,
        geometry: new SphereGeometry(0.009, 4, 3),
        material: eyeMaterial,
        position: [side * 0.024, 0.19, 0.14],
      },
      {
        name: `rabbit-foot-${suffix}`,
        geometry: new SphereGeometry(0.027, 5, 4),
        material: bodyMaterial,
        position: [side * 0.055, 0.025, 0.06],
        scale: [1.2, 0.7, 1.35],
      },
    );
  }

  return buildCreature('ambient-creature-rabbit', parts);
}

/** Creates a visual-only primitive actor and keeps its pose in sync. */
function createCreatureActor(kind: CreatureKind, pose: TrafficPose): MountedActor {
  const object = kind === 'cat' ? createCat() : createRabbit();
  disableRealShadows(object);
  const phase = kind === 'cat' ? 0 : 1.4;
  let time = 0;

  return {
    object,
    sync(deltaSeconds: number): void {
      time += Math.max(0, deltaSeconds);
      const bounce = pose.bounceProgress();
      const impact = bounce === undefined ? 0 : Math.sin(Math.PI * bounce);
      const gait = Math.sin(time * (kind === 'cat' ? 7 : 5) + phase);
      const hop = kind === 'rabbit' ? Math.max(0, gait) * 0.035 : 0;
      const squash = 1 - impact * 0.18;
      const spread = 1 + impact * 0.08;

      object.position.set(pose.position.x, ROAD_SURFACE_HEIGHT + hop, pose.position.z);
      object.rotation.y = pose.heading();
      object.rotation.z = kind === 'cat' ? gait * 0.05 : 0;
      object.scale.set(spread, squash, spread);
    },
  };
}

function disableRealShadows(object: Group): void {
  object.traverse((node) => {
    node.castShadow = false;
  });
}
