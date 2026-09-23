import { describe, expect, it, vi } from 'vitest';
import { nearestRoadTile, type Path, roadRoute } from '../path/pathfinder';
import { createTownGrid, type TownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import type { TileCoord, Vec2 } from '../town/townTypes';
import { createTrafficBrain, type TrafficBrain } from './trafficBrain';

/**
 * The wandering brain decides where a mover goes next — endlessly, from a
 * seeded draw over the road graph. Deterministic by construction: the only
 * randomness is the injected RNG, so the same seed wanders the same way.
 */

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grid = createTownGrid(TOWN_MAP);
const start: TileCoord = { x: 0, y: 0 };

function centre(tile: TileCoord): Vec2 {
  return grid.tileToWorld(tile);
}

function roadTiles(town: TownGrid): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let y = 0; y < town.size; y++) {
    for (let x = 0; x < town.size; x++) {
      if (town.isRoad({ x, y })) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

/** One hand-over that a mover can actually drive. */
function leg(brain: TrafficBrain, from: Vec2): Path {
  const path = brain.take(from);
  if (path === undefined) {
    throw new Error('expected a leg to drive');
  }
  return path;
}

/**
 * A scripted session: drive a leg, arrive exactly where it points, repeat —
 * the rhythm the traffic system runs (retarget on arrival).
 */
function wander(
  brain: TrafficBrain,
  legs: number,
  from: Vec2 = centre(start),
): {
  targets: Vec2[];
  waypoints: Vec2[][];
} {
  const targets: Vec2[] = [];
  const waypoints: Vec2[][] = [];
  let at = from;
  for (let i = 0; i < legs; i++) {
    const path = leg(brain, at);
    targets.push(path.destination);
    waypoints.push([...path.waypoints]);
    at = path.destination;
  }
  return { targets, waypoints };
}

describe('a wandering brain hands out endless seeded routes (FR2)', () => {
  it('targets some other road tile from wherever it starts', () => {
    const brain = createTrafficBrain({ grid, random: seeded(3) });
    const path = leg(brain, centre(start));

    const target = grid.worldToTile(path.destination);
    expect(target).not.toEqual(start);
    expect(grid.isRoad(target)).toBe(true);
  });

  it('hands over the road tile centres as waypoints', () => {
    const brain = createTrafficBrain({ grid, random: seeded(3) });
    const path = leg(brain, centre(start));

    const target = grid.worldToTile(path.destination);
    const tiles = roadRoute(grid, start, target);
    if (tiles === undefined) {
      throw new Error('expected a route over the road graph');
    }
    expect(path.waypoints).toEqual(tiles.map((tile) => grid.tileToWorld(tile)));
  });

  it('aims exactly at the destination tile centre', () => {
    const brain = createTrafficBrain({ grid, random: seeded(11) });
    const path = leg(brain, centre(start));

    const target = grid.worldToTile(path.destination);
    expect(path.destination).toEqual(centre(target));
  });

  it('picks a fresh destination the moment one is reached — never stationary across a session', () => {
    const brain = createTrafficBrain({ grid, random: seeded(5) });
    const { targets } = wander(brain, 20);

    expect(targets).toHaveLength(20);
    for (const target of targets) {
      expect(grid.isRoad(grid.worldToTile(target))).toBe(true);
    }
  });

  it('never turns straight back onto the tile it just reached', () => {
    const brain = createTrafficBrain({ grid, random: seeded(9) });
    const { targets } = wander(brain, 30);
    const tiles = targets.map((target) => grid.worldToTile(target));

    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i]).not.toEqual(tiles[i - 1]);
    }
  });

  it('drives the identical target sequence for the same seed', () => {
    const first = wander(createTrafficBrain({ grid, random: seeded(7) }), 15);
    const second = wander(createTrafficBrain({ grid, random: seeded(7) }), 15);

    expect(first.targets).toEqual(second.targets);
  });

  it('wanders a different way under a different seed', () => {
    const first = wander(createTrafficBrain({ grid, random: seeded(7) }), 15);
    const second = wander(createTrafficBrain({ grid, random: seeded(8) }), 15);

    expect(first.targets).not.toEqual(second.targets);
  });

  it('rolls the injected die exactly once per leg and never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const inner = seeded(5);
    let rolls = 0;
    const brain = createTrafficBrain({
      grid,
      random: () => {
        rolls += 1;
        return inner();
      },
    });

    wander(brain, 10);
    expect(rolls).toBe(10);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keeps every waypoint on a road tile', () => {
    const brain = createTrafficBrain({ grid, random: seeded(21) });
    const { waypoints } = wander(brain, 10);

    const centres = new Set(roadTiles(grid).map((tile) => JSON.stringify(centre(tile))));
    for (const path of waypoints) {
      for (const point of path) {
        expect(centres.has(JSON.stringify(point))).toBe(true);
      }
    }
  });

  it('starts a leg wherever the car stands — even off-road after a bonk', () => {
    const brain = createTrafficBrain({ grid, random: seeded(4) });
    const lawn = { x: centre({ x: 2, y: 2 }).x + 0.3, z: centre({ x: 2, y: 2 }).z + 0.3 };

    const path = leg(brain, lawn);
    const snapped = nearestRoadTile(grid, lawn);
    if (snapped === undefined) {
      throw new Error('expected a road to snap to');
    }
    expect(path.waypoints[0]).toEqual(centre(snapped));
  });

  it('hands back nothing only when there is nowhere to wander', () => {
    const noRoads = createTownGrid({
      ...TOWN_MAP,
      rows: ['......', '......', '......', '......', '......', '......'],
    });
    const loneTile = createTownGrid({
      ...TOWN_MAP,
      rows: ['......', '......', '..#...', '......', '......', '......'],
    });

    expect(
      createTrafficBrain({ grid: noRoads, random: seeded(1) }).take(centre(start)),
    ).toBeUndefined();
    expect(
      createTrafficBrain({ grid: loneTile, random: seeded(1) }).take(
        centre({ x: 2, y: 2 }),
      ),
    ).toBeUndefined();
  });
});
