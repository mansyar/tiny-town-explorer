import { describe, expect, it } from 'vitest';
import { BUILDING_MODELS } from '../assets/modelRegistry';
import { createTownGrid } from './townGrid';
import { TOWN_MAP } from './townMap';
import { BUILDING_EXTENTS, isParkedCarKind } from './townTypes';

/**
 * The authored town's own consistency (Phase 1, FR1).
 *
 * `townGrid.test.ts` already proves the map *parses* into the right tiles,
 * houses and spawn points; `parkedCarsPlacement.test.ts` proves the parked cars
 * stand clear of the lane and the walls. This file holds what those two cannot:
 * that the authored data still means what it says — every kerb a car parks
 * against belongs to a house, every prop is on a tile its kind can stand on,
 * and every prop stays inside the tile it names.
 *
 * Those last two are not hypothetical. Phase 1 nudged three props 0.45 *along*
 * their kerb to make room for a car, which is most of the way to the tile edge:
 * if a later edit tips one over, the prop would straddle two tiles and the
 * grid's own offset maths, the collision circles and the reservation would all
 * disagree about where it is.
 */

const grid = createTownGrid(TOWN_MAP);

describe('the authored map', () => {
  it('names a real house model on every lot, using all eight kit types', () => {
    // The ten lots draw on eight models deliberately (two types repeat), which
    // is what keeps the town from reading as one house stamped ten times.
    for (const house of grid.houses) {
      expect(BUILDING_MODELS[house.model], `${house.id}'s model`).toBeDefined();
    }
    expect(new Set(grid.houses.map((house) => house.model))).toEqual(
      new Set(Object.keys(BUILDING_EXTENTS)),
    );
  });

  it('parks every car against a kerb that belongs to a house', () => {
    // A car is authored on the *street*, offset toward the kerb it sits
    // against. That kerb must be a house's lot: a car parked against a park
    // tile would have no wall behind it, so `houseWallDistance` would have
    // nothing to measure and the clearance contract would be vacuous.
    for (const prop of grid.props.filter((car) => isParkedCarKind(car.kind))) {
      const centre = grid.tileToWorld(prop.tile);
      const offset = { x: prop.position.x - centre.x, z: prop.position.z - centre.z };
      const step =
        Math.abs(offset.x) >= Math.abs(offset.z)
          ? { x: Math.sign(offset.x), y: 0 }
          : { x: 0, y: Math.sign(offset.z) };
      const kerbTile = { x: prop.tile.x + step.x, y: prop.tile.y + step.y };

      expect(grid.tileAt(kerbTile), `${prop.id}'s kerb tile is a lot`).toBe('lot');
      expect(
        grid.houses.some(
          (house) => house.tile.x === kerbTile.x && house.tile.y === kerbTile.y,
        ),
        `${prop.id} parks against a lot with no house on it`,
      ).toBe(true);
    }
  });

  it('stands every prop on a tile its kind can occupy', () => {
    for (const prop of grid.props) {
      const tile = grid.tileAt(prop.tile);
      if (isParkedCarKind(prop.kind)) {
        // A parked car is the only prop authored on the driving surface.
        expect(tile, `${prop.id} parks on a street tile`).toBe('road');
      } else {
        expect(tile, `${prop.id} stands off the road`).not.toBe('road');
      }
    }
  });

  it('keeps every prop inside the tile it names', () => {
    for (const prop of grid.props) {
      const centre = grid.tileToWorld(prop.tile);
      const offset = { x: prop.position.x - centre.x, z: prop.position.z - centre.z };
      expect(Math.abs(offset.x), `${prop.id} stays within its tile in x`).toBeLessThan(
        TOWN_MAP.tileSize / 2,
      );
      expect(Math.abs(offset.z), `${prop.id} stays within its tile in z`).toBeLessThan(
        TOWN_MAP.tileSize / 2,
      );
    }
  });

  it('names a street a parked car can lie along, with its kerb as the facing', () => {
    // The yaw's job (FR3): the car lies *along* the street the offset runs
    // across, so the two axes are complementary. A car whose yaw matched its
    // offset would be parked nose-first into the kerb — which is what the
    // footprint swap in `parkedCarFootprint` would then box wrongly.
    for (const prop of grid.props.filter((car) => isParkedCarKind(car.kind))) {
      const centre = grid.tileToWorld(prop.tile);
      const offset = { x: prop.position.x - centre.x, z: prop.position.z - centre.z };
      // A kerb west or east of the tile means the street runs north-south, so
      // the car's length must run along z: a yaw of 0 or pi, where `sin` is 0.
      const kerbIsHorizontal = Math.abs(offset.x) >= Math.abs(offset.z);
      const lengthAlongX = Math.abs(Math.sin(prop.yaw ?? 0)) > 0.5;
      expect(lengthAlongX, `${prop.id} lies along its street`).toBe(!kerbIsHorizontal);
      expect(prop.yaw ?? 0).toBeGreaterThanOrEqual(0);
      expect(prop.yaw ?? 0).toBeLessThan(Math.PI * 2);
    }
  });

  it('lands every spawn point on a distinct street tile', () => {
    const asKeys = TOWN_MAP.spawnPoints.map((point) => `${point.x},${point.y}`);
    expect(new Set(asKeys).size).toBe(asKeys.length);
    for (const point of TOWN_MAP.spawnPoints) {
      expect(grid.isRoad(point), `spawn ${point.x},${point.y} is on a street`).toBe(true);
    }
  });

  it('keeps the ring road on the outer rows and the cross street at x3', () => {
    // Row strings run north (top) first, so a transposed string would move the
    // park tiles into the west column and re-point every kerb the placement
    // rules measure against.
    expect(TOWN_MAP.rows).toHaveLength(10);
    for (const coord of [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 5 },
      { x: 5, y: 5 },
      { x: 3, y: 0 },
      { x: 3, y: 5 },
      { x: 0, y: 3 },
      { x: 5, y: 3 },
      { x: 3, y: 1 },
      { x: 3, y: 4 },
    ]) {
      expect(grid.tileAt(coord), `${coord.x},${coord.y} is ring or cross street`).toBe(
        'road',
      );
    }
    expect(grid.tileAt({ x: 1, y: 1 })).toBe('park');
    expect(grid.tileAt({ x: 2, y: 1 })).toBe('park');
    expect(grid.tileAt({ x: 1, y: 2 })).toBe('lot');
    expect(grid.tileAt({ x: 4, y: 4 })).toBe('lot');
  });
});
