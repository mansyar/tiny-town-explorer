import {
  BUILDING_MODELS,
  NATURE_MODELS,
  PROP_MODELS,
  ROAD_MODELS,
} from '../assets/modelRegistry';
import type { TownGrid } from './townGrid';
import type { Direction, RoadConnections, RoadShape, Vec2 } from './townTypes';
import { DIRECTION_STEPS, DIRECTIONS } from './townTypes';

/**
 * The town's placement plan: what to mount, and exactly where.
 *
 * This module is deliberately pure — it turns authored map data into a list of
 * placements and touches neither three.js nor the network, so the layout stays
 * unit-testable while the models load asynchronously in `townRenderer`. Every
 * decision that can be made from data (which tile model a junction needs, which
 * way it faces, how big a house may be on its lot) is made here.
 */

/** Lawns and park grass. Green lots with cream houses are the product palette. */
const GROUND_COLORS = {
  lot: 0x8ed08e,
  park: 0xa9e0a9,
} as const;

/** Four rotations of a quarter turn, in radians; index 0 is north as authored. */
const QUARTER_TURN = Math.PI / 2;

/**
 * A flat coloured quad standing in for a patch of ground. Lawns stay primitive
 * geometry rather than a kit model: City Kit (Roads)' `tile-low` is pavement,
 * and the town wants grass under its lots.
 */
export interface GroundPlacement {
  readonly kind: 'ground';
  readonly name: string;
  readonly position: Vec2;
  readonly size: number;
  readonly color: number;
}

/** One instance of a kit model. */
export interface ModelPlacement {
  readonly kind: 'model';
  readonly name: string;
  /** Bundled asset URL. */
  readonly url: string;
  readonly position: Vec2;
  /** Rotation about Y, in radians. */
  readonly yaw: number;
  /**
   * Largest horizontal extent this instance may occupy, in world units. The
   * renderer measures the model and scales it down to fit; kit buildings run up
   * to 1.83 units wide and would otherwise overhang a one-tile lot. Absent
   * means mount at the kit's own scale.
   */
  readonly fitWithin?: number;
}

export type Placement = GroundPlacement | ModelPlacement;

/** The full plan for one town. */
export interface TownPlan {
  readonly placements: readonly Placement[];
}

/** A house may fill this share of its one-tile lot, leaving a visible margin. */
const HOUSE_FIT = 0.86;

/**
 * Which axis a straight road runs along, and therefore its yaw: the kit's
 * `road-straight` paints its band along model x, i.e. east-west at yaw 0.
 */
function straightYaw(connections: RoadConnections): number {
  return connections.north || connections.south ? QUARTER_TURN : 0;
}

/**
 * Yaw for the kit's `road-bend-square`: a 1 x 1 corner whose asphalt reaches
 * the **west and south** edges as authored (measured — see
 * `kit-mount-measurements.md`, so no 2 x 2 `road-curve` is needed).
 *
 * Its asphalt is a 0.60 band centred on each edge and its kerb wraps the outer
 * north/east sides, so it seams flush against `road-straight` on either arm.
 * A positive yaw turns a model counterclockwise on a north-up map (verified
 * against three.js: yaw `+pi/2` carries model east onto world north), so each
 * quarter turn moves the elbow west -> south -> east -> north.
 */
function bendYaw(connections: RoadConnections): number {
  if (connections.west && connections.south) {
    return 0;
  }
  if (connections.south && connections.east) {
    return QUARTER_TURN;
  }
  if (connections.east && connections.north) {
    return QUARTER_TURN * 2;
  }
  return QUARTER_TURN * 3;
}

/**
 * Yaw for the kit's `road-intersection`: east-west through with a stem toward
 * south as authored (measured), so a north-stemmed tee is the same piece turned
 * about.
 */
function teeYaw(connections: RoadConnections): number {
  return connections.south ? 0 : QUARTER_TURN * 2;
}

/**
 * Yaw per direction for the kit's `road-end` (measured).
 *
 * The dead-end's asphalt reaches its **east** edge as authored, so it opens
 * along model `+x` — a quarter turn away from the `+z` that
 * {@link yawForDirection} assumes for models authored facing south.
 */
const END_YAW: Readonly<Record<Direction, number>> = {
  east: 0,
  north: QUARTER_TURN,
  west: QUARTER_TURN * 2,
  south: -QUARTER_TURN,
};

