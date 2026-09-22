import type { TownGrid } from '../town/townGrid';
import {
  DIRECTION_STEPS,
  DIRECTIONS,
  type Direction,
  isParkedCarKind,
  type TileCoord,
  type Vec2,
} from '../town/townTypes';
import { fixedParkItems } from './parkSlots';
import { createPuppySpots } from './puppySpots';

/**
 * Which kerb edges the town has already spoken for (FR8).
 *
 * Three systems now place things at a kerb and, until this module existed, none
 * of them could see the others: the parked cars are authored onto kerbs, the
 * park mission lays three litter pieces on ring-road lots, and the puppy hides
 * by two houses' kerbs. Two of those colliding is not a crash — it is a piece of
 * litter inside a car, or a pup hiding where a car is standing, which reads as a
 * bug the kid cannot do anything about.
 *
 * So the rule is stated once, here, and both directions are enforced:
 *
 * - **Declared**: every kerb a mission's *fixed* item stands on (the park's
 *   north-edge slots and the puppy's two kerbside spots), derived from those
 *   missions' own layout data rather than hand-listed.
 * - **Occupied**: every kerb a parked car stands on, derived from its position.
 * - **Taken**: the union — what a *dynamic* placer must skip, which is how the
 *   litter draw yields to the cars.
 *
 * A kerb edge is identified by the street tile it runs along plus the way it
 * faces, because that is exactly what two items have to share to collide: the
 * same stretch of kerb, faced the same way.
 */

/** One kerb edge: the street tile it runs along, and the way it faces. */
export interface KerbEdge {
  readonly road: TileCoord;
  /** Which way the kerb faces, from the street tile toward what it serves. */
  readonly toward: Direction;
}

/** A kerb edge a mission has claimed, and what claimed it. */
export interface DeclaredKerb {
  readonly edge: KerbEdge;
  readonly owner: 'park-litter' | 'puppy';
  /** What exactly stands there, for a failure message worth reading. */
  readonly item: string;
}

/** A parked car and the kerb it occupies. */
export interface ParkedKerb {
  readonly propId: string;
  readonly edge: KerbEdge;
}

/**
 * Where a kerb band begins: outside the driving surface.
 *
 * `road-straight`'s asphalt is a 0.60-wide band on a 1.00 tile (measured, see
 * `townLayout`), so anything nearer the centre line than 0.30 is road the car is
 * meant to drive on, not kerb.
 */
export const KERB_BAND_INNER = 0.3;

/**
 * Where a kerb band ends: 0.80 out from the street's centre line.
 *
 * Everything the missions and the cars place sits 0.46–0.70 out, so a tighter
 * bound than this would start calling the middle of a lot a kerb, and a looser
 * one would let a corner lot's *far* kerb claim a piece that stands on its near
 * one — which would take lots out of the litter draw for no reason.
 */
export const KERB_BAND_OUTER = 0.8;

/** Stable identity for a kerb edge, for sets and comparisons. */
export function kerbKey(edge: KerbEdge): string {
  return `${edge.road.x},${edge.road.y}:${edge.toward}`;
}

/**
 * Every kerb edge a point stands in the band of, nearest first.
 *
 * Read from the position alone rather than from a prop's authored offset: a
 * piece of litter and a parked car have to agree about which kerb they are on,
 * and the only thing they share is where they are.
 *
 * A point can sit in two bands at once — a park slot at the corner of its tile
 * is 0.65 from one street's centre line and 0.70 from another's — and it
 * declares both, because either kerb would collide with it.
 */
export function kerbEdgesOfPoint(grid: TownGrid, point: Vec2): readonly KerbEdge[] {
  const tile = grid.worldToTile(point);
  const found = grid.isRoad(tile)
    ? // A car stands *on* the street and hugs one kerb of it...
      [ownRoadEdge(grid, tile, point)]
    : // ...where everything else stands beside a street and may be in two
      // bands at once.
      kerbsBesideTile(grid, tile, point);

  return found
    .filter((entry) => entry !== undefined)
    .sort((left, right) => left.distance - right.distance)
    .map((entry) => entry.edge);
}

