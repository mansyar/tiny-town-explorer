import { describe, expect, it } from 'vitest';
import type { TownGrid } from './townGrid';
import { createTownGrid } from './townGrid';
import { TOWN_MAP } from './townMap';
import type { Direction, RoadShape, TileCoord, TileKind, TownMapSpec } from './townTypes';

/** Empty 3x3 town used as the base for shape and validation specs. */
const BASE_SPEC: TownMapSpec = {
  tileSize: 1,
  rows: ['...', '...', '...'],
  houses: [],
  props: [],
  spawnPoints: [],
};

/** One tiny map per track-piece shape. */
const SHAPE_CASES: ReadonlyArray<{
  readonly expected: RoadShape;
  readonly rows: readonly string[];
  readonly tile: { readonly x: number; readonly y: number };
}> = [
  { expected: 'isolated', rows: ['...', '.#.', '...'], tile: { x: 1, y: 1 } },
  { expected: 'end', rows: ['##.', '...', '...'], tile: { x: 0, y: 0 } },
  { expected: 'straight', rows: ['...', '###', '...'], tile: { x: 1, y: 1 } },
  { expected: 'curve', rows: ['#..', '##.', '...'], tile: { x: 0, y: 1 } },
  { expected: 'tee', rows: ['.#.', '###', '...'], tile: { x: 1, y: 1 } },
  { expected: 'cross', rows: ['.#.', '###', '.#.'], tile: { x: 1, y: 1 } },
];

describe('createTownGrid — authored map parsing', () => {
  it('parses the 6x6 layout into tile kinds', () => {
    const grid = createTownGrid(TOWN_MAP);

    expect(grid.size).toBe(6);
    expect(grid.tiles).toHaveLength(6);

    expect(grid.tileAt({ x: 0, y: 0 })).toBe('road');
    expect(grid.tileAt({ x: 3, y: 1 })).toBe('road');
    expect(grid.tileAt({ x: 1, y: 1 })).toBe('park');
    expect(grid.tileAt({ x: 2, y: 1 })).toBe('park');
    expect(grid.tileAt({ x: 2, y: 2 })).toBe('lot');
    expect(grid.tileAt({ x: 4, y: 4 })).toBe('lot');
    expect(grid.tileAt({ x: 6, y: 0 })).toBeUndefined();
    expect(grid.tileAt({ x: -1, y: 0 })).toBeUndefined();

    expect(countTiles(grid)).toEqual({ road: 24, lot: 10, park: 2 });
  });

  it('builds house lots with world positions from the authored specs', () => {
    const grid = createTownGrid(TOWN_MAP);

    expect(grid.houses).toHaveLength(10);
    expect(new Set(grid.houses.map((house) => house.id)).size).toBe(10);

    const first = grid.houses[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect(grid.tileAt(first.tile)).toBe('lot');
      expect(first.position).toEqual(grid.tileToWorld(first.tile));
    }

    expect(grid.houseById('house-1')?.tile).toEqual({ x: 1, y: 2 });
    expect(grid.houseById('nope')).toBeUndefined();
  });

  it('keeps every house on a lot facing an adjacent road', () => {
    const grid = createTownGrid(TOWN_MAP);

    for (const house of grid.houses) {
      expect(grid.tileAt(house.tile), `${house.id} sits on a lot`).toBe('lot');
      expect(
        grid.isRoad(neighbourInDirection(house.tile, house.facing)),
        `${house.id} faces a road on its ${house.facing} side`,
      ).toBe(true);
    }
  });

  it('keeps the authored road network fully connected', () => {
    const grid = createTownGrid(TOWN_MAP);
    const roads = eachTile(grid).filter((coord) => grid.isRoad(coord));
    const start = roads[0];
    expect(start).toBeDefined();
    if (start === undefined) return;

    expect(reachableRoadCount(grid, start)).toBe(roads.length);
  });

  it('exposes park tiles and road spawn points', () => {
    const grid = createTownGrid(TOWN_MAP);

    expect(grid.parkTiles).toHaveLength(2);
    expect(grid.spawnPoints.length).toBeGreaterThanOrEqual(1);
    expect(grid.spawnPoints).toHaveLength(TOWN_MAP.spawnPoints.length);

    for (const spawn of TOWN_MAP.spawnPoints) {
      expect(grid.isRoad(spawn)).toBe(true);
    }
    const firstSpawn = grid.spawnPoints[0];
    expect(firstSpawn).toEqual(
      grid.tileToWorld(TOWN_MAP.spawnPoints[0] ?? { x: 0, y: 0 }),
    );
  });
});

