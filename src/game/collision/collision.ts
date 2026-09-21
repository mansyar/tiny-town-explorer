import type { TownGrid } from '../town/townGrid';
import { HOUSE_LOT_FIT, type Vec2 } from '../town/townTypes';

/**
 * What the car can run into, and where it first touches.
 *
 * Hitboxes are *derived*, never authored twice: houses take their footprint from
 * the same lot-fill cap the renderer scales their models to, and props reuse the
 * collision radii the grid already publishes for tap snapping. A hand-written
 * table of boxes would drift from the art the first time a model changed.
 *
 * Two obstacle kinds, because they mean different things to a driver:
 *
 * - **Solid** (buildings): the car stops against it and the leg that ran into it
 *   is abandoned, so a tap into a house parks the car at its wall instead of
 *   grinding against it forever.
 * - **Crashable** (props): the car bonks, bounces and carries on. A cone is
 *   meant to be bumped, so it must not be able to block a whole journey.
 *
 * Everything here is pure geometry: no three.js, no grid mutation.
 */

/** A round obstacle: a prop, or anything else with a footprint radius. */
export interface CircleShape {
  readonly kind: 'circle';
  readonly centre: Vec2;
  readonly radius: number;
}

/** An axis-aligned obstacle: a building on its lot. */
export interface BoxShape {
  readonly kind: 'box';
  readonly centre: Vec2;
  readonly halfX: number;
  readonly halfZ: number;
}

export type ObstacleShape = CircleShape | BoxShape;

export interface Obstacle {
  readonly id: string;
  /** Whether the drive stops against it ({@link Obstacle.solid}) or bounces off it. */
  readonly solid: boolean;
  readonly shape: ObstacleShape;
}

/**
 * Gap left between the car and whatever it hits, in world units.
 *
 * Contact is stopped a hair short so the next frame's sweep starts clear rather
 * than already touching, which would report an impact on every frame.
 */
export const CONTACT_SKIN = 0.001;

/** Where a moving circle first touches an obstacle. */
export interface Impact {
  /** Fraction of the way along the motion, in `[0, 1]`. */
  readonly time: number;
  readonly obstacle: Obstacle;
  /** Position of the moving circle's centre at the moment of contact. */
  readonly point: Vec2;
  /**
   * Unit direction to recoil in: away from the thing that was hit.
   *
   * Deliberately not "back the way the car came". A glancing hit on a corner
   * stops the car where it is barely touching, and reversing its heading there
   * would drive it *into* the wall — so the direction comes from the geometry.
   */
  readonly normal: Vec2;
}

/** How far and which way to move a circle so it stops overlapping a shape. */
export interface Depenetration {
  /** Unit direction to move in, away from the shape. */
  readonly normal: Vec2;
  /** Distance to move, which leaves the circle just clear of the surface. */
  readonly distance: number;
}

/**
 * Every hitbox in a town: houses as boxes on their lots, props as circles.
 *
 * Ids come from the grid, so a bonk can be traced back to the house or prop it
 * happened to.
 */
export function collectObstacles(grid: TownGrid): readonly Obstacle[] {
  const half = (grid.tileSize * HOUSE_LOT_FIT) / 2;
  return [
    ...grid.houses.map((house) => ({
      id: house.id,
      solid: true,
      shape: { kind: 'box' as const, centre: house.position, halfX: half, halfZ: half },
    })),
    ...grid.props.map((prop) => ({
      id: prop.id,
      solid: false,
      shape: {
        kind: 'circle' as const,
        centre: prop.position,
        radius: prop.collisionRadius,
      },
    })),
  ];
}

/**
 * First obstacle a circle of `radius` moving from `from` to `to` touches.
 *
 * A swept test rather than an overlap check, because at 1.6 units per second a
 * frame moves a car far enough to pass clean through a prop between frames.
 *
 * @param ignore Ids already dealt with on this route; a bumped cone must not be
 *   bumped again on every frame of the drive past it.
 */
