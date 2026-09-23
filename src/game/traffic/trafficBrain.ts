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

export interface TrafficBrainOptions {
  /** The road network to wander. */
  readonly grid: TownGrid;
  /** The only source of randomness; seeded upstream for a repeatable town. */
  readonly random: () => number;
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
      return {
        waypoints: choice.route.map((tile) => grid.tileToWorld(tile)),
        destination: grid.tileToWorld(choice.tile),
      };
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
