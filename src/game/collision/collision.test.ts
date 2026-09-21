import { describe, expect, it } from 'vitest';
import { createTownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import { HOUSE_LOT_FIT, PROP_COLLISION_RADIUS } from '../town/townTypes';
import {
  collectObstacles,
  depenetration,
  type Obstacle,
  overlapsObstacle,
  sweepObstacles,
} from './collision';

const grid = createTownGrid(TOWN_MAP);
const town = collectObstacles(grid);

/** A loose obstacle set for the sweep tests, at known distances. */
const CONE: Obstacle = {
  id: 'cone',
  solid: false,
  shape: { kind: 'circle', centre: { x: 2, z: 0 }, radius: 0.25 },
};
const HOUSE: Obstacle = {
  id: 'house',
  solid: true,
  shape: { kind: 'box', centre: { x: -2, z: 0 }, halfX: 0.5, halfZ: 0.5 },
};

describe('collectObstacles', () => {
  it('gives every house a box at its lot centre', () => {
    const house = town.find((obstacle) => obstacle.id === 'house-1');
    const authored = grid.houseById('house-1');

    expect(house?.shape.kind).toBe('box');
    expect(house?.shape.kind === 'box' && house.shape.centre).toEqual(authored?.position);
    // With no measurement supplied, the lot cap is the fallback; the renderer's
    // own measured footprint is what production passes (test below).
    const expectedHalf = (grid.tileSize * HOUSE_LOT_FIT) / 2;
    expect(house?.shape.kind === 'box' && house.shape.halfX).toBeCloseTo(expectedHalf);
    expect(house?.shape.kind === 'box' && house.shape.halfZ).toBeCloseTo(expectedHalf);
  });

  it('takes the mounted art footprint when the renderer supplies one', () => {
    const footprints = new Map([['house-1', { halfX: 0.34, halfZ: 0.43 }]]);
    const measured = collectObstacles(grid, footprints);
    const house = measured.find((obstacle) => obstacle.id === 'house-1');
    const unfitted = measured.find((obstacle) => obstacle.id === 'house-2');
    const cap = (grid.tileSize * HOUSE_LOT_FIT) / 2;

    // The box follows the model's own aspect, not the cap on both axes: this is
    // what stops the car short of a wall on a building's narrower side.
    expect(house?.shape.kind === 'box' && house.shape.halfX).toBeCloseTo(0.34);
    expect(house?.shape.kind === 'box' && house.shape.halfZ).toBeCloseTo(0.43);
    // A house the measurement did not cover keeps the cap, not nothing.
    expect(unfitted?.shape.kind === 'box' && unfitted.shape.halfX).toBeCloseTo(cap);
  });

  it('gives every prop the collision radius the grid already publishes', () => {
    const cone = town.find((obstacle) => obstacle.id === 'cone-1');
    const tree = town.find((obstacle) => obstacle.id === 'tree-1');

    expect(cone?.shape).toEqual({
      kind: 'circle',
      centre: grid.props.find((prop) => prop.id === 'cone-1')?.position,
      radius: PROP_COLLISION_RADIUS.cone,
    });
    expect(tree?.shape.kind === 'circle' && tree.shape.radius).toBe(
      PROP_COLLISION_RADIUS.tree,
    );
  });

  it('marks buildings solid and props crashable', () => {
    const solid = town
      .filter((obstacle) => obstacle.solid)
      .map((obstacle) => obstacle.id);
    const crashable = town
      .filter((obstacle) => !obstacle.solid)
      .map((obstacle) => obstacle.id);

    expect(solid).toEqual(grid.houses.map((house) => house.id));
    expect(crashable).toEqual(grid.props.map((prop) => prop.id));
  });

  it('leaves the roads clear, so ordinary driving never scrapes a wall', () => {
    // Every road tile centre must be a legal parking spot for a car, and the
    // driving line between neighbouring centres must be clear of everything
    // except a crashable prop (which is bumpable by design).
    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        const tile = { x, y };
        if (!grid.isRoad(tile)) {
          continue;
        }
        const centre = grid.tileToWorld(tile);
        expect(overlapsObstacle(town, centre, 0.26)).toBeUndefined();
        for (const neighbour of grid.roadNeighbours(tile)) {
          const step = grid.tileToWorld(neighbour);
          const impact = sweepObstacles(town, centre, step, 0.26);
          expect(impact?.obstacle.solid ?? false).toBe(false);
        }
      }
    }
  });
});

