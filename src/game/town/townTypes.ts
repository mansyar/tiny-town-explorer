/** Tile kinds in the authored town map. */
export type TileKind = 'road' | 'lot' | 'park';

/** Compass direction, used for house facings and road connections. */
export type Direction = 'north' | 'east' | 'south' | 'west';

/** Iteration order that keeps neighbour queries deterministic. */
export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];

/** Which of a road tile's four sides connect to another road tile. */
export interface RoadConnections {
  readonly north: boolean;
  readonly east: boolean;
  readonly south: boolean;
  readonly west: boolean;
}

/**
 * Track-piece shape derived from a road tile's connections, used to pick the
 * matching Kenney tile model.
 */
export type RoadShape = 'isolated' | 'end' | 'straight' | 'curve' | 'tee' | 'cross';

/** Crashable prop kinds. */
export type PropKind = 'hydrant' | 'powerPole' | 'tree';

/** World-space position on the ground plane (x = east, z = south). */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/** Integer grid coordinate (x = column/east, y = row/south). */
export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

/** Offset inside a tile, measured in tile units from the tile centre. */
export interface TileOffset {
  readonly x: number;
  readonly y: number;
}

/** Authored house lot. */
export interface HouseSpec {
  readonly id: string;
  readonly tile: TileCoord;
  readonly facing: Direction;
}

/** Authored prop placement. */
export interface PropSpec {
  readonly kind: PropKind;
  readonly tile: TileCoord;
  readonly offset?: TileOffset;
}

/**
 * The whole hand-authored town: one row string per grid row (north row
 * first) using {@link TILE_CHARACTERS}.
 */
export interface TownMapSpec {
  /** Length of one tile in world units. */
  readonly tileSize: number;
  readonly rows: readonly string[];
  readonly houses: readonly HouseSpec[];
  readonly props: readonly PropSpec[];
  readonly spawnPoints: readonly TileCoord[];
}

/**
 * Character mapping used by the authored row strings: `#` road, `L` (or `.`)
 * house lot, `P` park.
 */
export const TILE_CHARACTERS: Readonly<Record<string, TileKind>> = {
  '#': 'road',
  L: 'lot',
  '.': 'lot',
  P: 'park',
};

/**
 * Collision radius per prop kind, in tile units so the town stays scale-free
 * when the Kenney tile size is finalized.
 */
export const PROP_COLLISION_RADIUS: Readonly<Record<PropKind, number>> = {
  hydrant: 0.16,
  powerPole: 0.1,
  tree: 0.34,
};

/** Unit step for each compass direction in grid space. */
export const DIRECTION_STEPS: Readonly<Record<Direction, TileCoord>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};