export function sweepObstacles(
  obstacles: readonly Obstacle[],
  from: Vec2,
  to: Vec2,
  radius: number,
  ignore?: ReadonlySet<string>,
): Impact | undefined {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const travel = Math.hypot(dx, dz);
  if (travel === 0) {
    // Standing still cannot run into anything; `overlapsObstacle` is the query
    // for a car that is already in the wrong place.
    return undefined;
  }

  let earliest: Impact | undefined;
  for (const obstacle of obstacles) {
    if (ignore?.has(obstacle.id) === true) {
      continue;
    }
    const time = impactTime(obstacle.shape, from, dx, dz, radius);
    if (time === undefined || (earliest !== undefined && time >= earliest.time)) {
      continue;
    }
    earliest = {
      time,
      obstacle,
      point: { x: from.x + dx * time, z: from.z + dz * time },
      normal: { x: 0, z: 0 },
    };
  }
  if (earliest === undefined) {
    return undefined;
  }

  const time = earliest.time - Math.min(CONTACT_SKIN / travel, earliest.time);
  const point = { x: from.x + dx * time, z: from.z + dz * time };
  return {
    ...earliest,
    time,
    point,
    normal: contactNormal(earliest.obstacle.shape, point),
  };
}

/**
 * Obstacle a circle at `centre` already overlaps, if any.
 *
 * The exact test, including the rounded corners of a box, so it can be used as
 * an invariant: a car stopped by the swept test above must never be found here.
 */
export function overlapsObstacle(
  obstacles: readonly Obstacle[],
  centre: Vec2,
  radius: number,
  ignore?: ReadonlySet<string>,
): Obstacle | undefined {
  return obstacles.find(
    (obstacle) =>
      ignore?.has(obstacle.id) !== true && overlaps(obstacle.shape, centre, radius),
  );
}

/**
 * Unit direction away from a shape at a point on its surface.
 *
 * Used as the recoil direction, so a car that grazed a corner is pushed off the
 * corner rather than back along its steering.
 */
function contactNormal(shape: ObstacleShape, point: Vec2): Vec2 {
  if (shape.kind === 'circle') {
    return unit({ x: point.x - shape.centre.x, z: point.z - shape.centre.z });
  }
  const nearest = nearestPointOnBox(shape, point);
  const outward = { x: point.x - nearest.x, z: point.z - nearest.z };
  // A point inside the box has no nearest surface to point away from, so the
  // shortest way out stands in for it.
  return outward.x === 0 && outward.z === 0
    ? boxExit(shape, point).normal
    : unit(outward);
}

/**
 * How to move a circle so that it stops overlapping a shape, or `undefined` when
 * it is already clear.
 *
 * This is the recovery path: however a car came to be inside a hitbox, the next
 * frame pushes it back out instead of leaving it embedded in a wall.
 */
export function depenetration(
  shape: ObstacleShape,
  centre: Vec2,
  radius: number,
): Depenetration | undefined {
  if (shape.kind === 'circle') {
    const outward = { x: centre.x - shape.centre.x, z: centre.z - shape.centre.z };
    const distance = Math.hypot(outward.x, outward.z);
    const overlap = radius + shape.radius - distance;
    return overlap > 0 ? { normal: unit(outward), distance: overlap } : undefined;
  }

  const nearest = nearestPointOnBox(shape, centre);
  const outward = { x: centre.x - nearest.x, z: centre.z - nearest.z };
  const distance = Math.hypot(outward.x, outward.z);
  if (distance > 0) {
    const overlap = radius - distance;
    return overlap > 0 ? { normal: unit(outward), distance: overlap } : undefined;
  }

  // Dead centre inside the box: the shortest way out, plus the radius, since the
  // whole circle has to clear the surface.
  const exit = boxExit(shape, centre);
  return { normal: exit.normal, distance: exit.distance + radius };
}

/** Closest point of a box to a point, clamped into the box's own extent. */
function nearestPointOnBox(shape: BoxShape, point: Vec2): Vec2 {
  return {
    x: clamp(point.x, shape.centre.x - shape.halfX, shape.centre.x + shape.halfX),
    z: clamp(point.z, shape.centre.z - shape.halfZ, shape.centre.z + shape.halfZ),
  };
}

/**
 * Shortest way from a point *inside* a box to its surface.
 *
 * Only the four faces can be nearest, so this is a minimum over the four, which
 * is what keeps a car that somehow ends up inside from jumping the long way out.
 */
