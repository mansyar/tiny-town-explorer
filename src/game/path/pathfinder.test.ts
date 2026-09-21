import { describe, expect, it } from 'vitest';
import { createTownGrid } from '../town/townGrid';
import type { TileCoord, TownMapSpec } from '../town/townTypes';
import { findPath, nearestRoadTile, roadRoute } from './pathfinder';

/**
 * A 7 x 7 ring with a road across the middle, so a route can either go round or
 * cut through; the interior is lots. Tile (3,3) sits at the world origin, so
 * tile centres read as `tile - 3`.
 */
const RING_WITH_MIDDLE: TownMapSpec = {
  tileSize: 1,
  rows: ['#######', '#.....#', '#.....#', '#######', '#.....#', '#.....#', '#######'],
  houses: [],
  props: [],
  spawnPoints: [{ x: 0, y: 3 }],
};

/** Two road networks with no connection between them. */
const SPLIT: TownMapSpec = {
  tileSize: 1,
  rows: ['##.##', '#...#', '#...#', '#...#', '##.##'],
  houses: [],
  props: [],
  spawnPoints: [{ x: 0, y: 2 }],
};

/** No roads at all, for the "nothing to snap to" case. */
const NO_ROADS: TownMapSpec = {
  tileSize: 1,
  rows: ['.....', '.....', '.....', '.....', '.....'],
  houses: [],
  props: [],
  spawnPoints: [{ x: 2, y: 2 }],
};

const ring = createTownGrid(RING_WITH_MIDDLE);
const split = createTownGrid(SPLIT);
const noRoads = createTownGrid(NO_ROADS);
const town = createTownGrid();

/** World centre of a tile, read from the grid so tests never do the arithmetic. */
function centre(tile: TileCoord): { x: number; z: number } {
  return ring.tileToWorld(tile);
}

describe('nearestRoadTile', () => {
  it('snaps a point on a road tile to that tile', () => {
    expect(nearestRoadTile(ring, { x: 0, z: 0 })).toEqual({ x: 3, y: 3 });
  });

  it('snaps a tap on grass to the road whose centre is closest', () => {
    // In lot tile (1,1), nearest road tile (1,0) to the north.
    expect(nearestRoadTile(ring, { x: -1.9, z: -2.4 })).toEqual({ x: 1, y: 0 });
  });

  it('prefers the nearer road even when it is further away across open ground', () => {
    // Middle of lot tile (3,2): the middle road is 1.4 south, the top road 1.6.
    expect(nearestRoadTile(ring, { x: 0, z: -1.4 })).toEqual({ x: 3, y: 3 });
  });

  it('has nothing to snap to in a town with no roads', () => {
    expect(nearestRoadTile(noRoads, { x: 0, z: 0 })).toBeUndefined();
  });
});

describe('roadRoute', () => {
  it('routes along adjacent road tiles and includes both ends', () => {
    expect(roadRoute(ring, { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('takes the fewest hops, not the first branch it finds', () => {
    // Straight across the middle road (6 hops) beats going round the ring (12).
    const route = roadRoute(ring, { x: 0, y: 3 }, { x: 6, y: 3 });

    expect(route).toHaveLength(7);
    expect(route?.every((tile) => tile.y === 3)).toBe(true);
  });

  it('is a single tile when both ends are the same tile', () => {
    expect(roadRoute(ring, { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([{ x: 3, y: 3 }]);
  });

  it('refuses a route between roads that never meet', () => {
    expect(roadRoute(split, { x: 0, y: 2 }, { x: 4, y: 2 })).toBeUndefined();
  });

  it('refuses ends that are not roads', () => {
    expect(roadRoute(ring, { x: 1, y: 1 }, { x: 0, y: 0 })).toBeUndefined();
    expect(roadRoute(ring, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeUndefined();
  });
});

describe('findPath', () => {
  it('lists the road centres to drive through, then the exact tap point', () => {
    // From the west side of the ring to a lot tap nearest road tile (1,0):
    // up the west column, then one tile east along the top.
    const path = findPath(ring, centre({ x: 0, y: 3 }), { x: -1.9, z: -2.4 });

    expect(path?.waypoints).toEqual([
      centre({ x: 0, y: 3 }),
      centre({ x: 0, y: 2 }),
      centre({ x: 0, y: 1 }),
      centre({ x: 0, y: 0 }),
      centre({ x: 1, y: 0 }),
    ]);
    // The last leg leaves the road and ends where the kid tapped.
    expect(path?.destination).toEqual({ x: -1.9, z: -2.4 });
  });

  it('still ends at the tap when the tap itself is on a road', () => {
    const tap = { x: 0.3, z: -0.2 };
    const path = findPath(ring, centre({ x: 0, y: 3 }), tap);

    expect(path?.waypoints.at(-1)).toEqual(centre({ x: 3, y: 3 }));
    expect(path?.destination).toEqual(tap);
  });

  it('starts from the nearest road when the car sits on grass', () => {
    // Car parked in lot tile (1,1), so the route starts on road tile (1,0).
    const path = findPath(ring, { x: -1.9, z: -2.4 }, centre({ x: 2, y: 0 }));

    expect(path?.waypoints).toEqual([centre({ x: 1, y: 0 }), centre({ x: 2, y: 0 })]);
    expect(path?.destination).toEqual(centre({ x: 2, y: 0 }));
  });

  it('has no path when the destination road cannot be reached', () => {
    expect(findPath(split, { x: -2, z: 0 }, { x: 2, z: 0 })).toBeUndefined();
  });

  it('has no path in a town with no roads to snap to', () => {
    expect(findPath(noRoads, { x: 0, z: 0 }, { x: 1, z: 1 })).toBeUndefined();
  });
});

describe('the authored town', () => {
  const spawn = town.spawnPoints[0] ?? { x: 0, z: 0 };

  it('connects every road tile to the spawn point, and keeps every waypoint on a road', () => {
    for (let y = 0; y < town.size; y++) {
      for (let x = 0; x < town.size; x++) {
        const tile = { x, y };
        if (!town.isRoad(tile)) {
          continue;
        }

        const path = findPath(town, spawn, town.tileToWorld(tile));
        expect(path, `route to ${x},${y}`).toBeDefined();
        for (const waypoint of path?.waypoints ?? []) {
          expect(
            town.isRoad(town.worldToTile(waypoint)),
            `waypoint ${waypoint.x},${waypoint.z} off the road`,
          ).toBe(true);
        }
      }
    }
  });

  it('reaches grass deep inside a block, past the road it snaps to', () => {
    // The middle of the wide west lawn block, three tiles from any street.
    const tap = town.tileToWorld({ x: 2, y: 3 });
    const path = findPath(town, spawn, tap);

    expect(path).toBeDefined();
    expect(path?.waypoints.length).toBeGreaterThan(1);
    expect(path?.destination).toEqual(tap);
  });
});
