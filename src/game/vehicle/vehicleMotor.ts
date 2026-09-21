import type { Path } from '../path/pathfinder';
import type { Vec2 } from '../town/townTypes';

/**
 * The car's motion: follow a route, turn before driving, arrive and stop.
 *
 * Deliberately free of three.js and of wall-clock time: `update` is handed the
 * frame time, so the same frames always produce the same motion. That is what
 * lets the drive feel be pinned by tests instead of by watching it.
 *
 * Two rules shape the feel:
 *
 * - **Rotate, then drive.** A car pointing the wrong way turns in place until it
 *   is roughly aligned, then moves. Without that it would carve wide arcs
 *   through lawns and overshoot tight corners.
 * - **Constant speed.** No acceleration curve: it is one less thing to tune, and
 *   a toy car that always trundles at the same pace reads as dependable.
 */

/** World units per second while driving. */
export const DRIVE_SPEED = 1.6;

/** Radians per second the car can turn, whether in place or while driving. */
export const TURN_RATE = 4.5;

/** How close counts as arrived at a waypoint or destination. */
export const ARRIVAL_RADIUS = 0.25;

/**
 * Heading error beyond which the car turns in place rather than driving.
 *
 * About 4.5 degrees — roughly one 60 fps frame of turning — so "rotate then
 * drive" means what it says: the car is pointed at its waypoint before it
 * moves, and only the last sliver of the turn is left for it to finish on the
 * move. A looser tolerance is cheaper to tune but makes the car leave each
 * waypoint on an arc, cutting the corner it was meant to take.
 */
export const ALIGN_TOLERANCE = 0.08;

/**
 * A live world point, written in place every frame.
 *
 * The town's `Vec2` is a value (readonly); this is the transform a frame loop
 * owns, so a 60 fps run allocates nothing.
 */
export interface LivePoint {
  x: number;
  z: number;
}

/**
 * Yaw that faces along a direction, matching the town's convention: zero faces
 * south (the kit models' authored facing), a quarter turn clockwise faces east.
 * Feed it straight to a model's `rotation.y`.
 */
export function headingFor(direction: Vec2): number {
  return Math.atan2(direction.x, direction.z);
}

/** Unit vector the car faces at a given heading. */
export function facingOf(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

export interface VehicleMotorOptions {
  readonly position?: Vec2;
  readonly heading?: number;
}

export interface VehicleMotor {
  /** Live position on the ground plane, written in place by {@link update}. */
  readonly position: LivePoint;
  /** Yaw in radians, in the same convention the town uses for its models. */
  heading(): number;
  /** Current speed in world units per second; zero while turning or parked. */
  speed(): number;
  /** Whether a route still has somewhere to go. */
  isDriving(): boolean;
  /** Replaces the route: the newest tap wins, so a new path supersedes the old. */
  setPath(path: Path): void;
  /** Advances the car by one frame. */
  update(deltaSeconds: number): void;
  /** Places the car (spawns, camera cuts). The route is left alone. */
  snapTo(point: Vec2, heading?: number): void;
}

/** Creates a car at the given pose, parked with no route. */
export function createVehicleMotor(options: VehicleMotorOptions = {}): VehicleMotor {
  const position: LivePoint = {
    x: options.position?.x ?? 0,
    z: options.position?.z ?? 0,
  };
  let heading = options.heading ?? 0;
  let currentSpeed = 0;
  let targets: readonly Vec2[] = [];
  let cursor = 0;

  const target = (): Vec2 | undefined => targets[cursor];

  return {
    position,

    heading(): number {
      return heading;
    },

    speed(): number {
      return currentSpeed;
    },

    isDriving(): boolean {
      return target() !== undefined;
    },

    setPath(path: Path): void {
      // Copy rather than hold the caller's route: the cursor consumes these as
      // the car passes them, and a path may be re-used for a second car.
      targets = [...path.waypoints, path.destination];
      cursor = 0;
      currentSpeed = 0;
    },

    update(deltaSeconds: number): void {
      const elapsed = Math.max(deltaSeconds, 0);
      if (elapsed === 0) {
        return;
      }

      // Passing a waypoint advances the route. The first one is usually the
      // tile the car already stands on, so this is also what stops a new route
      // from stalling on its own starting point.
      let next = target();
      while (next !== undefined && distance(position, next) <= ARRIVAL_RADIUS) {
        cursor += 1;
        next = target();
      }
      if (next === undefined) {
        currentSpeed = 0;
        return;
      }

      const desired = headingFor({ x: next.x - position.x, z: next.z - position.z });
      const error = shortestTurn(desired - heading);
      const turned = clampMagnitude(error, TURN_RATE * elapsed);
      heading += turned;

      if (Math.abs(error - turned) > ALIGN_TOLERANCE) {
        // Still pointing too far off: turn on the spot, wheels and all.
        currentSpeed = 0;
        return;
      }

      // Drive where the nose points, so the car can never crab sideways. The
      // tolerance above is small enough that this is the straight line to the
      // waypoint, not an arc that drifts off it.
      currentSpeed = DRIVE_SPEED;
      const facing = facingOf(heading);
      position.x += facing.x * DRIVE_SPEED * elapsed;
      position.z += facing.z * DRIVE_SPEED * elapsed;
    },

    snapTo(point: Vec2, nextHeading?: number): void {
      position.x = point.x;
      position.z = point.z;
      if (nextHeading !== undefined) {
        heading = nextHeading;
      }
    },
  };
}

function distance(from: Vec2, to: Vec2): number {
  return Math.hypot(from.x - to.x, from.z - to.z);
}

/** Wraps an angle to (-pi, pi], i.e. the shorter way round. */
function shortestTurn(angle: number): number {
  const turn = Math.PI;
  const full = Math.PI * 2;
  return ((((angle + turn) % full) + full) % full) - turn;
}

/** Clamps to ±`limit`, preserving the sign of the value being clamped. */
function clampMagnitude(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
