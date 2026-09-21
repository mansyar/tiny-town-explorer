import type { TownGrid } from '../town/townGrid';
import type { TileCoord, Vec2 } from '../town/townTypes';

/**
 * Road routing for tap-to-move.
 *
 * The authored road grid *is* the pathing graph (product.md), so a route is a
 * shortest hop path over road tiles: waypoints sit at tile centres, which keeps
 * a car on the 0.60-wide asphalt through a corner, and the final leg leaves the
 * road to land exactly where the kid tapped. Grass is always reachable across
 * the last leg, which is why a tap never fails.
 *
 * Everything here is pure: no three.js, no DOM, no mutation of the grid.
 */

/** A route: road centres to drive through, then the tap itself. */
export interface Path {
  /**
   * Road tile centres in driving order, from the tile the car enters the road
   * network on to the road tile nearest the tap. A car already on the road
   * starts at its own tile's centre, which the motor skips on arrival.
   */
  readonly waypoints: readonly Vec2[];
  /**
   * The exact tap point. The last stretch may cross a lot, a park or a prop,
   * so it is not forced onto the road graph.
   */
  readonly destination: Vec2;
}

/**
 * Nearest road tile to a point, measured centre to centre so snapping agrees
 * with the grid's own `worldToTile`. Ties keep the first tile in row-major
 * order, which keeps routes reproducible for a given tap.
 *
 * @returns `undefined` only when the town has no roads at all.
 */
export function nearestRoadTile(grid: TownGrid, point: Vec2): TileCoord | undefined {
  let nearest: TileCoord | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const tile = { x, y };
      if (!grid.isRoad(tile)) {
        continue;
      }
      const centre = grid.tileToWorld(tile);
      const distance = Math.hypot(centre.x - point.x, centre.z - point.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = tile;
      }
    }
  }

  return nearest;
}

/**
 * Shortest road-tile route between two road tiles, inclusive of both ends.
 *
 * Breadth-first, so the first arrival at a tile is via the fewest hops; a town
 * this small does not justify weighted edges, and hop count is what decides
 * between going round the ring and cutting through the middle.
 *
 * @returns `undefined` when an end is not a road, or when no road connects them.
 */
export function roadRoute(
  grid: TownGrid,
  from: TileCoord,
  to: TileCoord,
): readonly TileCoord[] | undefined {
  if (!grid.isRoad(from) || !grid.isRoad(to)) {
    return undefined;
  }

  const cameFrom = new Map<string, TileCoord>();
  const visited = new Set<string>([tileKey(from)]);
  const queue: TileCoord[] = [from];

  // Iterating a growing array is a queue without index bookkeeping: the array
  // iterator re-reads the length on every step.
  for (const tile of queue) {
    for (const neighbour of grid.roadNeighbours(tile)) {
      const key = tileKey(neighbour);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      cameFrom.set(key, tile);
      queue.push(neighbour);
    }
  }

  if (!visited.has(tileKey(to))) {
    return undefined;
  }

  const route: TileCoord[] = [];
  let cursor: TileCoord | undefined = to;
  while (cursor !== undefined) {
    route.push(cursor);
    cursor = cameFrom.get(tileKey(cursor));
  }
  return route.reverse();
}

/**
 * Plans the drive from a car position to a tap.
 *
 * Both ends snap to the road network; the car's own position may be anywhere
 * (a bonk can leave it on a lawn), and the tap may be nowhere near a road.
 *
 * @returns `undefined` when the tap's road cannot be reached from the car's.
 */
export function findPath(grid: TownGrid, from: Vec2, to: Vec2): Path | undefined {
  const start = nearestRoadTile(grid, from);
  const end = nearestRoadTile(grid, to);
  if (start === undefined || end === undefined) {
    return undefined;
  }

  const route = roadRoute(grid, start, end);
  if (route === undefined) {
    return undefined;
  }

  return {
    waypoints: route.map((tile) => grid.tileToWorld(tile)),
    destination: { ...to },
  };
}

/** Map key for a tile; identity would work, but keys keep the sets cheap. */
function tileKey(tile: TileCoord): string {
  return `${tile.x},${tile.y}`;
}