/** Kerb bands of the streets around the tile a point stands on. */
function kerbsBesideTile(
  grid: TownGrid,
  tile: TileCoord,
  point: Vec2,
): readonly { readonly edge: KerbEdge; readonly distance: number }[] {
  const found: { readonly edge: KerbEdge; readonly distance: number }[] = [];
  for (const direction of DIRECTIONS) {
    const step = DIRECTION_STEPS[direction];
    const road = { x: tile.x - step.x, y: tile.y - step.y };
    if (!grid.isRoad(road)) {
      continue;
    }
    // Distance from the street's centre line, along the axis the kerb runs
    // across: `direction` is the way the kerb faces, so that is the lateral.
    const centre = grid.tileToWorld(road);
    const lateral =
      direction === 'north' || direction === 'south'
        ? point.z - centre.z
        : point.x - centre.x;
    const distance = Math.abs(lateral);
    if (distance > KERB_BAND_INNER && distance <= KERB_BAND_OUTER) {
      found.push({ edge: { road, toward: direction }, distance });
    }
  }
  return found;
}

/** The kerb a point standing *on* a street tile faces, if it is in the band. */
function ownRoadEdge(
  grid: TownGrid,
  road: TileCoord,
  point: Vec2,
): { readonly edge: KerbEdge; readonly distance: number } | undefined {
  const centre = grid.tileToWorld(road);
  const offset = { x: point.x - centre.x, z: point.z - centre.z };
  const lateral = Math.abs(offset.x) >= Math.abs(offset.z);
  const distance = lateral ? Math.abs(offset.x) : Math.abs(offset.z);
  if (distance <= KERB_BAND_INNER || distance > KERB_BAND_OUTER) {
    return undefined;
  }
  const toward: Direction = lateral
    ? offset.x > 0
      ? 'east'
      : 'west'
    : offset.z > 0
      ? 'south'
      : 'north';
  return { edge: { road, toward }, distance };
}

/**
 * Every kerb the missions' fixed items stand on.
 *
 * Derived, never hand-copied: if the park's layout or the puppy's spots move,
 * the declaration moves with them, and a test that the shipped cars still agree
 * with it is what catches the change.
 */
export function declaredKerbs(grid: TownGrid): readonly DeclaredKerb[] {
  const declared: DeclaredKerb[] = [];

  fixedParkItems(grid).forEach((item, index) => {
    for (const edge of kerbEdgesOfPoint(grid, item.position)) {
      declared.push({ edge, owner: 'park-litter', item: `park-slot-${index + 1}` });
    }
  });

  for (const spot of createPuppySpots({ grid }).spots) {
    for (const edge of kerbEdgesOfPoint(grid, spot.position)) {
      declared.push({ edge, owner: 'puppy', item: spot.id });
    }
  }

  return declared;
}

/** Every kerb a parked car stands on. */
export function parkedCarKerbEdges(grid: TownGrid): readonly ParkedKerb[] {
  const parked: ParkedKerb[] = [];
  for (const prop of grid.props) {
    if (!isParkedCarKind(prop.kind)) {
      continue;
    }
    const [edge] = kerbEdgesOfPoint(grid, prop.position);
    if (edge !== undefined) {
      parked.push({ propId: prop.id, edge });
    }
  }
  return parked;
}

/**
 * Every kerb that is spoken for, by a car or by a mission.
 *
 * This is the set a dynamic placer has to skip: the litter draw asks it before
 * choosing which kerb to send the kid down (FR8).
 */
export function takenKerbKeys(grid: TownGrid): ReadonlySet<string> {
  const taken = new Set<string>();
  for (const declared of declaredKerbs(grid)) {
    taken.add(kerbKey(declared.edge));
  }
  for (const occupied of parkedCarKerbEdges(grid)) {
    taken.add(kerbKey(occupied.edge));
  }
  return taken;
}

/**
 * Parked cars standing on a kerb a mission has declared, if any.
 *
 * Empty for the shipped town. It exists so "a car may not park on a declared
 * kerb" is checkable at all: the property spans the town's authoring and two
 * missions' data, and nothing else in the codebase sees both.
 */
export function declaredKerbViolations(grid: TownGrid): readonly {
  readonly propId: string;
  readonly owner: DeclaredKerb['owner'];
  readonly item: string;
  readonly edge: KerbEdge;
}[] {
  const owners = new Map<string, DeclaredKerb>();
  for (const declared of declaredKerbs(grid)) {
    owners.set(kerbKey(declared.edge), declared);
  }

  const violations: {
    propId: string;
    owner: DeclaredKerb['owner'];
    item: string;
    edge: KerbEdge;
  }[] = [];
  for (const occupied of parkedCarKerbEdges(grid)) {
    const declared = owners.get(kerbKey(occupied.edge));
    if (declared !== undefined) {
      violations.push({
        propId: occupied.propId,
        owner: declared.owner,
        item: declared.item,
        edge: occupied.edge,
      });
    }
  }
  return violations;
}
