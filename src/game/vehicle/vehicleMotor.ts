import {
  CONTACT_SKIN,
  depenetration,
  type Impact,
  type Obstacle,
  sweepObstacles,
} from '../collision/collision';
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
 *
 * Hitting things is the third: motion is swept against the town's hitboxes, and
 * contact recoils the car and costs it something, so nothing can be jammed. A
 * crashable prop is bumped once and then driven past — a cone must never be able
 * to block a journey — while a building consumes the leg that ran into it, which
 * is what stops a tap inside a wall from becoming an endless grind. The route's
 * cursor only ever advances, so no bonk can put the car into a loop.
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
 * Radius of the car's own footprint, in world units. Matches the kit truck's
 * 0.525 width; the vehicles are all this class of toy car.
 */
export const CAR_RADIUS = 0.26;

/**
 * Half the car's length, in world units: the kit truck measures 0.8625 nose to
 * tail.
 *
 * The car is a *capsule*, not a circle. One circle of {@link CAR_RADIUS} covers
 * the body's width but falls 0.17 short of the nose, so a circle-only footprint
 * would bury the bonnet in every wall met head-on.
 */
export const CAR_HALF_LENGTH = 0.43;

/**
 * How long a recoil lasts, in seconds. Short: a bonk is a punctuation mark, not
 * a cutscene, and every frame of it is a frame the kid is not driving.
 */
export const BOUNCE_DURATION = 0.4;

/**
 * Peak distance the car springs back from the contact point, in world units.
 *
 * The recoil rises and falls (`sin`), so the car ends exactly where it touched:
 * a one-sided offset would leave it drifting further from the wall on every hit.
 */
export const BOUNCE_BACK_DISTANCE = 0.14;

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

/**
 * The two circle centres of a car's capsule: the shape collision sweeps.
 *
 * Both sit on the centre line at `CAR_HALF_LENGTH - radius` from the middle, so
 * the capsule reaches as far forward as the body's nose and as far back as its
 * tail.
 */
export function capsuleCentres(
  at: Vec2,
  heading: number,
  radius = CAR_RADIUS,
): readonly Vec2[] {
  const offset = Math.max(0, CAR_HALF_LENGTH - radius);
  const facing = facingOf(heading);
  return [
    { x: at.x + facing.x * offset, z: at.z + facing.z * offset },
    { x: at.x - facing.x * offset, z: at.z - facing.z * offset },
  ];
}

export interface VehicleMotorOptions {
  readonly position?: Vec2;
  readonly heading?: number;
  /** Hitboxes to sweep against; empty (the default) is a world with no walls. */
  readonly obstacles?: readonly Obstacle[];
  /** Radius of each capsule circle, defaulting to {@link CAR_RADIUS}. */
  readonly radius?: number;
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
  /** Whether the car is mid-recoil, i.e. not driving this frame. */
  isBouncing(): boolean;
  /** How far through the recoil, in `[0, 1]`; `undefined` when not bouncing. */
  bounceProgress(): number | undefined;
  /** Bumps since this motor was created. Monotonic, so callers can latch it. */
  bonkCount(): number;
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
  let bonks = 0;

  const obstacles = options.obstacles ?? [];
  const radius = options.radius ?? CAR_RADIUS;
  /** Crashable obstacles already dealt with on this route, by id. */
  let passed = new Set<string>();
  /** Where the last bump happened, and which way the car came from. */
  let contact: Vec2 = { x: position.x, z: position.z };
  let backX = 0;
  let backZ = 0;
  let bouncing = false;
  let bounceElapsed = 0;

  const target = (): Vec2 | undefined => targets[cursor];

  /** One frame of the recoil, which ends exactly on the contact point. */
  const stepBounce = (elapsed: number): void => {
    bounceElapsed += elapsed;
    const progress = Math.min(bounceElapsed / BOUNCE_DURATION, 1);
    const recoil = Math.sin(Math.PI * progress) * BOUNCE_BACK_DISTANCE;
    position.x = contact.x + backX * recoil;
    position.z = contact.z + backZ * recoil;
    if (progress >= 1) {
      position.x = contact.x;
      position.z = contact.z;
      bouncing = false;
    }
  };

  /**
   * The contact point, moved clear of the hitbox if it landed inside it.
   *
   * The swept test can stop a car fractionally within a surface (the inflated
   * box squares its corners), and a recoil that starts inside a wall is a car
   * that grinds its way further in every time it is aimed there again.
   */
  const pushClear = (impact: Impact, centre: Vec2): Vec2 => {
    // Either end of the capsule can be the part left inside a surface, so the
    // deepest overlap is the one that moves the car clear: the bonnet on an
    // ordinary head-on bonk, the tail when the car was already embedded.
    let furthest = 0;
    let clear: Vec2 = centre;
    for (const circle of capsuleCentres(centre, heading, radius)) {
      const overlap = depenetration(impact.obstacle.shape, circle, radius);
      if (overlap === undefined) {
        continue;
      }
      const push = overlap.distance + CONTACT_SKIN;
      if (push > furthest) {
        furthest = push;
        clear = {
          x: centre.x + overlap.normal.x * push,
          z: centre.z + overlap.normal.z * push,
        };
      }
    }
    return clear;
  };