/** Yaw that opens the dead-end's stub toward the tile's single connection. */
function endYaw(connections: RoadConnections): number {
  const direction = DIRECTIONS.find((candidate) => connections[candidate]);
  return direction === undefined ? 0 : END_YAW[direction];
}

/**
 * Angle that turns a model's local `+z` toward the given direction, matching
 * the town's axes (x = east, z = south).
 */
export function yawForDirection(direction: Direction): number {
  switch (direction) {
    case 'north':
      return Math.PI;
    case 'east':
      return QUARTER_TURN;
    case 'south':
      return 0;
    case 'west':
      return -QUARTER_TURN;
  }
}

/**
 * The road tile model and rotation for a derived track shape.
 *
 * Shapes without a dedicated kit piece fall back to the nearest legitimate one
 * rather than inventing geometry: a lone road tile becomes a dead-end stub.
 */
export function roadPlacementFor(
  shape: RoadShape,
  connections: RoadConnections,
): { readonly url: string; readonly yaw: number } {
  switch (shape) {
    case 'straight':
      return { url: ROAD_MODELS.straight, yaw: straightYaw(connections) };
    case 'curve':
      return { url: ROAD_MODELS.bend, yaw: bendYaw(connections) };
    case 'tee':
      return { url: ROAD_MODELS.intersection, yaw: teeYaw(connections) };
    case 'cross':
      return { url: ROAD_MODELS.crossroad, yaw: 0 };
    case 'end':
      return { url: ROAD_MODELS.end, yaw: endYaw(connections) };
    case 'isolated':
      return { url: ROAD_MODELS.end, yaw: 0 };
  }
}

/**
 * Builds the plan for a town.
 *
 * Order is fixed (rows north to south, then houses, then props) so a plan is
 * reproducible and its tests can assert positions rather than sets.
 */
export function planTown(grid: TownGrid): TownPlan {
  const placements: Placement[] = [];

  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const tile = { x, y };
      // The grid is square by construction (it rejects ragged maps), so every
      // coordinate in range has a tile kind.
      const kind = grid.tileAt(tile);
      const centre = grid.tileToWorld(tile);
      placements.push({
        kind: 'ground',
        name: `ground-${x}-${y}`,
        position: centre,
        size: grid.tileSize,
        color: kind === 'park' ? GROUND_COLORS.park : GROUND_COLORS.lot,
      });

      const shape = grid.roadShape(tile);
      if (shape === undefined) {
        continue;
      }
      const road = roadPlacementFor(shape, grid.roadConnections(tile));
      placements.push({
        kind: 'model',
        name: `road-${x}-${y}`,
        url: road.url,
        position: centre,
        yaw: road.yaw,
      });
    }
  }

  grid.houses.forEach((house, index) => {
    placements.push({
      kind: 'model',
      name: house.id,
      url: buildingModelFor(index),
      position: house.position,
      yaw: yawForDirection(house.facing),
      fitWithin: grid.tileSize * HOUSE_FIT,
    });
  });

  grid.props.forEach((prop, index) => {
    placements.push({
      kind: 'model',
      name: prop.id,
      url: PROP_MODELS[prop.kind],
      position: prop.position,
      // Trees get a deterministic quarter-turn each so a park row does not read
      // as one model stamped eight times; upright props stay axis-aligned.
      yaw: prop.kind === 'tree' ? (index % 4) * QUARTER_TURN : 0,
    });
  });

  return { placements };
}

/**
 * House model for a lot, cycling the registry so neighbours differ.
 *
 * The `??` covers an empty registry rather than any reachable index: an indexed
 * read is `T | undefined` under `noUncheckedIndexedAccess`, and a stray planter
 * on a lot still beats handing the loader an undefined URL.
 */
function buildingModelFor(index: number): string {
  return BUILDING_MODELS[index % BUILDING_MODELS.length] ?? NATURE_MODELS.planter;
}

/** Re-exported so callers can iterate the same order the plan uses. */
export const PLACEMENT_DIRECTIONS: readonly Direction[] = DIRECTIONS;

/** Grid step for a direction, re-exported for renderer-side checks. */
export const PLACEMENT_STEPS: Readonly<Record<Direction, { x: number; y: number }>> =
  DIRECTION_STEPS;
