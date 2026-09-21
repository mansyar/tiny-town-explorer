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

/**
 * Crashable prop kinds, named for the kit art that actually exists.
 *
 * The spec asks for hydrants; no Kenney kit ships one, so a crashable traffic
 * cone takes that role (chunkier, and squarely toddler-bonkable). Poles and
 * trees come from City Kit (Roads) and City Kit (Suburban).
 */
export type PropKind = 'cone' | 'powerPole' | 'tree';

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
 * Resolves one character of an authored row string: `#` road, `L` (or `.`)
 * house lot, `P` park. Anything else is an authoring error.
 *
 * A switch rather than a lookup object because the map characters are data,
 * not identifiers that the naming convention should police.
 */
export function tileKindForCharacter(character: string): TileKind | undefined {
  switch (character) {
    case '#':
      return 'road';
    case 'L':
    case '.':
      return 'lot';
    case 'P':
      return 'park';
    default:
      return undefined;
  }
}

/**
 * Collision radius per prop kind, in tile units. Sizes follow the measured kit
 * models (cone 0.25 tall, pole 0.59 across, street tree a 0.77-tall trunk), so
 * a bonk registers at the art's own footprint.
 */
export const PROP_COLLISION_RADIUS: Readonly<Record<PropKind, number>> = {
  cone: 0.13,
  powerPole: 0.12,
  tree: 0.16,
};

/** Unit step for each compass direction in grid space. */
export const DIRECTION_STEPS: Readonly<Record<Direction, TileCoord>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};
