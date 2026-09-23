import { nearestRoadTile, type Path, roadRoute } from '../path/pathfinder';
import type { TownGrid } from '../town/townGrid';
import type { TileCoord, Vec2 } from '../town/townTypes';

/**
 * The wandering brain: where an ambient traffic car goes next.
 *
 * A mover is not a mission — it is the town's natural reason for a car to ever
 * move (product.md). So the brain is endless and unbothered: every hand-over
 * draws some other road tile and routes to it over the road graph, and the
 * traffic system simply asks again the moment the car arrives. There is always
 * somewhere to go, so a wanderer is never stationary across a session.
 *
 * Deterministic on purpose: the only randomness is the injected `random`, so a
 * fixed seed replays the same wander on every launch, and two movers given
 * distinct seeds never parade. Pure logic — no three.js, no wall clock.
 */

/**
 * The gap a pass keeps between two fitted footprints — the town's measured
 * clearance idiom (0.03, the same figure as `KERB_CLEARANCE`).
 */
export const TRAFFIC_PASS_CLEARANCE = 0.03;

/**
 * How far a wanderer holds off the road centre line: the widest fitted model
 * (sedan, half-width 0.1618 at 0.55 fit) plus half the pass clearance. The
 * pair takes opposite sides 2 × 0.177 = 0.354 apart, leaving 0.0668 between
 * the sedan and hatchback footprints — 0.0304 even between two sedans.
 */
export const TRAFFIC_LATERAL_BIAS = 0.177;

/**
 * How far a footprint may reach past the kerb band's inner edge (0.30): the
 * bias plus the widest half-width lands 0.0388 past it — wheels kiss the kerb
 * strip, never the kerb top.
 */
export const TRAFFIC_KERB_SLACK = 0.04;

export interface TrafficBrainOptions {
  /** The road network to wander. */
  readonly grid: TownGrid;
  /** The only source of randomness; seeded upstream for a repeatable town. */
  readonly random: () => number;
  /** Which side of the street to hold; the pair takes opposite sides. */
  readonly side?: 1 | -1;
}

export interface TrafficBrain {
  /**
   * Hand over the next leg from wherever the car stands now — a bonk can leave
   * it on a lawn, so the start snaps to the nearest road tile exactly like the
   * kid's routing. The destination is some other road tile, never the one the
   * car is on, so it never turns straight back onto where it just was.
   *
   * @returns `undefined` only when no other road tile is reachable.
   */
  take(from: Vec2): Path | undefined;
}

export function createTrafficBrain(options: TrafficBrainOptions): TrafficBrain {
  const { grid, random } = options;
  const side = options.side ?? 1;

  return {
    take(from) {
      const here = nearestRoadTile(grid, from);
      if (here === undefined) {
        return undefined;
      }

      const legs = reachableLegs(grid, here);

      // One die roll per leg — the only randomness there is.
      const choice = legs[Math.floor(random() * legs.length)];
      if (choice === undefined) {
        return undefined;
      }
      const points = lanePoints(grid, choice.route, side);
      const last = points[points.length - 1];
      if (last === undefined) {
        return undefined;
      }
      return { waypoints: points, destination: last };
    },
  };
}

/** Every other reachable road tile with its route, in row-major order. */
function reachableLegs(
  grid: TownGrid,
  from: TileCoord,
): { tile: TileCoord; route: readonly TileCoord[] }[] {
  const legs: { tile: TileCoord; route: readonly TileCoord[] }[] = [];
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const tile = { x, y };
      if (tile.x === from.x && tile.y === from.y) {
        continue;
      }
      const route = grid.isRoad(tile) ? roadRoute(grid, from, tile) : undefined;
      if (route !== undefined) {
        legs.push({ tile, route });
      }
    }
  }
  return legs;
}

/**
 * The left normal of a leg's canonical axis — the same side whichever way the
 * leg is walked, so the pair holds opposite lanes even through a head-on.
 */
function legNormal(from: TileCoord, to: TileCoord): Vec2 {
  let dx = to.x - from.x;
  let dz = to.y - from.y;
  if (dx < 0 || (dx === 0 && dz < 0)) {
    dx = -dx;
    dz = -dz;
  }
  const length = Math.hypot(dx, dz);
  return { x: -dz / length, z: dx / length };
}

/**
 * Lane points for a route — one per tile, held TRAFFIC_LATERAL_BIAS off each
 * leg's centre line. Where two legs meet, the point sits on their angle
 * bisector at exactly that distance from both: the bias follows the tangent
 * and the car sweeps the corner instead of jogging between lanes.
 */
function lanePoints(grid: TownGrid, route: readonly TileCoord[], side: 1 | -1): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i < route.length; i++) {
    const tile = route[i];
    const before = route[i - 1];
    const after = route[i + 1];
    if (tile === undefined) {
      continue;
    }
    const centre = grid.tileToWorld(tile);
    const inward = before === undefined ? undefined : legNormal(before, tile);
    const outward = after === undefined ? undefined : legNormal(tile, after);
    let offset = inward ?? outward;
    if (inward !== undefined && outward !== undefined) {
      offset = bisect(inward, outward);
    }
    if (offset === undefined) {
      continue;
    }
    points.push({
      x: centre.x + side * TRAFFIC_LATERAL_BIAS * offset.x,
      z: centre.z + side * TRAFFIC_LATERAL_BIAS * offset.z,
    });
  }
  return points;
}

/** Bisector scaled so it stays one lane width off both leg lines. */
function bisect(a: Vec2, b: Vec2): Vec2 {
  const scale = 1 + a.x * b.x + a.z * b.z;
  return { x: (a.x + b.x) / scale, z: (a.z + b.z) / scale };
}