describe('impact normal', () => {
  it('points from the obstacle back toward the car', () => {
    const cone = sweepObstacles([CONE], { x: -1, z: 0 }, { x: 3, z: 0 }, 0.25);
    const wall = sweepObstacles([HOUSE], { x: 2, z: 0 }, { x: -3, z: 0 }, 0.26);

    // Head-on into each kind: straight back along the approach.
    expect(cone?.normal.x).toBeCloseTo(-1, 6);
    expect(cone?.normal.z).toBeCloseTo(0, 6);
    expect(wall?.normal.x).toBeCloseTo(1, 6);
    expect(wall?.normal.z).toBeCloseTo(0, 6);
  });

  it('points away from a corner, not back the way the car came', () => {
    // The inflated box is square at the corners, so a glancing approach can be
    // reported as touching while the true shape is clear. The normal has to be
    // read off the geometry, or the recoil fires the car into the wall.
    const house: Obstacle = {
      id: 'house',
      solid: true,
      shape: { kind: 'box', centre: { x: 2, z: 0 }, halfX: 0.43, halfZ: 0.43 },
    };
    const impact = sweepObstacles([house], { x: 0.5, z: 0.5 }, { x: 1.5, z: 0.5 }, 0.26);

    expect(impact).toBeDefined();
    expect(Math.hypot(impact?.normal.x ?? 0, impact?.normal.z ?? 0)).toBeCloseTo(1, 6);
    // Away from the corner at (1.57, 0.43) — the car stopped short of it in x
    // and north of it in z, so the push must be west and north.
    expect(impact?.normal.x).toBeLessThan(-0.5);
    expect(impact?.normal.z).toBeGreaterThan(0);
    const corner = { x: 2 - 0.43, z: 0.43 };
    const away = impact?.point;
    const dot =
      (impact?.normal.x ?? 0) * ((away?.x ?? 0) - corner.x) +
      (impact?.normal.z ?? 0) * ((away?.z ?? 0) - corner.z);
    expect(dot).toBeGreaterThan(0);
  });
});

