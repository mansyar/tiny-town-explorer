import { Box3, Group } from 'three';
import type { ModelLibrary } from '../assets/modelLibrary';
import type { VehicleMotor } from './vehicleMotor';

/**
 * The drivable car in the scene: a kit model that copies the motor's pose every
 * frame.
 *
 * Keeping the model and the motion apart is what lets the drive feel be tested
 * without a renderer — the motor owns the numbers, and this owns placing a mesh
 * where those numbers say. The model hangs inside a group so that seating it on
 * the asphalt never fights with the pose the motor writes.
 */

/**
 * Asphalt height above a tile's base, measured from City Kit (Roads): road
 * pieces span 0.00 to 0.02, with the driving surface at 0.01. Cars ride on the
 * asphalt, not on the base plane.
 */
export const ROAD_SURFACE_HEIGHT = 0.01;

/**
 * Yaw applied to the model inside its holder, so the holder's `+z` is always
 * the car's nose.
 *
 * The Toy Car Kit authors its vehicles facing −z (a truck's cargo box sits
 * along +z, away from the cab), while the town's own models face +z — so a kit
 * vehicle needs half a turn to sit inside the town's convention, or it drives
 * cab-last. Measured from the model's geometry with `measureKitModel`-style
 * probes, not assumed: getting this wrong is invisible until you watch it move.
 */
export const MODEL_FACING_YAW = Math.PI;

export interface VehicleActor {
  /** Scene node to add; the motor's pose is applied to this. */
  readonly object: Group;
  /** Copies the motor's position and heading onto the model. */
  sync(): void;
}

/**
 * Builds the car and starts it at the motor's current pose.
 *
 * @param library Source of kit models (shared templates, cloned instances).
 * @param url Bundled vehicle model URL.
 * @param motor The car's motion.
 */
export async function createVehicleActor(
  library: ModelLibrary,
  url: string,
  motor: VehicleMotor,
): Promise<VehicleActor> {
  const model = await library.instantiate(url);
  // Seat the model on the asphalt by measuring it, rather than trusting a
  // kit's origin convention: swapping in another vehicle must not float it.
  model.position.y -= new Box3().setFromObject(model).min.y;
  model.position.y += ROAD_SURFACE_HEIGHT;
  model.rotation.y += MODEL_FACING_YAW;

  const object = new Group();
  object.name = 'vehicle';
  object.add(model);

  const actor: VehicleActor = {
    object,
    sync(): void {
      object.position.x = motor.position.x;
      object.position.z = motor.position.z;
      object.rotation.y = motor.heading();
    },
  };
  actor.sync();
  return actor;
}
