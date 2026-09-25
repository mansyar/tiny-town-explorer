import { ConeGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';
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

/** A low-poly cat facing +z, the town's heading convention. */
function createCat(): Group {
  const group = new Group();
  group.name = 'ambient-creature-cat';
  const bodyMaterial = new MeshLambertMaterial({ color: CAT_BODY });
  const bellyMaterial = new MeshLambertMaterial({ color: CAT_BELLY });
  const eyeMaterial = new MeshLambertMaterial({ color: CREATURE_EYE });

  const body = new Mesh(new SphereGeometry(0.1, 8, 6), bodyMaterial);
  body.name = 'cat-body';
  body.scale.set(1.2, 0.82, 1.05);
  body.position.set(0, 0.09, 0);
  group.add(body);

  const belly = new Mesh(new SphereGeometry(0.065, 7, 5), bellyMaterial);
  belly.name = 'cat-belly';
  belly.position.set(0, 0.075, 0.065);
  group.add(belly);

  const head = new Mesh(new SphereGeometry(0.072, 7, 5), bodyMaterial);
  head.name = 'cat-head';
  head.position.set(0, 0.16, 0.09);
  group.add(head);

  for (const side of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.028, 0.07, 5), bodyMaterial);
    ear.name = side < 0 ? 'cat-ear-l' : 'cat-ear-r';
    ear.position.set(side * 0.045, 0.225, 0.085);
    ear.rotation.z = side * -0.18;
    group.add(ear);

    const eye = new Mesh(new SphereGeometry(0.009, 4, 3), eyeMaterial);
    eye.name = side < 0 ? 'cat-eye-l' : 'cat-eye-r';
    eye.position.set(side * 0.025, 0.17, 0.15);
    group.add(eye);
  }

  const tail = new Mesh(new ConeGeometry(0.025, 0.13, 6), bodyMaterial);
  tail.name = 'cat-tail';
  tail.position.set(0, 0.11, -0.12);
  tail.rotation.x = Math.PI / 2.6;
  group.add(tail);

  for (const side of [-1, 1]) {
    const foot = new Mesh(new SphereGeometry(0.025, 5, 4), bodyMaterial);
    foot.name = side < 0 ? 'cat-foot-l' : 'cat-foot-r';
    foot.position.set(side * 0.055, 0.025, 0.025);
    group.add(foot);
  }

  return group;
}

/** A low-poly rabbit facing +z, with tall ears that read at play distance. */
function createRabbit(): Group {
  const group = new Group();
  group.name = 'ambient-creature-rabbit';
  const bodyMaterial = new MeshLambertMaterial({ color: RABBIT_BODY });
  const earMaterial = new MeshLambertMaterial({ color: RABBIT_INNER_EAR });
  const eyeMaterial = new MeshLambertMaterial({ color: CREATURE_EYE });

  const body = new Mesh(new SphereGeometry(0.1, 8, 6), bodyMaterial);
  body.name = 'rabbit-body';
  body.scale.set(1.05, 0.9, 1.2);
  body.position.set(0, 0.1, -0.01);
  group.add(body);

  const head = new Mesh(new SphereGeometry(0.07, 7, 5), bodyMaterial);
  head.name = 'rabbit-head';
  head.position.set(0, 0.18, 0.085);
  group.add(head);

  for (const side of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.027, 0.16, 6), earMaterial);
    ear.name = side < 0 ? 'rabbit-ear-l' : 'rabbit-ear-r';
    ear.position.set(side * 0.035, 0.29, 0.075);
    ear.rotation.z = side * -0.12;
    group.add(ear);

    const eye = new Mesh(new SphereGeometry(0.009, 4, 3), eyeMaterial);
    eye.name = side < 0 ? 'rabbit-eye-l' : 'rabbit-eye-r';
    eye.position.set(side * 0.024, 0.19, 0.14);
    group.add(eye);

    const foot = new Mesh(new SphereGeometry(0.027, 5, 4), bodyMaterial);
    foot.name = side < 0 ? 'rabbit-foot-l' : 'rabbit-foot-r';
    foot.position.set(side * 0.055, 0.025, 0.06);
    foot.scale.set(1.2, 0.7, 1.35);
    group.add(foot);
  }

  const tail = new Mesh(new SphereGeometry(0.035, 6, 4), bodyMaterial);
  tail.name = 'rabbit-tail';
  tail.position.set(0, 0.12, -0.13);
  group.add(tail);

  return group;
}

/** Creates a visual-only primitive actor and keeps its pose in sync. */
function createCreatureActor(kind: CreatureKind, pose: TrafficPose): MountedActor {
  const object = kind === 'cat' ? createCat() : createRabbit();
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