describe('depenetration', () => {
  it('reports nothing for a car that is already clear of either shape', () => {
    const house: Obstacle = {
      id: 'house',
      solid: true,
      shape: { kind: 'box', centre: { x: 2, z: 0 }, halfX: 0.43, halfZ: 0.43 },
    };

    expect(
      depenetration(
        { kind: 'circle', centre: { x: 0, z: 0 }, radius: 0.25 },
        { x: 1, z: 0 },
        0.26,
      ),
    ).toBeUndefined();
    // Near the house's west face, but not touching it.
    expect(depenetration(house.shape, { x: 1.2, z: 0 }, 0.26)).toBeUndefined();
  });

  it('pushes a circle out along the line between the centres', () => {
    const fix = depenetration(
      { kind: 'circle', centre: { x: 0, z: 0 }, radius: 0.25 },
      { x: 0.4, z: 0 },
      0.26,
    );

    // Pushed away from the obstacle, i.e. further out along +x.
    expect(fix?.distance).toBeCloseTo(0.51 - 0.4, 6);
    expect(fix?.normal.x).toBeCloseTo(1, 6);
  });

  it('takes the shortest way out of a box, whichever face that is', () => {
    const house: Obstacle = {
      id: 'house',
      solid: true,
      shape: { kind: 'box', centre: { x: 2, z: 0 }, halfX: 0.43, halfZ: 0.43 },
    };
    const cases: ReadonlyArray<{
      readonly at: { x: number; z: number };
      readonly axis: string;
    }> = [
      { at: { x: 2, z: -0.35 }, axis: 'north' },
      { at: { x: 2, z: 0.35 }, axis: 'south' },
      { at: { x: 1.65, z: 0 }, axis: 'west' },
      { at: { x: 2.35, z: 0 }, axis: 'east' },
    ];

    for (const { at, axis } of cases) {
      const fix = depenetration(house.shape, at, 0.26);
      const expected =
        axis === 'north'
          ? { x: 0, z: -1 }
          : axis === 'south'
            ? { x: 0, z: 1 }
            : axis === 'west'
              ? { x: -1, z: 0 }
              : { x: 1, z: 0 };
      expect(fix?.normal).toEqual(expected);
      expect(fix?.distance).toBeGreaterThan(0.26);
    }
  });

  it('points out of a box when the contact is inside it', () => {
    // A car that has to be picked up from inside a building still needs a
    // direction to be pushed in, and the shortest way out is the only sane one.
    const house: Obstacle = {
      id: 'house',
      solid: true,
      shape: { kind: 'box', centre: { x: 2, z: 0 }, halfX: 0.43, halfZ: 0.43 },
    };
    const impact = sweepObstacles([house], { x: 2.3, z: 0 }, { x: 2.5, z: 0 }, 0.26);

    expect(impact?.time).toBe(0);
    expect(impact?.normal.x).toBeCloseTo(1, 6);
  });

  it('still gives a direction when a car sits exactly on a prop', () => {
    // Degenerate but reachable: nothing between the two centres to point along,
    // and a normal of NaN would teleport the car to nowhere.
    const fix = depenetration(
      { kind: 'circle', centre: { x: 1, z: 1 }, radius: 0.25 },
      { x: 1, z: 1 },
      0.26,
    );

    expect(fix?.normal).toEqual({ x: 1, z: 0 });
    expect(fix?.distance).toBeCloseTo(0.51, 6);
  });

  it('pushes a circle out of a box the short way', () => {
    // Deep inside, near the east face: the shortest way out is east.
    const house: Obstacle = {
      id: 'house',
      solid: true,
      shape: { kind: 'box', centre: { x: 2, z: 0 }, halfX: 0.43, halfZ: 0.43 },
    };
    const fix = depenetration(house.shape, { x: 2.3, z: 0 }, 0.26);

    expect(fix?.normal.x).toBeCloseTo(1, 6);
    expect(fix?.normal.z).toBeCloseTo(0, 6);
    // Far enough that the car's surface clears the box's face at 2.43.
    expect(fix?.distance).toBeCloseTo(2.43 - 2.3 + 0.26, 6);
  });

  it('pushes a circle that is overlapping a wall from outside back onto it', () => {
    // The ordinary case: a car whose centre is still outside the wall but whose
    // body is inside it. It has to end up just touching, not halfway through.
    const house: Obstacle = {
      id: 'house',
      solid: true,
      shape: { kind: 'box', centre: { x: 2, z: 0 }, halfX: 0.43, halfZ: 0.43 },
    };
    const fix = depenetration(house.shape, { x: 1.4, z: 0 }, 0.26);

    expect(fix?.normal.x).toBeCloseTo(-1, 6);
    expect(fix?.normal.z).toBeCloseTo(0, 6);
    expect(fix?.distance).toBeCloseTo(0.26 - (1.57 - 1.4), 6);
  });
});

