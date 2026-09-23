import type { Group } from 'three';
import type { ModelLibrary } from '../assets/modelLibrary';
import { PARKED_CAR_MODELS } from '../assets/modelRegistry';
import { PARKED_CAR_FIT } from '../town/townTypes';
import { createVehicleActor, type VehicleActor } from '../vehicle/vehicleActor';
import { FLEET_FACING_YAW } from '../vehicle/vehicleSystem';
import type { TrafficPose } from './trafficSystem';

/**
 * The wanderers' bodies in the scene (FR1).
 *
 * The town's traffic is drawn exactly like the fleet: one Car Kit model per
 * mover, seated on the asphalt and fitted to the parked cars' 0.55 length, so
 * a moving car is the same size as its parked cousins. Car Kit art is authored
 * facing +z — the car's nose (kit-mount-measurements.md) — so the models mount
 * at the fleet's `FLEET_FACING_YAW` and nose along the route heading as they
 * drive. Getting this wrong is invisible on a parked car and glaring on a
 * moving one.
 *
 * They cast no real shadows (FR8): a following blob under each car carries
 * that job, because every shadow-map caster re-renders the town once more per
 * frame — the same rule the parked cars follow.
 */

export interface TrafficActors {
  /** Scene nodes to add to the town. */
  readonly objects: readonly Group[];
  /** Copies every mover's pose onto its model. */
  sync(): void;
}

/**
 * Mounts one model per pose and starts them at their poses' current state.
 *
 * @param library Source of kit models (shared templates, cloned instances).
 * @param poses Live pose mirrors from the traffic system (FR1).
 */
export async function mountTrafficActors(
  library: ModelLibrary,
  poses: readonly TrafficPose[],
): Promise<TrafficActors> {
  const actors: VehicleActor[] = [];
  for (const pose of poses) {
    const actor = await createVehicleActor(library, PARKED_CAR_MODELS[pose.kind], pose, {
      facingYaw: FLEET_FACING_YAW,
      fitLength: PARKED_CAR_FIT,
    });
    // The blobs are these cars' shadows (FR8), so the shadow-map pass must
    // never see them.
    actor.object.traverse((node) => {
      node.castShadow = false;
    });
    actors.push(actor);
  }
  return {
    objects: actors.map((actor) => actor.object),
    sync(): void {
      for (const actor of actors) {
        actor.sync();
      }
    },
  };
}