describe('adjacency queries', () => {
  it('returns only in-bounds four-way neighbours', () => {
    const grid = createTownGrid(TOWN_MAP);

    expect(grid.neighbours({ x: 0, y: 0 })).toHaveLength(2);
    expect(grid.neighbours({ x: 1, y: 0 })).toHaveLength(3);
    expect(grid.neighbours({ x: 2, y: 2 })).toHaveLength(4);
  });

  it('filters road neighbours and reports empty off-road', () => {
    const grid = createTownGrid(TOWN_MAP);

    expect(grid.roadNeighbours({ x: 1, y: 2 })).toEqual([{ x: 0, y: 2 }]);
    expect(grid.roadNeighbours({ x: 3, y: 2 })).toEqual([
      { x: 3, y: 1 },
      { x: 3, y: 3 },
    ]);
    expect(grid.roadNeighbours({ x: 0, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });

  it('derives road connections and shapes from neighbours', () => {
    const grid = createTownGrid(TOWN_MAP);

    expect(grid.roadConnections({ x: 0, y: 0 })).toEqual({
      north: false,
      east: true,
      south: true,
      west: false,
    });
    expect(grid.roadShape({ x: 0, y: 0 })).toBe('curve');
    expect(grid.roadShape({ x: 1, y: 0 })).toBe('straight');
    expect(grid.roadShape({ x: 3, y: 0 })).toBe('tee');
    expect(grid.roadShape({ x: 3, y: 1 })).toBe('straight');
    expect(grid.roadShape({ x: 1, y: 1 })).toBeUndefined();
  });

  it.each(SHAPE_CASES)('derives the $expected shape', ({ expected, rows, tile }) => {
    const grid = createTownGrid({ ...BASE_SPEC, rows });

    expect(grid.roadShape(tile)).toBe(expected);
  });

  it('reports no shape off-road', () => {
    const grid = createTownGrid({ ...BASE_SPEC, rows: ['##.', '...', '...'] });

    expect(grid.roadShape({ x: 2, y: 2 })).toBeUndefined();
  });
});

describe('world mapping', () => {
  it('centres the town on the origin and round-trips tile coordinates', () => {
    const grid = createTownGrid(TOWN_MAP);

    expect(grid.tileToWorld({ x: 0, y: 0 })).toEqual({ x: -2.5, z: -2.5 });
    expect(grid.tileToWorld({ x: 5, y: 5 })).toEqual({ x: 2.5, z: 2.5 });

    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        expect(grid.worldToTile(grid.tileToWorld({ x, y }))).toEqual({ x, y });
      }
    }
  });

  it('maps points inside a tile to that tile and reports off-map coords', () => {
    const grid = createTownGrid(TOWN_MAP);
    const centre = grid.tileToWorld({ x: 2, y: 3 });

    expect(grid.worldToTile({ x: centre.x + 0.2, z: centre.z - 0.2 })).toEqual({
      x: 2,
      y: 3,
    });
    expect(grid.tileAt(grid.worldToTile({ x: 99, z: 99 }))).toBeUndefined();
  });

  it('looks up houses by world point', () => {
    const grid = createTownGrid(TOWN_MAP);
    const house = grid.houseById('house-3');
    expect(house).toBeDefined();
    if (house === undefined) return;

    expect(grid.houseAt(house.position)).toBe(house);
    expect(grid.houseAt(grid.tileToWorld({ x: 3, y: 2 }))).toBeUndefined();
    expect(grid.houseAt({ x: 99, z: 99 })).toBeUndefined();
  });
});

describe('proximity queries', () => {
  it('finds props within a world-space radius, nearest first', () => {
    const grid = createTownGrid(TOWN_MAP);
    const hydrant = grid.props.find((prop) => prop.kind === 'hydrant');
    expect(hydrant).toBeDefined();
    if (hydrant === undefined) return;

    expect(grid.propsWithin(hydrant.position, 0.001)).toEqual([hydrant]);
    expect(grid.propsWithin({ x: 100, z: 100 }, 2)).toHaveLength(0);

    const all = grid.propsWithin({ x: 0, z: 0 }, 100);
    expect(all).toHaveLength(grid.props.length);
    const distances = all.map((prop) => Math.hypot(prop.position.x, prop.position.z));
    expect(distances).toEqual([...distances].sort((a, b) => a - b));

    const nearest = distances[0] ?? 0;
    expect(grid.propsWithin({ x: 0, z: 0 }, nearest / 2)).toHaveLength(0);
  });

  it('gives every prop kind a distinct collision radius scaled by tile size', () => {
    const grid = createTownGrid(TOWN_MAP);
    const radiusOf = (kind: string) => {
      const prop = grid.props.find((candidate) => candidate.kind === kind);
      expect(prop).toBeDefined();
      return prop?.collisionRadius ?? 0;
    };

    expect(radiusOf('tree')).toBeGreaterThan(radiusOf('hydrant'));
    expect(radiusOf('hydrant')).toBeGreaterThan(radiusOf('powerPole'));
    expect(radiusOf('hydrant')).toBeGreaterThan(0);

    const doubled = createTownGrid({ ...TOWN_MAP, tileSize: TOWN_MAP.tileSize * 2 });
    const doubledHydrant = doubled.props.find((prop) => prop.kind === 'hydrant');
    expect(doubledHydrant?.collisionRadius).toBeCloseTo(radiusOf('hydrant') * 2);
  });

  it('places authored prop offsets relative to the tile centre', () => {
    const grid = createTownGrid(TOWN_MAP);
    const offsetSpec = TOWN_MAP.props.find((prop) => prop.offset !== undefined);
    expect(offsetSpec).toBeDefined();
    if (offsetSpec?.offset === undefined) return;

    const prop = grid.props.find(
      (candidate) =>
        candidate.kind === offsetSpec.kind &&
        candidate.tile.x === offsetSpec.tile.x &&
        candidate.tile.y === offsetSpec.tile.y,
    );
    expect(prop).toBeDefined();
    if (prop === undefined) return;

    const centre = grid.tileToWorld(offsetSpec.tile);
    expect(prop.position.x).toBeCloseTo(centre.x + offsetSpec.offset.x * grid.tileSize);
    expect(prop.position.z).toBeCloseTo(centre.z + offsetSpec.offset.y * grid.tileSize);
  });
});

describe('authored map validation', () => {
  it('rejects non-square maps', () => {
    expect(() => createTownGrid({ ...BASE_SPEC, rows: ['#', '##'] })).toThrow(/square/i);
  });

  it('rejects unknown map characters', () => {
    expect(() => createTownGrid({ ...BASE_SPEC, rows: ['...', '.#.', '..?'] })).toThrow(
      /unknown/i,
    );
  });
});

function eachTile(grid: TownGrid): TileCoord[] {
  const coords: TileCoord[] = [];
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      coords.push({ x, y });
    }
  }
  return coords;
}

function countTiles(grid: TownGrid): Record<TileKind, number> {
  const counts: Record<TileKind, number> = { road: 0, lot: 0, park: 0 };
  for (const coord of eachTile(grid)) {
    const kind = grid.tileAt(coord);
    if (kind !== undefined) counts[kind]++;
  }
  return counts;
}

/** Flood-fills the road graph to prove every road tile is reachable. */
function reachableRoadCount(grid: TownGrid, start: TileCoord): number {
  const seen = new Set<string>();
  const queue: TileCoord[] = [start];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    const key = `${current.x},${current.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...grid.roadNeighbours(current));
  }
  return seen.size;
}

function neighbourInDirection(
  tile: { readonly x: number; readonly y: number },
  facing: Direction,
): { x: number; y: number } {
  switch (facing) {
    case 'north':
      return { x: tile.x, y: tile.y - 1 };
    case 'east':
      return { x: tile.x + 1, y: tile.y };
    case 'south':
      return { x: tile.x, y: tile.y + 1 };
    default:
      return { x: tile.x - 1, y: tile.y };
  }
}