  /**
   * First contact along this frame's motion for the whole capsule.
   *
   * The contact is reported with the car's own centre, not the struck circle's:
   * the caller moves the car, and the capsule is derived from wherever it lands.
   */
  const sweepCapsule = (
    toX: number,
    toZ: number,
  ): { readonly impact: Impact; readonly centre: Vec2 } | undefined => {
    let best: { readonly impact: Impact; readonly centre: Vec2 } | undefined;
    for (const circle of capsuleCentres(position, heading, radius)) {
      const dx = circle.x - position.x;
      const dz = circle.z - position.z;
      const impact = sweepObstacles(
        obstacles,
        circle,
        { x: toX + dx, z: toZ + dz },
        radius,
        passed,
      );
      if (impact === undefined) {
        continue;
      }
      if (best === undefined || impact.time < best.impact.time) {
        best = {
          impact,
          centre: { x: impact.point.x - dx, z: impact.point.z - dz },
        };
      }
    }
    return best;
  };

  /**
   * Turns toward the next target and drives, or collides.
   *
   * The car is aligned before it moves, so the frame's motion is the straight
   * line to the target rather than an arc; that is also what makes the sweep
   * below a single segment.
   */
  const driveToward = (waypoint: Vec2, elapsed: number): void => {
    const desired = headingFor({
      x: waypoint.x - position.x,
      z: waypoint.z - position.z,
    });
    const error = shortestTurn(desired - heading);
    const turned = clampMagnitude(error, TURN_RATE * elapsed);
    heading += turned;
    if (Math.abs(error - turned) > ALIGN_TOLERANCE) {
      // Still pointing too far off: turn on the spot, wheels and all.
      currentSpeed = 0;
      return;
    }

    // Drive where the nose points, so the car can never crab sideways.
    const facing = facingOf(heading);
    const nextX = position.x + facing.x * DRIVE_SPEED * elapsed;
    const nextZ = position.z + facing.z * DRIVE_SPEED * elapsed;

    // Sweep this frame's motion: at 1.6 u/s a single frame covers far enough to
    // pass clean through a prop, so contact must be found along the way rather
    // than at the destination.
    const hit = obstacles.length === 0 ? undefined : sweepCapsule(nextX, nextZ);
    if (hit === undefined) {
      currentSpeed = DRIVE_SPEED;
      position.x = nextX;
      position.z = nextZ;
      return;
    }
    collide(hit.impact, hit.centre);
  };

  /** Stops on the first thing hit and recoils away from it. */
  const collide = (impact: Impact, centre: Vec2): void => {
    // Land on the surface rather than wherever the car had got to, and make
    // sure it is on the outside of it: a car that grazed a corner can stop
    // fractionally overlapping, and a recoil from inside a wall is a car that
    // can never leave.
    const pushed = pushClear(impact, centre);
    position.x = pushed.x;
    position.z = pushed.z;
    currentSpeed = 0;
    bonks += 1;
    contact = { x: pushed.x, z: pushed.z };
    // Recoil away from the surface. Not "back the way the car came": a corner
    // glanced while driving away would be pushed straight into the wall.
    backX = impact.normal.x;
    backZ = impact.normal.z;
    bounceElapsed = 0;
    bouncing = true;

    if (impact.obstacle.solid) {
      // Nothing gets past a building, so the leg that ran into it is over.
      // Consuming it is what guarantees a way out: the cursor only advances, so
      // the worst a wall can cost is the rest of the route.
      cursor += 1;
    } else {
      // Crashable: bump it once, then drive on through. Without this the car
      // would re-hit a cone on every frame it spent passing it.
      passed.add(impact.obstacle.id);
    }
  };

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

    isBouncing(): boolean {
      return bouncing;
    },

    bounceProgress(): number | undefined {
      return bouncing ? Math.min(bounceElapsed / BOUNCE_DURATION, 1) : undefined;
    },

    bonkCount(): number {
      return bonks;
    },

    setPath(path: Path): void {
      // Copy rather than hold the caller's route: the cursor consumes these as
      // the car passes them, and a path may be re-used for a second car.
      targets = [...path.waypoints, path.destination];
      cursor = 0;
      currentSpeed = 0;
      bouncing = false;
      bounceElapsed = 0;
      // A new journey gets a clean slate: a cone bumped on the last one is
      // something to bump again.
      passed = new Set<string>();
    },

    update(deltaSeconds: number): void {
      const elapsed = Math.max(deltaSeconds, 0);
      if (elapsed === 0) {
        return;
      }

      // Recoil first: a car mid-bounce is not driving, and its motion is a
      // function of the contact point rather than of the route.
      if (bouncing) {
        stepBounce(elapsed);
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

      driveToward(next, elapsed);
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
