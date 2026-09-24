import { describe, expect, it } from 'vitest';
import { type Obstacle, overlapsObstacle } from '../collision/collision';
import { declaredKerbs } from '../mission/kerbReservation';
import { spawnParkLitter } from '../mission/parkLitter';
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
  PARKED_CAR_KERB_OFFSET,
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

/** A tiny deterministic random, so the litter draw replays per seed. */
function seededRandom(seed: number): () => number {
  let state = (seed * 16807) % 2147483647;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
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

describe('six cars, three per ring (FR8)', () => {
  /** The junction tile splits the figure-eight into its two loops. */
  const Junction = { x: 5, y: 5 };
  const ringOf = (tile: { x: number; y: number }): 'old' | 'new' =>
    tile.x <= Junction.x && tile.y <= Junction.y ? 'old' : 'new';

  /** Kerb quality, car-independent: room left beyond the widest fitted car. */
  function eligibleKerbs(): { tile: { x: number; y: number }; room: number }[] {
    // A kerb a mission has declared — the puppy's hides and the park slots —
    // stays out of the lineup: the reservation owns it (FR8).
    const declared = new Set(
      declaredKerbs(grid).map(
        (entry) => `${entry.edge.road.x},${entry.edge.road.y}:${entry.edge.toward}`,
      ),
    );
    const kerbs: { tile: { x: number; y: number }; room: number }[] = [];
    for (const house of grid.houses) {
      // The house's own kerb: the street its door faces (the measured wall).
      const step = DIRECTION_STEPS[house.facing];
      const tile = { x: house.tile.x + step.x, y: house.tile.y + step.y };
      if (!grid.isRoad(tile) || grid.roadShape(tile) !== 'straight') continue;
      const towards = Object.entries(DIRECTION_STEPS).find(
        ([, back]) =>
          tile.x + back.x === house.tile.x && tile.y + back.y === house.tile.y,
      )?.[0];
      if (towards === undefined || declared.has(`${tile.x},${tile.y}:${towards}`))
        continue;
      const room =
        houseWallDistance(house.model, grid.tileSize) -
        (PARKED_CAR_KERB_OFFSET + widestParkedHalfWidth());
      if (room < KERB_CLEARANCE) continue;
      kerbs.push({ tile, room });
    }
    return kerbs;
  }

  it('stands three cars on each ring’s three roomiest measured kerbs', () => {
    // Measured, not remembered: the lineup must be each loop's three best
    // straight-segment kerbs, so a model or map change resurfaces here rather
    // than quietly re-parking a car against a tighter wall.
    expect(parked).toHaveLength(6);
    for (const ring of ['old', 'new'] as const) {
      const cars = parked.filter((prop) => ringOf(prop.tile) === ring);
      expect(cars, `${ring} ring car count`).toHaveLength(3);
      const best = eligibleKerbs()
        .filter((kerb) => ringOf(kerb.tile) === ring)
        .sort((left, right) => right.room - left.room)
        .slice(0, 3)
        .map((kerb) => `${kerb.tile.x},${kerb.tile.y}`)
        .sort();
      const stood = cars.map((prop) => `${prop.tile.x},${prop.tile.y}`).sort();
      expect(stood, `${ring} ring lineup`).toEqual(best);
    }
  });

  it('leaves the two tightest historic kerbs to the litter draw', () => {
    // house-1's 0.038 and house-3's 0.071 wall gaps stayed out of the lineup
    // when the kerb lever was first spent; they must never quietly return.
    const stood = parked.map((prop) => `${prop.tile.x},${prop.tile.y}`);
    expect(stood).not.toContain('0,2');
    expect(stood).not.toContain('0,3');
  });

  it('never lets the litter draw stand a piece inside a parked car', () => {
    // FR8's town-wide reservation: a parked car's kerb is taken, so across
    // many seeds no park piece may ever share a footprint with a car — on
    // either ring.
    for (let seed = 1; seed <= 40; seed += 1) {
      const pieces = spawnParkLitter({ grid, random: seededRandom(seed) });
      for (const piece of pieces) {
        for (const car of parked) {
          expect(
            boxesOverlap(
              { centre: piece.position, halfX: 0.01, halfZ: 0.01 },
              footprintOf(car),
            ),
            `seed ${seed}: ${piece.id} beside ${car.id}`,
          ).toBe(false);
        }
      }
    }
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