describe('sweepObstacles', () => {
  it('finds nothing when the path stays clear', () => {
    expect(sweepObstacles([HOUSE], { x: 0, z: 2 }, { x: 0, z: 3 }, 0.26)).toBeUndefined();
  });

  it('stops a circle exactly where the two circles touch', () => {
    const impact = sweepObstacles([CONE], { x: -1, z: 0 }, { x: 3, z: 0 }, 0.25);

    expect(impact?.obstacle.id).toBe('cone');
    // Contact at 2 - 0.25 - 0.25 = 1.5 along a 4-unit run, less the 1mm skin
    // that keeps the car from being considered inside on the next frame.
    expect(impact?.point.x).toBeCloseTo(1.499, 3);
    expect(impact?.point.z).toBeCloseTo(0, 6);
  });

  it('stops a circle exactly at a box wall, offset by the car radius', () => {
    const impact = sweepObstacles([HOUSE], { x: 2, z: 0 }, { x: -3, z: 0 }, 0.26);

    expect(impact?.obstacle.id).toBe('house');
    // The house's east face is at -1.5, so the car's centre stops at -1.24.
    expect(impact?.point.x).toBeCloseTo(-1.239, 3);
  });

  it('picks the first thing it meets, not the nearest thing overall', () => {
    const near: Obstacle = {
      id: 'near',
      solid: false,
      shape: { kind: 'circle', centre: { x: 0.5, z: 0 }, radius: 0.1 },
    };
    const impact = sweepObstacles([CONE, near], { x: -1, z: 0 }, { x: 3, z: 0 }, 0.25);

    expect(impact?.obstacle.id).toBe('near');
  });

  it('reports an immediate impact when the path starts inside', () => {
    const impact = sweepObstacles([CONE], { x: 2, z: 0 }, { x: 3, z: 0 }, 0.25);

    expect(impact?.time).toBe(0);
    expect(impact?.point).toEqual({ x: 2, z: 0 });
  });

  it('reports an immediate impact when the path starts inside a building', () => {
    // A car that ends up inside a hitbox (dropped there by a teleport, say) has
    // to be able to get out again rather than sliding along the inside for ever.
    const impact = sweepObstacles([HOUSE], { x: -2, z: 0 }, { x: 0, z: 0 }, 0.26);

    expect(impact?.time).toBe(0);
    expect(impact?.obstacle.id).toBe('house');
  });

  it('ignores a prop that is out of frame or already behind', () => {
    // One frame of travel is far shorter than the gap to most props, so the
    // quadratic's root lands past the end of the segment; a prop the car has
    // already passed has its root behind the start.
    expect(
      sweepObstacles([CONE], { x: 0, z: 0 }, { x: 0.3, z: 0 }, 0.25),
    ).toBeUndefined();
    expect(
      sweepObstacles([CONE], { x: 3, z: 0 }, { x: 3.3, z: 0 }, 0.25),
    ).toBeUndefined();
  });

  it('ignores a wall the frame does not reach', () => {
    // One frame's travel at 1.6 u/s is well under a tile, so most frames end
    // short of the thing they are heading for.
    expect(
      sweepObstacles([HOUSE], { x: 0, z: 0 }, { x: -0.3, z: 0 }, 0.26),
    ).toBeUndefined();
    // And a wall already behind the car is behind it.
    expect(
      sweepObstacles([HOUSE], { x: 1, z: 0 }, { x: 1.3, z: 0 }, 0.26),
    ).toBeUndefined();
  });

  it('starts a box sweep outside the inflated footprint, not inside it', () => {
    // Sliding along a face that the car is already touching reports no impact:
    // the slab test's entry is behind the start.
    const beside = sweepObstacles([HOUSE], { x: -1.2, z: -1.5 }, { x: -1.2, z: 0 }, 0.26);

    expect(beside).toBeUndefined();
  });

  it('skips obstacles the caller has already dealt with', () => {
    const ignore = new Set<string>(['cone']);

    expect(
      sweepObstacles([CONE], { x: -1, z: 0 }, { x: 3, z: 0 }, 0.25, ignore),
    ).toBeUndefined();
  });

  it('answers a standstill with nothing, even inside an obstacle', () => {
    // A car that is not moving cannot run into anything; the overlap query is
    // what reports a car that is already in the wrong place.
    expect(sweepObstacles([CONE], { x: 2, z: 0 }, { x: 2, z: 0 }, 0.25)).toBeUndefined();
    expect(overlapsObstacle([CONE], { x: 2, z: 0 }, 0.25)?.id).toBe('cone');
  });
});

describe('overlapsObstacle', () => {
  it('uses the true distance to a box, not an inflated one', () => {
    // A corner of HOUSE is at (-1.5, -0.5); a circle sitting diagonally clear of
    // it by more than the radius must not count as touching, even though it is
    // inside the box's inflated footprint.
    expect(overlapsObstacle([HOUSE], { x: -1.4, z: -0.6 }, 0.1)).toBeUndefined();
  });

  it('still reports a real corner touch', () => {
    expect(overlapsObstacle([HOUSE], { x: -1.4, z: -0.6 }, 0.2)?.id).toBe('house');
  });

  it('reports a circle that is inside an obstacle', () => {
    expect(overlapsObstacle([CONE], { x: 2.1, z: 0 }, 0.25)?.id).toBe('cone');
  });
});
