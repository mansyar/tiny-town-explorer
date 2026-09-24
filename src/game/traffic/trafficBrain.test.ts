import { describe, expect, it, vi } from 'vitest';
import { nearestRoadTile, type Path, roadRoute } from '../path/pathfinder';
import { createTownGrid, type TownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import {
  isParkedCarKind,
  PARKED_CAR_KERB_OFFSET,
  parkedCarHalfExtents,
  type TileCoord,
  type Vec2,
  widestParkedHalfWidth,
} from '../town/townTypes';
import {
  createTrafficBrain,
  TRAFFIC_LATERAL_BIAS,
  type TrafficBrain,
} from './trafficBrain';

/**
 * The wandering brain decides where a mover goes next — endlessly, from a
 * seeded draw over the road graph — and holds its lane while it gets there.
 * Deterministic by construction: the only randomness is the injected RNG, so
 * the same seed wanders the same way.
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

/**
 * The left normal of a leg's canonical axis — the same side whichever way the
 * leg is walked, so a pair of cars can hold opposite lanes through a head-on.
 */
function legNormal(from: TileCoord, to: TileCoord): Vec2 {
  let dx = to.x - from.x;
  let dz = to.y - from.y;
  if (dx < 0 || (dx === 0 && dz < 0)) {
    dx = -dx;
    dz = -dz;
  }
  const length = Math.hypot(dx, dz);
  return { x: -dz / length, z: dx / length };
}

/** The lane point a car of the given side holds at a tile on one leg. */
function lanePoint(tile: TileCoord, normal: Vec2, side: 1 | -1): Vec2 {
  const at = centre(tile);
  return {
    x: at.x + side * TRAFFIC_LATERAL_BIAS * normal.x,
    z: at.z + side * TRAFFIC_LATERAL_BIAS * normal.z,
  };
}

/** Perpendicular reach of a point off a leg line through `tile`. */
function acrossFrom(point: Vec2, tile: TileCoord, normal: Vec2): number {
  const at = centre(tile);
  return Math.abs((point.x - at.x) * normal.x + (point.z - at.z) * normal.z);
}

/** Every straight road tile of a town with its axis normal. */
function straightsOf(town: TownGrid): { tile: TileCoord; normal: Vec2 }[] {
  const found: { tile: TileCoord; normal: Vec2 }[] = [];
  for (let y = 0; y < town.size; y++) {
    for (let x = 0; x < town.size; x++) {
      const tile = { x, y };
      if (!town.isRoad(tile)) {
        continue;
      }
      const neighbours = town.roadNeighbours(tile);
      const [first, second] = neighbours;
      if (
        neighbours.length !== 2 ||
        first === undefined ||
        second === undefined ||
        first.x + second.x !== 2 * x ||
        first.y + second.y !== 2 * y
      ) {
        continue;
      }
      found.push({ tile, normal: legNormal(first, tile) });
    }
  }
  return found;
}

type Box = { x: number; z: number; halfX: number; halfZ: number };

function boxAt(point: Vec2, alongX: boolean, halfLength: number, halfWidth: number): Box {
  return {
    x: point.x,
    z: point.z,
    halfX: alongX ? halfLength : halfWidth,
    halfZ: alongX ? halfWidth : halfLength,
  };
}

/** The separation between two boxes along their wider gap (negative = overlap). */
function gapAcross(a: Box, b: Box): number {
  return Math.max(
    Math.abs(a.x - b.x) - (a.halfX + b.halfX),
    Math.abs(a.z - b.z) - (a.halfZ + b.halfZ),
  );
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
): { targets: Vec2[]; waypoints: Vec2[][] } {
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

  it('hands over one lane point per road tile on the way', () => {
    const twoTile = createTownGrid({
      ...TOWN_MAP,
      rows: [
        '..........',
        '..##......',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
      ],
    });
    const from = { x: 2, y: 1 };
    const to = { x: 3, y: 1 };
    const normal = legNormal(from, to);
    const path = leg(
      createTrafficBrain({ grid: twoTile, random: seeded(3), side: 1 }),
      centre(from),
    );

    const tiles = roadRoute(twoTile, from, to);
    if (tiles === undefined) {
      throw new Error('expected a route over the road graph');
    }
    expect(path.waypoints).toHaveLength(tiles.length);
    expect(path.waypoints).toEqual([
      lanePoint(from, normal, 1),
      lanePoint(to, normal, 1),
    ]);
  });

  it('aims exactly at the destination tile’s lane point', () => {
    const twoTile = createTownGrid({
      ...TOWN_MAP,
      rows: [
        '..........',
        '..##......',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
      ],
    });
    const from = { x: 2, y: 1 };
    const to = { x: 3, y: 1 };
    const normal = legNormal(from, to);
    const path = leg(
      createTrafficBrain({ grid: twoTile, random: seeded(11), side: 1 }),
      centre(from),
    );

    expect(path.destination).toEqual(lanePoint(to, normal, 1));
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
      const tile = tiles[i];
      const before = tiles[i - 1];
      if (tile === undefined || before === undefined) {
        continue;
      }
      expect(tile).not.toEqual(before);
    }
  });

  it('drives the identical target sequence for the same seed', () => {
    const first = wander(createTrafficBrain({ grid, random: seeded(7) }), 15);
    const second = wander(createTrafficBrain({ grid, random: seeded(7) }), 15);

    expect(first.targets).toEqual(second.targets);
    expect(first.waypoints).toEqual(second.waypoints);
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

    for (const path of waypoints) {
      for (const point of path) {
        expect(grid.isRoad(grid.worldToTile(point))).toBe(true);
      }
    }
  });

  it('starts a leg wherever the car stands — even off-road after a bonk', () => {
    const brain = createTrafficBrain({ grid, random: seeded(4) });
    const lawn = {
      x: centre({ x: 2, y: 2 }).x + 0.3,
      z: centre({ x: 2, y: 2 }).z + 0.3,
    };

    const path = leg(brain, lawn);
    const snapped = nearestRoadTile(grid, lawn);
    if (snapped === undefined) {
      throw new Error('expected a road to snap to');
    }
    const first = path.waypoints[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      return;
    }
    expect(grid.worldToTile(first)).toEqual(snapped);
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

describe('lane discipline and the pass-clearance contract (FR3)', () => {
  it('gives the authored pair opposite sides of the same street', () => {
    const twoTile = createTownGrid({
      ...TOWN_MAP,
      rows: [
        '..........',
        '..##......',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
      ],
    });
    const from = { x: 2, y: 1 };
    const normal = legNormal(from, { x: 3, y: 1 });
    const plus = leg(
      createTrafficBrain({ grid: twoTile, random: seeded(1), side: 1 }),
      centre(from),
    );
    const minus = leg(
      createTrafficBrain({ grid: twoTile, random: seeded(1), side: -1 }),
      centre(from),
    );

    expect(plus.waypoints).toHaveLength(2);
    expect(minus.waypoints).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const a = plus.waypoints[i];
      const b = minus.waypoints[i];
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(a.x - b.x).toBeCloseTo(2 * TRAFFIC_LATERAL_BIAS * normal.x);
      expect(a.z - b.z).toBeCloseTo(2 * TRAFFIC_LATERAL_BIAS * normal.z);
    }
  });

  it('holds the bias perpendicular to every leg it walks', () => {
    const brain = createTrafficBrain({ grid, random: seeded(13), side: 1 });
    let at = centre(start);
    for (let session = 0; session < 10; session++) {
      const path = leg(brain, at);
      for (let i = 0; i + 1 < path.waypoints.length; i++) {
        const fromPoint = path.waypoints[i];
        const toPoint = path.waypoints[i + 1];
        if (fromPoint === undefined || toPoint === undefined) {
          continue;
        }
        const from = grid.worldToTile(fromPoint);
        const to = grid.worldToTile(toPoint);
        const normal = legNormal(from, to);
        expect(acrossFrom(fromPoint, from, normal)).toBeCloseTo(TRAFFIC_LATERAL_BIAS);
        expect(acrossFrom(toPoint, to, normal)).toBeCloseTo(TRAFFIC_LATERAL_BIAS);
      }
      at = path.destination;
    }
  });

  /**
   * The approved squash figures (spec FR2; tech-stack's lane-narrowing note):
   * a straight pass between the authored pair (sedan × hatchback) overlaps by
   * ≈0.015, the widest pair by no more than ≈0.052 — accepted comedy. Pinned
   * as measured literals so the lanes can never drift wider (into the parked
   * strip) or looser (into a mystery gap); never re-derived from the bias.
   */
  const AuthoredPairSquash = 0.015;
  const WidestPairSquash = 0.052;

  it('squashes past head-on within the accepted band on every straight', () => {
    const sedan = parkedCarHalfExtents('parkedSedan');
    const hatchback = parkedCarHalfExtents('parkedHatchback');
    const straights = straightsOf(grid);
    expect(straights.length).toBeGreaterThan(0);

    for (const { tile, normal } of straights) {
      const alongX = Math.abs(normal.z) > 0.5;
      const one = boxAt(
        lanePoint(tile, normal, 1),
        alongX,
        sedan.halfLength,
        sedan.halfWidth,
      );
      const other = boxAt(
        lanePoint(tile, normal, -1),
        alongX,
        hatchback.halfLength,
        hatchback.halfWidth,
      );
      expect(-gapAcross(one, other)).toBeCloseTo(AuthoredPairSquash, 3);
    }
  });

  it('squashes past a same-direction overtake within the same band', () => {
    const sedan = parkedCarHalfExtents('parkedSedan');
    const hatchback = parkedCarHalfExtents('parkedHatchback');

    for (const { tile, normal } of straightsOf(grid)) {
      const alongX = Math.abs(normal.z) > 0.5;
      const one = boxAt(
        lanePoint(tile, normal, 1),
        alongX,
        sedan.halfLength,
        sedan.halfWidth,
      );
      const other = boxAt(
        lanePoint(tile, normal, -1),
        alongX,
        hatchback.halfLength,
        hatchback.halfWidth,
      );
      for (const stagger of [0, 0.25, 0.5]) {
        const passing: Box = {
          ...one,
          x: one.x + (alongX ? stagger : 0),
          z: one.z + (alongX ? 0 : stagger),
        };
        // While the pair is longitudinally engaged the gap is exactly the
        // band — the same pin as head-on, never a looser mystery gap (FR2).
        expect(-gapAcross(passing, other)).toBeCloseTo(AuthoredPairSquash, 3);
      }
    }
  });

  it('derives the bias from the parked strip near edge, rounded down', () => {
    const widest = widestParkedHalfWidth();
    const nearEdge = PARKED_CAR_KERB_OFFSET - widest;
    const maxBias = nearEdge - widest;
    // Rounded DOWN (0.136470... -> 0.136) so rounding can never reintroduce
    // the clip; the widest pair then squashes at most 0.0516 (FR2's band).
    expect(TRAFFIC_LATERAL_BIAS).toBe(Math.floor(maxBias * 1000) / 1000);
    expect(TRAFFIC_LATERAL_BIAS + widest).toBeLessThanOrEqual(nearEdge + 0.0005);
    expect(2 * widest - 2 * TRAFFIC_LATERAL_BIAS).toBeLessThanOrEqual(WidestPairSquash);
  });

  it('on curves the bias follows the tangent, with no corner jog', () => {
    const bend = createTownGrid({
      ...TOWN_MAP,
      rows: [
        '..........',
        '..#.......',
        '..##......',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
      ],
    });
    const path = leg(
      createTrafficBrain({ grid: bend, random: () => 0.99, side: 1 }),
      centre({ x: 2, y: 1 }),
    );

    expect(path.waypoints).toHaveLength(3);
    const corner = path.waypoints[1];
    if (corner === undefined) {
      throw new Error('expected a corner waypoint');
    }
    const inNormal = legNormal({ x: 2, y: 1 }, { x: 2, y: 2 });
    const outNormal = legNormal({ x: 2, y: 2 }, { x: 3, y: 2 });
    expect(acrossFrom(corner, { x: 2, y: 2 }, inNormal)).toBeCloseTo(
      TRAFFIC_LATERAL_BIAS,
    );
    expect(acrossFrom(corner, { x: 2, y: 2 }, outNormal)).toBeCloseTo(
      TRAFFIC_LATERAL_BIAS,
    );
  });
});

/**
 * The parking-strip clearance contract (AC1): a mover's swept footprint never
 * reaches past the parked-cars strip's near edge — the widest parked car at its
 * authored kerb seat (0.46 out). Today's reach (bias 0.177 + widest 0.1618 =
 * 0.3388) edges 0.041 past it on same-side passes, clipping a parked car's
 * body; these tests are that defect, red until the lanes narrow to 0.136.
 */
describe('the parking-strip clearance contract (AC1)', () => {
  /** Float tolerance for the measured contract, never a licence to clip. */
  const ClearanceEpsilon = 0.0005;

  /** Where the parked-cars strip begins, measured from a street's centre line. */
  function parkedNearEdge(): number {
    return PARKED_CAR_KERB_OFFSET - widestParkedHalfWidth();
  }

  it('re-derives the strip near edge and widest half-width from the fit data', () => {
    expect(widestParkedHalfWidth()).toBeCloseTo(0.1618, 3);
    expect(parkedNearEdge()).toBeCloseTo(0.2982, 3);
  });

  it('never sweeps past the parked strip on any straight, either lane', () => {
    const widest = widestParkedHalfWidth();
    const straights = straightsOf(grid);
    expect(straights.length).toBeGreaterThan(0);

    for (const { tile, normal } of straights) {
      for (const side of [1, -1] as const) {
        const reach = acrossFrom(lanePoint(tile, normal, side), tile, normal) + widest;
        expect(reach).toBeLessThanOrEqual(parkedNearEdge() + ClearanceEpsilon);
      }
    }
  });

  it('never clips a car standing in its authored kerb seat — every seat, both lanes', () => {
    const seats = grid.props.filter((prop) => isParkedCarKind(prop.kind));
    expect(seats.length).toBeGreaterThan(0);

    for (const seat of seats) {
      const footprint = seat.footprint;
      if (footprint === undefined) {
        throw new Error('expected a parked footprint');
      }
      const centre = grid.tileToWorld(seat.tile);
      const offset = { x: seat.position.x - centre.x, z: seat.position.z - centre.z };
      const length = Math.hypot(offset.x, offset.z);
      const normal = { x: offset.x / length, z: offset.z / length };
      const alongX = Math.abs(normal.z) > 0.5;
      const parked: Box = {
        x: seat.position.x,
        z: seat.position.z,
        halfX: footprint.halfX,
        halfZ: footprint.halfZ,
      };

      for (const side of [1, -1] as const) {
        for (const kind of ['parkedSedan', 'parkedHatchback'] as const) {
          const mover = parkedCarHalfExtents(kind);
          const at = {
            x: centre.x + side * TRAFFIC_LATERAL_BIAS * normal.x,
            z: centre.z + side * TRAFFIC_LATERAL_BIAS * normal.z,
          };
          const box = boxAt(at, alongX, mover.halfLength, mover.halfWidth);
          expect(gapAcross(box, parked)).toBeGreaterThanOrEqual(-ClearanceEpsilon);
        }
      }
    }
  });

  it('holds the reach inside the strip at every pose it actually drives, corners included', () => {
    const widest = widestParkedHalfWidth();
    for (const seed of [3, 7, 21]) {
      const brain = createTrafficBrain({ grid, random: seeded(seed), side: 1 });
      const { waypoints } = wander(brain, 24);
      for (const path of waypoints) {
        for (let i = 0; i + 1 < path.length; i++) {
          const fromPoint = path[i];
          const toPoint = path[i + 1];
          if (fromPoint === undefined || toPoint === undefined) {
            continue;
          }
          const from = grid.worldToTile(fromPoint);
          const to = grid.worldToTile(toPoint);
          const normal = legNormal(from, to);
          expect(acrossFrom(fromPoint, from, normal) + widest).toBeLessThanOrEqual(
            parkedNearEdge() + ClearanceEpsilon,
          );
          expect(acrossFrom(toPoint, to, normal) + widest).toBeLessThanOrEqual(
            parkedNearEdge() + ClearanceEpsilon,
          );
        }
      }
    }
  });
});
