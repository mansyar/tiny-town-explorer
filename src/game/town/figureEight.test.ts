import { describe, expect, it } from 'vitest';
import { findPath } from '../path/pathfinder';
import { createTownGrid } from './townGrid';
import { TOWN_MAP } from './townMap';
import type { TileCoord } from './townTypes';

/**
 * The figure-eight's own invariants (Phase 2, FR1/FR2/FR9).
 *
 * The map grows from the 6x6 town into two block loops meeting at exactly one
 * shared junction tile. The old ring and cross street stay where they are
 * (rows 0-5, columns 0-5); a second block loop joins at (5,5), the old
 * south-east corner, which becomes the town's crossing moment. The second
 * block fills (6..8)^2: the shop lot at the junction corner, four houses, the
 * pond green in the heart, gardens around them.
 */

const grid = createTownGrid(TOWN_MAP);
const JUNCTION: TileCoord = { x: 5, y: 5 };

const key = (tile: TileCoord): string => `${tile.x},${tile.y}`;

function roadTiles(): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (grid.isRoad({ x, y })) tiles.push({ x, y });
    }
  }
  return tiles;
}

/** Flood-fills the roads from a tile, treating one tile as gone if asked. */
function roadComponent(start: TileCoord, without?: TileCoord): Set<string> {
  const seen = new Set<string>([key(start)]);
  const queue: TileCoord[] = [start];
  while (queue.length > 0) {
    const tile = queue.shift();
    if (!tile) continue;
    for (const next of grid.roadNeighbours(tile)) {
      if (without && next.x === without.x && next.y === without.y) continue;
      if (!seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return seen;
}

describe('the figure-eight', () => {
  it('joins the two loops at exactly one shared junction tile', () => {
    // (5,5) is a real crossroads: four arms, one per compass direction. With
    // the junction gone the roads must fall into exactly two pieces - the old
    // ring-and-cross network and the second block's loop. Fewer pieces and the
    // districts fused at extra seams; more and the town fell apart.
    expect(grid.isRoad(JUNCTION), 'the junction is a road tile').toBe(true);
    expect(grid.roadNeighbours(JUNCTION), 'the crossing has four arms').toHaveLength(4);

    const without = roadComponent({ x: 0, y: 0 }, JUNCTION);
    const second = [...roadTiles()].find(
      (tile) => !without.has(key(tile)) && key(tile) !== key(JUNCTION),
    );
    expect(second, 'a second loop exists beyond the junction').toBeDefined();
    const secondComponent = second ? roadComponent(second, JUNCTION) : new Set<string>();
    for (const seen of secondComponent) {
      expect(without.has(seen), `${seen} belongs to the other loop`).toBe(false);
    }
    expect(without.size + secondComponent.size).toBe(roadTiles().length - 1);
  });

  it('keeps the road network one connected component', () => {
    expect(roadComponent({ x: 0, y: 0 }).size).toBe(roadTiles().length);
  });

  it('touches every lot with a street', () => {
    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        if (grid.tileAt({ x, y }) !== 'lot') continue;
        expect(
          grid.neighbours({ x, y }).some((next) => grid.isRoad(next)),
          `lot ${x},${y} touches a street`,
        ).toBe(true);
      }
    }
  });

  it('puts the pond green in the loop’s heart, never on a P tile', () => {
    expect(grid.tileAt({ x: 7, y: 7 })).toBe('pond');
    expect(grid.tileAt({ x: 7, y: 7 })).not.toBe('park');
  });

  it('fills the second block with four house lots, the shop lot and the pond green', () => {
    const inBlock = (tile: TileCoord): boolean =>
      tile.x >= 6 && tile.x <= 8 && tile.y >= 6 && tile.y <= 8;
    const houses = grid.houses.filter((house) => inBlock(house.tile));
    expect(houses).toHaveLength(4);

    // The shop's lot sits at the junction corner and stays a lot: Phase 3
    // mounts the GLB, and until then nothing pretends to be a building there.
    const shopLot: TileCoord = { x: 6, y: 6 };
    expect(grid.tileAt(shopLot)).toBe('lot');
    expect(houses.some((house) => house.tile.x === 6 && house.tile.y === 6)).toBe(false);
    expect(Math.abs(shopLot.x - JUNCTION.x)).toBe(1);
    expect(Math.abs(shopLot.y - JUNCTION.y)).toBe(1);
  });

  it('spreads the spawns two and two across the loops', () => {
    const onOldBlock = (tile: TileCoord): boolean => tile.x <= 5 && tile.y <= 5;
    expect(TOWN_MAP.spawnPoints.filter(onOldBlock)).toHaveLength(2);
    expect(TOWN_MAP.spawnPoints.filter((point) => !onOldBlock(point))).toHaveLength(2);
  });

  it('routes across the junction in both directions', () => {
    const oldEnd = grid.tileToWorld({ x: 1, y: 3 });
    const newEnd = grid.tileToWorld({ x: 7, y: 9 });
    const there = findPath(grid, oldEnd, newEnd);
    const back = findPath(grid, newEnd, oldEnd);
    expect(there?.waypoints.length ?? 0).toBeGreaterThan(0);
    expect(back?.waypoints.length ?? 0).toBeGreaterThan(0);
  });
});
