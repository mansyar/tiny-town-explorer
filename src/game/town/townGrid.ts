import { TOWN_MAP } from './townMap';
import type {
  Direction,
  PropKind,
  RoadConnections,
  RoadShape,
  TileCoord,
  TileKind,
  TownMapSpec,
  Vec2,
} from './townTypes';
import {
  DIRECTION_STEPS,
  DIRECTIONS,
  PROP_COLLISION_RADIUS,
  tileKindForCharacter,
} from './townTypes';

/** A house placed in the world. */
export interface TownHouse {
  readonly id: string;
  readonly tile: TileCoord;
  readonly facing: Direction;
  /** World-space centre of the house lot. */
  readonly position: Vec2;
}

/** A crashable prop placed in the world. */
export interface TownProp {
  readonly id: string;
  readonly kind: PropKind;
  readonly tile: TileCoord;
  readonly position: Vec2;
  /** Circle radius used by collision and tap-to-prop snapping. */
  readonly collisionRadius: number;
}

/**
 * The town's footprint on the ground plane, as `minX`/`maxX`/`minZ`/`maxZ`
 * world coordinates. Reaches the *outer edges* of the corner tiles, so it is the
 * whole playable area rather than the span between tile centres.
 */
export interface TownBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Read-only view of the authored town with every query the gameplay systems
 * need: tile lookup, road adjacency and piece shapes, world/grid mapping,
 * and house/prop lookups. Pure logic — no three.js, no DOM.
 */
export interface TownGrid {
  /** Tiles per side. */
  readonly size: number;
  /** Length of one tile in world units. */
  readonly tileSize: number;
  /** Tile kinds indexed as `tiles[y][x]`, north row first. */
  readonly tiles: readonly (readonly TileKind[])[];
  readonly houses: readonly TownHouse[];
  readonly props: readonly TownProp[];
  readonly parkTiles: readonly TileCoord[];
  /** World-space spawn positions, in authored order. */
  readonly spawnPoints: readonly Vec2[];
  /** Outer edges of the town's tiles: the extent of the playable world. */
  readonly bounds: TownBounds;
  tileAt(tile: TileCoord): TileKind | undefined;
  isRoad(tile: TileCoord): boolean;
  /** In-bounds four-way neighbours. */
  neighbours(tile: TileCoord): readonly TileCoord[];
  roadNeighbours(tile: TileCoord): readonly TileCoord[];
  roadConnections(tile: TileCoord): RoadConnections;
  /** Track-piece shape for a road tile, or `undefined` off-road. */
  roadShape(tile: TileCoord): RoadShape | undefined;
  tileToWorld(tile: TileCoord): Vec2;
  worldToTile(point: Vec2): TileCoord;
  /** Nearest point to `point` that lies inside {@link bounds}. */
  clampToBounds(point: Vec2): Vec2;
  houseById(id: string): TownHouse | undefined;
  houseAt(point: Vec2): TownHouse | undefined;
  /** Props within `radius` world units of `point`, nearest first. */
  propsWithin(point: Vec2, radius: number): readonly TownProp[];
}

/**
 * Builds the town grid from authored map data.
 *
 * @param spec Authored map; defaults to the v1 town in `townMap.ts`.
 */
