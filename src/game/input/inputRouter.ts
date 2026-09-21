import { type OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { TownGrid } from '../town/townGrid';
import type { Vec2 } from '../town/townTypes';

/**
 * Turns taps into intents.
 *
 * The router owns the forgiving-input rules and nothing else: it projects a tap
 * onto the ground plane, decides whether the kid meant a crashable prop, and
 * classifies the result as a destination to drive to or as in-place feedback.
 * Routing, driving and collision all live downstream, which keeps every rule
 * here testable without a browser.
 *
 * Two rules come straight from the product guidelines:
 *
 * - **Infinite ground-plane raycast.** Any tap anywhere on screen resolves to a
 *   ground point, so a touch never falls on empty space.
 * - **The town is the world.** A tap beyond the town's edge lands on that edge,
 *   so the car is never sent off the map — the ground outside is empty sky, and
 *   a car standing in it is a lost car.
 * - **Newest tap wins.** Every tap that means a destination supersedes the one
 *   before it; a honk is feedback, so it never cancels a route in progress.
 */

/**
 * A tap this close to the car honks instead of driving — the product
 * guideline's 0.5-unit dead zone. Measured from the resolved target, so tapping
 * a cone under the car's nose honks rather than spinning on the spot.
 */
export const DEAD_ZONE_RADIUS = 0.5;

/**
 * How far a tap may land from a crashable prop and still mean that prop.
 *
 * Generous (nearly half a tile) because a toddler's aim is approximate, but
 * short of a full tile so it cannot steal taps aimed at the street.
 */
export const PROP_SNAP_RADIUS = 0.45;

/** A screen position in normalised device coordinates (x right, y up, ±1 at the edges). */
export interface NdcPoint {
  readonly x: number;
  readonly y: number;
}

/** A viewport rectangle in CSS pixels, as `getBoundingClientRect` reports it. */
export interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A destination to drive to. */
export interface DriveCommand {
  readonly kind: 'drive';
  /** Monotonic per router; the newest id is the one that counts. */
  readonly id: number;
  /** World-space point on the ground plane, always inside the town's bounds. */
  readonly target: Vec2;
  /** Set when the tap snapped to a crashable prop. */
  readonly propId?: string;
}

/** In-place feedback: a squish and a honk where the car already stands. */
export interface HonkCommand {
  readonly kind: 'honk';
  readonly id: number;
  readonly at: Vec2;
}

export type TapCommand = DriveCommand | HonkCommand;

export interface InputRouterOptions {
  readonly camera: OrthographicCamera;
  readonly grid: TownGrid;
  /** Re-read on every tap, because the car is moving while the kid taps. */
  readonly getCarPosition: () => Vec2;
}

export interface InputRouter {
  /** Resolves one tap into what it means. */
  tapAt(point: NdcPoint): TapCommand;
  /** The newest destination, or `undefined` if only honks have landed. */
  latest(): DriveCommand | undefined;
  /** Whether `command` is still the newest destination (mash safety). */
  isCurrent(command: DriveCommand): boolean;
}

/** The ground plane the town stands on. */
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Converts a pointer position in CSS pixels into normalised device coordinates.
 *
 * Separated from the pointer listener so the mapping is testable: y flips
 * because NDC measures upwards while the DOM measures downwards, and the rect
 * is respected because the canvas rarely starts at the viewport origin.
 */
export function ndcFromPoint(
  clientX: number,
  clientY: number,
  rect: ViewportRect,
): NdcPoint {
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: 1 - ((clientY - rect.top) / rect.height) * 2,
  };
}

/** Creates the router for one camera and town. */
export function createInputRouter({
  camera,
  grid,
  getCarPosition,
}: InputRouterOptions): InputRouter {
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const hit = new Vector3();
  let sequence = 0;
  let latestDrive: DriveCommand | undefined;

  const honkAt = (at: Vec2): HonkCommand => {
    sequence += 1;
    return { kind: 'honk', id: sequence, at };
  };

  const projectToGround = (point: NdcPoint): Vec2 | undefined => {
    // Sync the camera pose here rather than trusting the render loop: a tap can
    // land between frames, when the matrices the ray is built from are a frame
    // old or — on the first tap — not composed at all.
    camera.updateMatrixWorld();
    pointer.set(point.x, point.y);
    raycaster.setFromCamera(pointer, camera);
    const intersection = raycaster.ray.intersectPlane(GROUND, hit);
    return intersection === null ? undefined : { x: intersection.x, z: intersection.z };
  };

  return {
    tapAt(point: NdcPoint): TapCommand {
      const ground = projectToGround(point);
      const car = getCarPosition();
      if (ground === undefined) {
        // Only a camera aimed at the horizon gets here, and a tap that resolves
        // to nothing still deserves an answer.
        return honkAt(car);
      }

      const landed = grid.clampToBounds(ground);
      const prop = grid.propsWithin(landed, PROP_SNAP_RADIUS)[0];
      const target = prop === undefined ? landed : { ...prop.position };
      if (distance(target, car) <= DEAD_ZONE_RADIUS) {
        return honkAt(car);
      }

      sequence += 1;
      latestDrive = { kind: 'drive', id: sequence, target, propId: prop?.id };
      return latestDrive;
    },

    latest(): DriveCommand | undefined {
      return latestDrive;
    },

    isCurrent(command: DriveCommand): boolean {
      return latestDrive !== undefined && command.id === latestDrive.id;
    },
  };
}

function distance(from: Vec2, to: Vec2): number {
  return Math.hypot(from.x - to.x, from.z - to.z);
}