function boxExit(shape: BoxShape, point: Vec2): Depenetration {
  const faces: readonly { readonly normal: Vec2; readonly distance: number }[] = [
    {
      normal: { x: 1, z: 0 },
      distance: shape.centre.x + shape.halfX - point.x,
    },
    {
      normal: { x: -1, z: 0 },
      distance: point.x - (shape.centre.x - shape.halfX),
    },
    {
      normal: { x: 0, z: 1 },
      distance: shape.centre.z + shape.halfZ - point.z,
    },
    {
      normal: { x: 0, z: -1 },
      distance: point.z - (shape.centre.z - shape.halfZ),
    },
  ];
  const nearest = faces.reduce((best, face) =>
    face.distance < best.distance ? face : best,
  );
  return { normal: nearest.normal, distance: nearest.distance };
}

/** Scales a vector to unit length; a zero vector becomes east, arbitrarily. */
function unit(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.z);
  return length === 0 ? { x: 1, z: 0 } : { x: vector.x / length, z: vector.z / length };
}

/** Fraction along the motion at which a circle of `radius` first touches a shape. */
function impactTime(
  shape: ObstacleShape,
  from: Vec2,
  dx: number,
  dz: number,
  radius: number,
): number | undefined {
  return shape.kind === 'circle'
    ? circleImpact(shape, from, dx, dz, radius)
    : boxImpact(shape, from, dx, dz, radius);
}

/** Solves `|p - c| = r + cr` for the first time in `[0, 1]`. */
function circleImpact(
  shape: CircleShape,
  from: Vec2,
  dx: number,
  dz: number,
  radius: number,
): number | undefined {
  const sum = radius + shape.radius;
  const ox = from.x - shape.centre.x;
  const oz = from.z - shape.centre.z;
  const c = ox * ox + oz * oz - sum * sum;
  if (c <= 0) {
    // Already touching or inside: contact is now.
    return 0;
  }

  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return undefined;
  }
  const time = (-b - Math.sqrt(discriminant)) / (2 * a);
  return time >= 0 && time <= 1 ? time : undefined;
}

/**
 * Slab test against the box grown by the moving circle's radius (a Minkowski
 * sum).
 *
 * The growth rounds the corners in reality but squares them here, so a glancing
 * hit near a corner stops the car up to about `0.1 * radius` early. Erring early
 * is the safe direction: the car never visibly enters a wall, and only a
 * diagonal approach can tell the difference.
 */
function boxImpact(
  shape: BoxShape,
  from: Vec2,
  dx: number,
  dz: number,
  radius: number,
): number | undefined {
  const minX = shape.centre.x - shape.halfX - radius;
  const maxX = shape.centre.x + shape.halfX + radius;
  const minZ = shape.centre.z - shape.halfZ - radius;
  const maxZ = shape.centre.z + shape.halfZ + radius;

  if (from.x > minX && from.x < maxX && from.z > minZ && from.z < maxZ) {
    return 0;
  }

  // Entry is clamped at the start of the segment, so a box that lies entirely
  // behind the car leaves `enter > exit` and is rejected rather than reported as
  // an impact at time zero.
  let enter = 0;
  let exit = 1;
  for (const [origin, delta, min, max] of [
    [from.x, dx, minX, maxX],
    [from.z, dz, minZ, maxZ],
  ] as const) {
    if (delta === 0) {
      if (origin < min || origin > max) {
        return undefined;
      }
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) {
      return undefined;
    }
  }

  // Reaching here means `enter <= exit`, and `exit` starts at 1 and only ever
  // shrinks, so the entry point is on the segment: there is no "missed it"
  // case left to report.
  return enter;
}

/** Exact overlap test: true distance for a circle, rounded corners for a box. */
function overlaps(shape: ObstacleShape, centre: Vec2, radius: number): boolean {
  if (shape.kind === 'circle') {
    return (
      Math.hypot(centre.x - shape.centre.x, centre.z - shape.centre.z) <
      radius + shape.radius
    );
  }
  const nearestX = clamp(
    centre.x,
    shape.centre.x - shape.halfX,
    shape.centre.x + shape.halfX,
  );
  const nearestZ = clamp(
    centre.z,
    shape.centre.z - shape.halfZ,
    shape.centre.z + shape.halfZ,
  );
  return Math.hypot(centre.x - nearestX, centre.z - nearestZ) < radius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