export function createTownGrid(spec: TownMapSpec = TOWN_MAP): TownGrid {
  const tiles = parseTiles(spec);
  const size = tiles.length;
  const centre = (size - 1) / 2;

  const tileAt = (tile: TileCoord): TileKind | undefined => tiles[tile.y]?.[tile.x];
  const isRoad = (tile: TileCoord): boolean => tileAt(tile) === 'road';

  const tileToWorld = (tile: TileCoord): Vec2 => ({
    x: (tile.x - centre) * spec.tileSize,
    z: (tile.y - centre) * spec.tileSize,
  });

  const worldToTile = (point: Vec2): TileCoord => ({
    x: Math.round(point.x / spec.tileSize + centre),
    y: Math.round(point.z / spec.tileSize + centre),
  });

  const neighbours = (tile: TileCoord): readonly TileCoord[] => {
    const result: TileCoord[] = [];
    for (const direction of DIRECTIONS) {
      const step = DIRECTION_STEPS[direction];
      const candidate = { x: tile.x + step.x, y: tile.y + step.y };
      if (tileAt(candidate) !== undefined) {
        result.push(candidate);
      }
    }
    return result;
  };

  const roadConnections = (tile: TileCoord): RoadConnections => ({
    north: isRoad({ x: tile.x, y: tile.y - 1 }),
    east: isRoad({ x: tile.x + 1, y: tile.y }),
    south: isRoad({ x: tile.x, y: tile.y + 1 }),
    west: isRoad({ x: tile.x - 1, y: tile.y }),
  });

  const roadShape = (tile: TileCoord): RoadShape | undefined => {
    if (!isRoad(tile)) {
      return undefined;
    }
    const { north, east, south, west } = roadConnections(tile);
    const count = Number(north) + Number(east) + Number(south) + Number(west);
    if (count === 0) return 'isolated';
    if (count === 1) return 'end';
    if (count === 4) return 'cross';
    if (count === 3) return 'tee';
    return (north && south) || (east && west) ? 'straight' : 'curve';
  };

  const houses: readonly TownHouse[] = spec.houses.map((house) => ({
    ...house,
    position: tileToWorld(house.tile),
  }));

  const propCounts = new Map<PropKind, number>();
  const props: readonly TownProp[] = spec.props.map((prop) => {
    const index = (propCounts.get(prop.kind) ?? 0) + 1;
    propCounts.set(prop.kind, index);
    const centre = tileToWorld(prop.tile);
    const offset = prop.offset ?? { x: 0, y: 0 };
    return {
      id: `${prop.kind}-${index}`,
      kind: prop.kind,
      tile: prop.tile,
      position: {
        x: centre.x + offset.x * spec.tileSize,
        z: centre.z + offset.y * spec.tileSize,
      },
      collisionRadius: PROP_COLLISION_RADIUS[prop.kind] * spec.tileSize,
    };
  });

  const parkTiles = collectTiles(tiles, 'park');

  // Tiles are centred on their coordinates, so the footprint starts half a tile
  // beyond the outermost centres — the town's real edge, not the centre line.
  const reach = ((size - 1) / 2 + 0.5) * spec.tileSize;
  const bounds: TownBounds = { minX: -reach, maxX: reach, minZ: -reach, maxZ: reach };

  const clampToBounds = (point: Vec2): Vec2 => ({
    x: Math.min(Math.max(point.x, bounds.minX), bounds.maxX),
    z: Math.min(Math.max(point.z, bounds.minZ), bounds.maxZ),
  });

  const houseAt = (point: Vec2): TownHouse | undefined => {
    const tile = worldToTile(point);
    return houses.find((house) => house.tile.x === tile.x && house.tile.y === tile.y);
  };

  const propsWithin = (point: Vec2, radius: number): readonly TownProp[] => {
    return props
      .map((prop) => ({
        prop,
        distance: Math.hypot(prop.position.x - point.x, prop.position.z - point.z),
      }))
      .filter((entry) => entry.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.prop);
  };

  return {
    size,
    tileSize: spec.tileSize,
    tiles,
    houses,
    props,
    parkTiles,
    spawnPoints: spec.spawnPoints.map(tileToWorld),
    bounds,
    tileAt,
    isRoad,
    neighbours,
    roadNeighbours: (tile) => neighbours(tile).filter(isRoad),
    roadConnections,
    roadShape,
    tileToWorld,
    worldToTile,
    clampToBounds,
    houseById: (id) => houses.find((house) => house.id === id),
    houseAt,
    propsWithin,
  };
}

function parseTiles(spec: TownMapSpec): readonly (readonly TileKind[])[] {
  const size = spec.rows.length;
  return spec.rows.map((row, y) => {
    if (row.length !== size) {
      throw new Error(
        `Town map must be square: row ${y} has ${row.length} tiles, expected ${size}`,
      );
    }
    return [...row].map((character) => {
      const kind = tileKindForCharacter(character);
      if (kind === undefined) {
        throw new Error(`Unknown town map character '${character}' at row ${y}`);
      }
      return kind;
    });
  });
}

function collectTiles(
  tiles: readonly (readonly TileKind[])[],
  kind: TileKind,
): TileCoord[] {
  const result: TileCoord[] = [];
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y] ?? [];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === kind) {
        result.push({ x, y });
      }
    }
  }
  return result;
}
