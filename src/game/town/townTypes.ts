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
 *
 * These are the props the car clips with a *circle*; parked cars are separate
 * kinds because they are hit by a footprint box instead (FR5).
 */
export type CirclePropKind = 'cone' | 'dumpster' | 'powerPole' | 'tree';

/**
 * Parked-car kinds: one per Car Kit model the town parks (FR1).
 *
 * A kind per model rather than one kind with a variant, because the registry,
 * the map and the collision radius table are all keyed by kind already — and a
 * parked car's model is what decides both the art and the footprint it boxes.
 */
export type ParkedCarKind = 'parkedSedan' | 'parkedHatchback' | 'parkedVan' | 'parkedSuv';

/** Every parked-car kind, in the order the registry lists its models. */
export const PARKED_CAR_KINDS: readonly ParkedCarKind[] = [
  'parkedSedan',
  'parkedHatchback',
  'parkedVan',
  'parkedSuv',
];

/** Everything the car can crash into that is not a house. */
export type PropKind = CirclePropKind | ParkedCarKind;

/**
 * Whether a prop is a parked car, and therefore a footprint box rather than a
 * circle (FR5). Used as a type guard so the circle-only paths cannot be handed
 * a parked car by accident.
 */
export function isParkedCarKind(kind: PropKind): kind is ParkedCarKind {
  return (PARKED_CAR_KINDS as readonly string[]).includes(kind);
}

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
  /**
   * Which suburban model stands on the lot. Authored rather than cycled by
   * index, so the pure layer knows each house's geometry — the wall a parked
   * car has to clear is `1.00 - fitted depth / 2`, which no constant can
   * express — and so adding a house cannot silently re-skin the whole street.
   */
  readonly model: BuildingKind;
}

/** Authored prop placement. */
export interface PropSpec {
  readonly kind: PropKind;
  readonly tile: TileCoord;
  readonly offset?: TileOffset;
  /**
   * Authored yaw in radians, for props that are not simply upright. Parked cars
   * need it to lie along their street; every other prop either stands straight
   * or is turned by the layout's own rule.
   */
  readonly yaw?: number;
}

/**
 * An authored puppy hiding place (FR6).
 *
 * Lives in the map beside the houses and props it reads as a place among, so a
 * new town authors its own hiding places and the mission layer never hardcodes
 * a tile. The nudge puts the pup behind something: a spot on a lot sits at the
 * kerb of the street its house faces, outside the capped house footprint and
 * within a car's reach of the road.
 */
export interface HidingSpotSpec {
  readonly id: string;
  readonly tile: TileCoord;
  /** Nudge within the tile, in tile units (y maps to world z). */
  readonly offset: TileOffset;
}

/**
 * The park mission's authored litter layout for one `P` tile (FR6).
 *
 * Keyed to the tile it decorates rather than to an index, so the layout is
 * checked against the map — and a green that is not the park (the pond is its
 * own tile kind) can never receive litter.
 */
