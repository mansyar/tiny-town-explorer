import { describe, expect, it } from 'vitest';
import { type Obstacle, overlapsObstacle } from '../collision/collision';
import { CAR_RADIUS } from '../vehicle/vehicleMotor';
import { createTownGrid, type TownProp } from './townGrid';
import { TOWN_MAP } from './townMap';
import {
  DIRECTION_STEPS,
  type DIRECTIONS,
  houseFootprint,
  houseWallDistance,
  isParkedCarKind,
  KERB_CLEARANCE,
  MIN_KERB_WALL,
  PARKED_CAR_SEAT_HEIGHT,
  parkedCarHalfExtents,
  widestParkedHalfWidth,
} from './townTypes';

/**
 * The kerbside placement and clearance contracts (FR2, FR3, FR4).
 *
 * These are the tests that decide *where* a parked car may stand, as opposed to
 * `parkedCars.test.ts`, which only asserts the shape of the data. Every rule
 * here is derived from measurement — the houses' fitted depths, the player's
 * own capsule, the authored props and spawn points — so a future map or art
 * change resurfaces as a failure instead of a car standing in the road or
 * inside a wall.
 */

const grid = createTownGrid(TOWN_MAP);
const parked = grid.props.filter((prop) => isParkedCarKind(prop.kind));

/** An axis-aligned footprint, the shape collision sweeps a parked car with. */
interface Footprint {
  readonly centre: { readonly x: number; readonly z: number };
  readonly halfX: number;
  readonly halfZ: number;
}

function footprintOf(prop: TownProp): Footprint {
  const footprint = prop.footprint;
  if (footprint === undefined) {
    throw new Error(`${prop.id} has no footprint`);
  }
  return { centre: prop.position, halfX: footprint.halfX, halfZ: footprint.halfZ };
}

/** Parked cars as the obstacles collision will build from their footprints. */
const parkedObstacles: readonly Obstacle[] = parked.map((prop) => ({
  id: prop.id,
  solid: false,
  shape: {
    kind: 'box' as const,
    centre: prop.position,
    halfX: prop.footprint?.halfX ?? 0,
    halfZ: prop.footprint?.halfZ ?? 0,
  },
}));

/** Two axis-aligned footprints overlap when they overlap on both axes. */
function boxesOverlap(left: Footprint, right: Footprint): boolean {
  return (
    Math.abs(left.centre.x - right.centre.x) < left.halfX + right.halfX &&
    Math.abs(left.centre.z - right.centre.z) < left.halfZ + right.halfZ
  );
}

/** Authored offset of a parked car from its street tile's centre. */
function kerbOffset(prop: TownProp): { x: number; z: number } {
  const centre = grid.tileToWorld(prop.tile);
  return { x: prop.position.x - centre.x, z: prop.position.z - centre.z };
}

/** The compass direction a parked car's kerb offset points, i.e. its kerb. */
function kerbDirection(prop: TownProp): (typeof DIRECTIONS)[number] {
  const offset = kerbOffset(prop);
  if (Math.abs(offset.x) >= Math.abs(offset.z)) {
    return offset.x > 0 ? 'east' : 'west';
  }
  return offset.z > 0 ? 'south' : 'north';
}

/** The tile the car's kerb faces — the lot whose lawn it overhangs. */
function kerbTile(prop: TownProp) {
  const step = DIRECTION_STEPS[kerbDirection(prop)];
  return { x: prop.tile.x + step.x, y: prop.tile.y + step.y };
}

/** Steps taken along one driving leg when checking it stays clear. */
const LEG_SAMPLES = 20;

/** Every point on the network's centre lines: each street tile and each leg. */
function streetPoints(): readonly {
  readonly point: { readonly x: number; readonly z: number };
  readonly where: string;
}[] {
  const points: { point: { x: number; z: number }; where: string }[] = [];
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const tile = { x, y };
      if (!grid.isRoad(tile)) continue;
      const centre = grid.tileToWorld(tile);
      points.push({ point: centre, where: `${x},${y}'s centre` });
      for (const neighbour of grid.roadNeighbours(tile)) {
        const to = grid.tileToWorld(neighbour);
        for (let step = 0; step <= LEG_SAMPLES; step += 1) {
          const along = step / LEG_SAMPLES;
          points.push({
            point: {
              x: centre.x + (to.x - centre.x) * along,
              z: centre.z + (to.z - centre.z) * along,
            },
            where: `the leg ${x},${y} -> ${neighbour.x},${neighbour.y}`,
          });
        }
      }
    }
  }
  return points;
}

describe('kerb eligibility (FR3)', () => {
  it('parks only alongside a straight road tile, never a bend or a junction', () => {
    for (const prop of parked) {
      expect(grid.isRoad(prop.tile), `${prop.id} is not on a street`).toBe(true);
      expect(
        grid.roadShape(prop.tile),
        `${prop.id} parks on a ${grid.roadShape(prop.tile)} kerb`,
      ).toBe('straight');
    }
  });

  it('parks only against a house wall that clears the widest fitted car', () => {
    for (const prop of parked) {
      const tile = kerbTile(prop);
      const house = grid.houses.find(
        (candidate) => candidate.tile.x === tile.x && candidate.tile.y === tile.y,
      );
      expect(
        house,
        `${prop.id} faces ${tile.x},${tile.y} where no house stands`,
      ).toBeDefined();
      if (house === undefined) continue;
      const wall = houseWallDistance(house.model, grid.tileSize);
      expect(
        wall,
        `${prop.id} parks against ${house.id} (${house.model}), whose wall is ${wall.toFixed(3)} from the street centre — the narrowest a kerb may be is ${MIN_KERB_WALL.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(MIN_KERB_WALL);
    }
  });

  it("leaves a real gap between the car's outer edge and the wall behind it", () => {
    for (const prop of parked) {
      const tile = kerbTile(prop);
      const house = grid.houses.find(
        (candidate) => candidate.tile.x === tile.x && candidate.tile.y === tile.y,
      );
      if (house === undefined) continue;
      const wall = houseWallDistance(house.model, grid.tileSize);
      const offset = kerbOffset(prop);
      const outward = Math.max(Math.abs(offset.x), Math.abs(offset.z));
      const halfWidth = isParkedCarKind(prop.kind)
        ? parkedCarHalfExtents(prop.kind).halfWidth
        : 0;
      expect(
        wall - (outward + halfWidth),
        `${prop.id} stands ${(wall - (outward + halfWidth)).toFixed(3)} from ${house.id}'s wall`,
      ).toBeGreaterThanOrEqual(KERB_CLEARANCE);
    }
  });

  it('seats on the kerb top, the highest surface its footprint crosses (FR3)', () => {
    // Measured from City Kit (Roads): base 0.00, asphalt +0.01, kerb top +0.02.
    expect(PARKED_CAR_SEAT_HEIGHT).toBeCloseTo(0.02, 6);
  });
});

