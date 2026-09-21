import { Box3, Group, type Object3D, Vector3 } from 'three';
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
 *
 * The squash on impact is read from the motor's recoil rather than triggered by
 * an event, so the two can never disagree: while the motor is springing back,
 * the body is flat, and when it is not, the body is not.
 */

/**
 * Asphalt height above a tile's base, measured from City Kit (Roads): road
 * pieces span 0.00 to 0.02, with the driving surface at 0.01. Cars ride on the
 * asphalt, not on the base plane.
 */
export const ROAD_SURFACE_HEIGHT = 0.01;

/**
 * How flat the body squashes at the peak of a bonk, as a share of its height.
 * Big enough to read as comedy at play distance, small enough to stay a car.
 */
export const IMPACT_SQUASH = 0.25;

/**
 * How much the body spreads sideways as it flattens.
 *
 * Squashing one axis alone reads as a shrinking car; spreading the other two
 * keeps it looking like a soft thing being pressed, which is the gag.
 */
export const IMPACT_SPREAD = 0.15;

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
 * Flattens and spreads the body for a bonk.
 *
 * The curve peaks at the middle of the recoil and returns to zero at both ends,
 * so the body is never left mid-squash however the recoil is interrupted.
 */
function squash(
  model: Object3D,
  restScale: { readonly x: number; readonly y: number; readonly z: number },
  progress: number | undefined,
): void {
  const amount = progress === undefined ? 0 : Math.sin(Math.PI * progress);
  model.scale.set(
    restScale.x * (1 + IMPACT_SPREAD * amount),
    restScale.y * (1 - IMPACT_SQUASH * amount),
    restScale.z * (1 + IMPACT_SPREAD * amount),
  );
}

/**
 * How a kit's model has to be turned and sized to drive the car.
 */
export interface VehicleActorOptions {
  /**
   * Yaw that puts the kit's nose on the car's nose. The kits disagree: the Toy
   * Car Kit authors vehicles facing −z, the Car Kit faces +z.
   */
  readonly facingYaw?: number;
  /**
   * Longest horizontal extent to fit the model into — the car's own collision
   * capsule. Kit fleet vehicles are authored about four times the town's
   * scale, so they are measured and scaled down rather than re-authored.
   */
  readonly fitLength?: number;
}

/**
 * Builds the car and starts it at the motor's current pose.
 *
 * @param library Source of kit models (shared templates, cloned instances).
 * @param url Bundled vehicle model URL.
 * @param motor The car's motion.
 * @param options Facing correction and length fit for the kit's model.
 */
export async function createVehicleActor(
  library: ModelLibrary,
  url: string,
  motor: VehicleMotor,
  options: VehicleActorOptions = {},
): Promise<VehicleActor> {
  const { facingYaw = MODEL_FACING_YAW, fitLength } = options;
  const model = await library.instantiate(url);
  // Seat the model on the asphalt by measuring it, rather than trusting a
  // kit's origin convention: swapping in another vehicle must not float it.
  model.position.y -= new Box3().setFromObject(model).min.y;
  model.position.y += ROAD_SURFACE_HEIGHT;
  model.rotation.y += facingYaw;
  // Fitting after turning, so a long vehicle is measured across the axis it
  // will actually drive along. Never scaled up: a small model stays small.
  if (fitLength !== undefined) {
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    const longest = Math.max(size.x, size.z);
    if (longest > fitLength) {
      model.scale.multiplyScalar(fitLength / longest);
    }
  }

  const object = new Group();
  object.name = 'vehicle';
  object.add(model);

  const restScale = model.scale.clone();
  const actor: VehicleActor = {
    object,
    sync(): void {
      object.position.x = motor.position.x;
      object.position.z = motor.position.z;
      object.rotation.y = motor.heading();
      squash(model, restScale, motor.bounceProgress());
    },
  };
  actor.sync();
  return actor;
}