export interface ParkSlotSpec {
  readonly tile: TileCoord;
  /** Fixed readable slots within the tile, in tile units (y maps to world z). */
  readonly slots: readonly TileOffset[];
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
  readonly hidingSpots: readonly HidingSpotSpec[];
  readonly parkSlots: readonly ParkSlotSpec[];
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
export const PROP_COLLISION_RADIUS: Readonly<Record<CirclePropKind, number>> = {
  cone: 0.13,
  dumpster: 0.18,
  powerPole: 0.12,
  tree: 0.16,
};

/**
 * Kit-space extents of each parked model, measured from the committed GLBs with
 * `pnpm assets:measure` (2026-09-22, `--top=60`): `length` is the axis the car
 * is longest along (the Car Kit authors that on model z), `width` the one
 * across it, and `height` its box above the ground — which is what decides where
 * the blob shadow lands (FR7).
 *
 * Recorded here because collision needs a parked car's footprint *before* the
 * art is mounted — the renderer measures the same models at mount time, and
 * Phase 4's task checks the two agree.
 */
export const PARKED_CAR_EXTENTS: Readonly<
  Record<
    ParkedCarKind,
    { readonly length: number; readonly width: number; readonly height: number }
  >
> = {
  parkedSedan: { length: 2.55, width: 1.5, height: 1.3 },
  parkedHatchback: { length: 2.85, width: 1.3, height: 1.1 },
  parkedVan: { length: 2.75, width: 1.5, height: 1.35 },
  parkedSuv: { length: 2.7, width: 1.5, height: 1.3 },
};

/**
 * Longest horizontal extent a parked car occupies once fitted, in world units
 * (FR2).
 *
 * 0.55 rather than a size chosen by eye: the house walls measure 0.574 to 0.748
 * from a street's centre line (`1.00 − fitted depth ÷ 2`), and a car's inner
 * edge must stay 0.26 clear of the lane. At 0.55 the widest model leaves a
 * half-width of 0.162, so a kerb qualifies whenever its wall reaches 0.652 —
 * which every kerb but the two narrowest does. At 0.65 only four kerbs in town
 * qualified.
 */
export const PARKED_CAR_FIT = 0.55;

/**
 * How far a parked car's centre sits from its street's centre line (FR3).
 *
 * Chosen inside the feasible band for the tightest eligible kerb: its inner
 * edge lands 0.298 clear of the lane (the player's capsule is 0.26) and its
 * outer edge reaches 0.622, inside the 0.657 wall of the narrowest kerb a car
 * is allowed to use.
 */
export const PARKED_CAR_KERB_OFFSET = 0.46;

/**
 * Half extents a parked car occupies along its own length and width axes,
 * derived from the fit and the model's measured proportions (FR2, FR5).
 *
 * Never scaled up: a model already smaller than the fit keeps its own size, the
 * same rule the renderer's `fitScale` applies to the art.
 */
export function parkedCarHalfExtents(kind: ParkedCarKind): {
  readonly halfLength: number;
  readonly halfWidth: number;
} {
  const extents = PARKED_CAR_EXTENTS[kind];
  const scale = parkedCarScale(kind);
  return {
    halfLength: (extents.length * scale) / 2,
    halfWidth: (extents.width * scale) / 2,
  };
}

/**
 * Height a fitted parked car reaches above the ground it is seated on, in world
 * units (FR7).
 *
 * Measured rather than guessed: the blob shadow lands where the sun would throw
 * the car's roof, so its offset is this height times the sun's ground direction,
 * and the models are not all the same shape — the van is 0.27 tall once fitted,
 * the hatchback 0.21.
 */
export function parkedCarFittedHeight(kind: ParkedCarKind): number {
  return PARKED_CAR_EXTENTS[kind].height * parkedCarScale(kind);
}

/**
 * Uniform scale the renderer fits a parked model at: the cap over its *longest*
 * horizontal axis, which is the axis `fitScale` measures, matching it exactly.
 *
 * Never above 1: a model already smaller than the cap keeps its own size, the
 * same way `fitScale` refuses to scale art up.
 */
function parkedCarScale(kind: ParkedCarKind): number {
  return Math.min(1, PARKED_CAR_FIT / PARKED_CAR_EXTENTS[kind].length);
}

/**
 * A parked car's footprint in world axes, for the box hitbox collision sweeps
 * (FR5).
 *
 * Throws on a yaw that is not a quarter turn: `collision.ts`'s box shape is
 * axis-aligned, so a diagonal car would silently get a hitbox that disagrees
 * with the art it was measured from. Failing loudly at the data layer is the
 * only place that mistake can be caught before it ships.
 */
export function parkedCarFootprint(
  kind: ParkedCarKind,
  yaw: number,
): { readonly halfX: number; readonly halfZ: number } {
  const quarters = yaw / (Math.PI / 2);
  if (!Number.isInteger(quarters)) {
    throw new Error(
      `Parked-car yaw must be a quarter turn, got ${yaw} rad (${quarters} quarters)`,
    );
  }
  const { halfLength, halfWidth } = parkedCarHalfExtents(kind);
  return Math.abs(quarters % 2) === 1
    ? { halfX: halfLength, halfZ: halfWidth }
    : { halfX: halfWidth, halfZ: halfLength };
}

/** The widest half-width across the parked models: the binding case for a kerb. */
export function widestParkedHalfWidth(): number {
  return Math.max(
    ...PARKED_CAR_KINDS.map((kind) => parkedCarHalfExtents(kind).halfWidth),
  );
}

/**
 * Gap a parked car leaves between itself and the wall it stands against, in
 * world units. Small — the band between the lane and the narrowest usable wall
 * is only a few centimetres — but real, so a car never looks welded to a house.
 */
export const KERB_CLEARANCE = 0.03;

/**
 * The narrowest house wall a kerb may have for a car to park against it, in
 * world units, derived rather than eyeballed: the kerb offset plus the widest
 * car's half-width plus the gap it must leave. A kerb with a wall narrower than
 * this cannot seat a car without either entering the lane or entering the wall.
 *
 * Measured walls in this town run 0.574 to 0.748, which is why two kerbs are
 * unusable and the fit is what it is (see {@link PARKED_CAR_FIT}).
 */
export const MIN_KERB_WALL =
  PARKED_CAR_KERB_OFFSET + widestParkedHalfWidth() + KERB_CLEARANCE;

/**
 * Height a parked car is seated at, measured from City Kit (Roads): a tile's
 * base is 0.00, its asphalt +0.01 and its kerb top +0.02.
 *
 * A parked car's footprint crosses all three, so seating it on the ground would
 * bury its wheels 0.02 in the kerb; seating it on the kerb top instead floats it
 * 0.02 above the lawn, which is below visual notice.
 */
export const PARKED_CAR_SEAT_HEIGHT = 0.02;

/**
 * Share of a one-tile lot a house may fill, centred on the lot.
 *
 * Kit buildings run up to 1.83 units wide against one-tile lots, so the renderer
 * scales each one to fit this cap — and the collision box is derived from the
 * same figure, because a hitbox that disagreed with the art would let the car
 * park inside a wall.
 */
export const HOUSE_LOT_FIT = 0.86;

/**
 * Measured world-space half extents of a mounted building, along the town axes.
 *
 * Taken from the model's own bounding box after the renderer has fitted and
 * turned it. The lot-fill cap above bounds only a model's widest axis, so a box
 * built from the cap walls off the lawn on the narrower one; this is the art the
 * car actually meets.
 */
export interface HouseFootprint {
  readonly halfX: number;
  readonly halfZ: number;
}

/** The eight City Kit (Suburban) models the town's houses are drawn from. */
export type BuildingKind =
  | 'type-a'
  | 'type-b'
  | 'type-c'
  | 'type-d'
  | 'type-f'
  | 'type-h'
  | 'type-q'
  | 'type-r';

/**
 * Kit-space horizontal extents of each house model, measured from the committed
 * GLBs with `pnpm assets:measure` (2026-09-22): `width` across the facade and
 * `depth` from front to back. `depth` is the axis the house presents to the
 * street it faces, and so the one a parked car's kerb is measured against.
 */
export const BUILDING_EXTENTS: Readonly<
  Record<BuildingKind, { readonly width: number; readonly depth: number }>
> = {
  'type-a': { width: 1.3, depth: 1.03 },
  'type-b': { width: 1.83, depth: 1.14 },
  'type-c': { width: 1.29, depth: 1.03 },
  'type-d': { width: 1.76, depth: 1.03 },
  'type-f': { width: 1.43, depth: 1.41 },
  'type-h': { width: 1.3, depth: 0.92 },
  'type-q': { width: 1.24, depth: 0.89 },
  'type-r': { width: 1.03, depth: 1.02 },
};

/**
 * Uniform scale the renderer applies to a house: its widest horizontal axis is
 * capped at `HOUSE_LOT_FIT` tiles and the other axis follows. Never scaled up,
 * matching `fitScale` in the renderer.
 */
function houseFitScale(kind: BuildingKind, tileSize: number): number {
  const { width, depth } = BUILDING_EXTENTS[kind];
  return Math.min(1, (tileSize * HOUSE_LOT_FIT) / Math.max(width, depth));
}

/**
 * Half extents a fitted house occupies in **world axes**, given the way it
 * faces — the same `{ halfX, halfZ }` shape collision publishes for the mounted
 * art, so a predicted footprint can stand in for a measured one.
 *
 * The fit caps whichever axis is wider in the model, which is why a house's
 * depth is a property of its model rather than of the lot cap; the model then
 * turns so that its depth faces the street, so a house facing north or south
 * presents its depth along z and one facing east or west along x.
 */
export function houseFootprint(
  kind: BuildingKind,
  tileSize: number,
  facing: Direction,
): HouseFootprint {
  const { width, depth } = BUILDING_EXTENTS[kind];
  const scale = houseFitScale(kind, tileSize);
  const depthAlongZ = facing === 'north' || facing === 'south';
  const alongZ = (depthAlongZ ? depth : width) * scale;
  const alongX = (depthAlongZ ? width : depth) * scale;
  return { halfX: alongX / 2, halfZ: alongZ / 2 };
}

/**
 * How far a house's street-facing wall stands from that street's centre line, in
 * world units.
 *
 * A lot and the street it faces have their centres one tile apart and the house
 * is centred on its lot, so the wall is `tileSize` minus the fitted half depth.
 * This is the number a parked car has to clear (FR3), and it ranges from 0.574
 * to 0.748 in this town — never the 0.93 the first draft assumed.
 */
export function houseWallDistance(kind: BuildingKind, tileSize: number): number {
  const { depth } = BUILDING_EXTENTS[kind];
  return tileSize - (depth * houseFitScale(kind, tileSize)) / 2;
}

/** Unit step for each compass direction in grid space. */
export const DIRECTION_STEPS: Readonly<Record<Direction, TileCoord>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};