describe('clearance contracts (FR4)', () => {
  it('keeps the lane clear along every street and every leg between street tiles', () => {
    // Sampling rather than solving: the car drives tile centre to tile centre,
    // so walking each leg is what the rule actually has to survive. Collecting
    // the blocked points and asserting the list is empty reports every offender
    // at once instead of stopping at the first.
    const blocked = streetPoints()
      .filter(
        ({ point }) => overlapsObstacle(parkedObstacles, point, CAR_RADIUS) !== undefined,
      )
      .map(({ where }) => where);

    expect(blocked).toEqual([]);
  });

  it('never overlaps a spawn capsule, so the car cannot start inside a parked car', () => {
    for (const spawn of grid.spawnPoints) {
      expect(
        overlapsObstacle(parkedObstacles, spawn, CAR_RADIUS),
        `a parked car stands on the spawn at ${spawn.x},${spawn.z}`,
      ).toBeUndefined();
    }
  });

  it('never overlaps a house', () => {
    for (const prop of parked) {
      const car = footprintOf(prop);
      for (const house of grid.houses) {
        const houseBox: Footprint = {
          centre: house.position,
          ...houseFootprint(house.model, grid.tileSize, house.facing),
        };
        expect(
          boxesOverlap(car, houseBox),
          `${prop.id} overlaps ${house.id} (${house.model})`,
        ).toBe(false);
      }
    }
  });

  it('never overlaps another parked car', () => {
    for (let index = 0; index < parked.length; index += 1) {
      for (let other = index + 1; other < parked.length; other += 1) {
        const left = parked[index];
        const right = parked[other];
        if (left === undefined || right === undefined) continue;
        expect(
          boxesOverlap(footprintOf(left), footprintOf(right)),
          `${left.id} overlaps ${right.id}`,
        ).toBe(false);
      }
    }
  });

  it('never overlaps the props that were already at those kerbs', () => {
    const props = grid.props.filter((prop) => !isParkedCarKind(prop.kind));
    for (const prop of parked) {
      for (const other of props) {
        const radius = other.collisionRadius;
        if (radius === undefined) continue;
        expect(
          overlapsObstacle(
            [
              {
                id: prop.id,
                solid: false,
                shape: {
                  kind: 'box',
                  centre: prop.position,
                  halfX: prop.footprint?.halfX ?? 0,
                  halfZ: prop.footprint?.halfZ ?? 0,
                },
              },
            ],
            other.position,
            radius,
          ),
          `${prop.id} overlaps the existing ${other.id}`,
        ).toBeUndefined();
      }
    }
  });
});

describe('the four roomiest kerbs (FR10)', () => {
  /** Gap between a car's outer edge and the wall it stands against. */
  function wallGap(prop: TownProp): number {
    const tile = kerbTile(prop);
    const house = grid.houses.find(
      (candidate) => candidate.tile.x === tile.x && candidate.tile.y === tile.y,
    );
    if (house === undefined) throw new Error(`${prop.id} faces no house`);
    const wall = houseWallDistance(house.model, grid.tileSize);
    const offset = kerbOffset(prop);
    const outward = Math.max(Math.abs(offset.x), Math.abs(offset.z));
    const halfWidth = isParkedCarKind(prop.kind)
      ? parkedCarHalfExtents(prop.kind).halfWidth
      : 0;
    return wall - (outward + halfWidth);
  }

  it('keeps exactly the four largest gaps of the six kerbs the town could host', () => {
    // Measured when six cars shipped: house-1's kerb 0.038 and house-3's 0.071
    // are the two that go (lever one: four cars on the four *roomiest* kerbs),
    // and the survivors stand at these gaps. A model or map change resurfaces
    // here rather than quietly re-parking a car against a tighter wall.
    const gaps = parked.map((prop) => wallGap(prop)).sort((left, right) => left - right);
    expect(gaps).toHaveLength(4);
    expect(gaps[0]).toBeCloseTo(0.0739, 3);
    expect(gaps[1]).toBeCloseTo(0.0814, 3);
    expect(gaps[2]).toBeCloseTo(0.1194, 3);
    expect(gaps[3]).toBeCloseTo(0.1467, 3);
  });
});

describe('the fit the placement assumes', () => {
  it('binds on the widest model, so one half-width covers every parked car', () => {
    const widest = Math.max(
      ...parked.map((prop) =>
        isParkedCarKind(prop.kind) ? parkedCarHalfExtents(prop.kind).halfWidth : 0,
      ),
    );
    expect(widest).toBeCloseTo(widestParkedHalfWidth(), 6);
  });
});
