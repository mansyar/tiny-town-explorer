import type { Obstacle } from '../collision/collision';
import type { TownGrid } from '../town/townGrid';
import { parkedCarHalfExtents, type TileCoord } from '../town/townTypes';
import { createVehicleMotor } from '../vehicle/vehicleMotor';
import { createTrafficBrain, type TrafficBrain } from './trafficBrain';

/**
 * Light wandering traffic: two ambient cars that make the town feel alive.
 *
 * The system owns both wanderers outright — their motors, their brains, their
 * lanes — and says exactly two things: `update` to tick them, `footprints` to
 * publish where they stand. No camera target, no engine voice, no tap handler
 * (product.md: the hero car is the only character the child drives). A mover
 * is not a mission; it is the town's natural reason for a car to ever move.
 *
 * Deterministic on purpose: `seed` decides the whole wander — starts, routes,
 * the lot — so one launch replays exactly like the next.
 */

type MoverKind = Parameters<typeof parkedCarHalfExtents>[0];

interface MoverSpec {
  /** Stable identity, published on every footprint. */
  readonly id: string;
  /** Which civilian model's fitted box this mover occupies. */
  readonly kind: MoverKind;
  /** Which side of the street to hold; the pair takes opposite sides (FR3). */
  readonly side: 1 | -1;
  /** Cruise pace in world units per second — slower than the kid's 1.6. */
  readonly speed: number;
}

const MOVERS: readonly MoverSpec[] = [
  { id: 'traffic-0', kind: 'parkedSedan', side: 1, speed: 0.8 },
  { id: 'traffic-1', kind: 'parkedHatchback', side: -1, speed: 1.0 },
];

export interface TrafficSystemOptions {
  /** The road network to wander. */
  readonly grid: TownGrid;
  /** Decides starts and every route; the same seed replays the same town. */
  readonly seed: number;
  /** The town's static hitboxes, shared with the kid's own motor. */
  readonly obstacles?: readonly Obstacle[];
}

export interface TrafficSystem {
  /** Advance both wanderers one frame. */
  update(deltaSeconds: number): void;
  /**
   * Both live boxes under their stable ids — crashable like every other car
   * in the town (FR4), for the kid's and each other's sweeps (FR5).
   */
  footprints(): readonly Obstacle[];
}

interface Carriage {
  readonly spec: MoverSpec;
  readonly motor: ReturnType<typeof createVehicleMotor>;
  readonly brain: TrafficBrain;
  readonly extents: ReturnType<typeof parkedCarHalfExtents>;
}

export function createTrafficSystem(options: TrafficSystemOptions): TrafficSystem {
  const { grid, seed } = options;
  const statics = options.obstacles ?? [];
  const tiles = roadTiles(grid);
  const [first, second] = pickStarts(seeded(seed), tiles.length);
  const starts: readonly [number, number] = [first, second];

  let carriages: Carriage[] = [];

  const footprints = (): readonly Obstacle[] => carriages.map(footprintOf);

  carriages = MOVERS.map((spec, index) =>
    buildCarriage({
      grid,
      spec,
      start: tiles[starts[index] ?? 0] ?? { x: 0, y: 0 },
      statics,
      random: seeded(seed * 2 + index),
      others: () => carriages.filter((_, i) => i !== index).map(footprintOf),
    }),
  );

  return {
    footprints,

    update(deltaSeconds) {
      for (const carriage of carriages) {
        drive(carriage, deltaSeconds);
      }
    },
  };
}

function buildCarriage(options: {
  grid: TownGrid;
  spec: MoverSpec;
  start: TileCoord;
  statics: readonly Obstacle[];
  random: () => number;
  others: () => readonly Obstacle[];
}): Carriage {
  const extents = parkedCarHalfExtents(options.spec.kind);
  const brain = createTrafficBrain({
    grid: options.grid,
    random: options.random,
    side: options.spec.side,
  });
  const motor = createVehicleMotor({
    position: options.grid.tileToWorld(options.start),
    obstacles: options.statics,
    // The sweep radius is the car's own fitted half-width: capsule-vs-box
    // sweeps then honour TRAFFIC_PASS_CLEARANCE exactly, not just the boxes.
    radius: extents.halfWidth,
    speed: options.spec.speed,
    dynamicObstacles: options.others,
  });
  return { spec: options.spec, motor, brain, extents };
}

function drive(carriage: Carriage, deltaSeconds: number): void {
  const { motor, brain } = carriage;
  // The brain hands over the next leg the moment the last one is done, so a
  // wanderer is never stationary across a session.
  if (!motor.isDriving()) {
    const path = brain.take(motor.position);
    if (path !== undefined) {
      motor.setPath(path);
    }
  }
  motor.update(deltaSeconds);
}

/**
 * The mover's live box: the fitted footprint axis-aligned to its heading (the
 * tightest world-axis box around the body), never a wall (FR4).
 */
function footprintOf(carriage: Carriage): Obstacle {
  const { motor, spec, extents } = carriage;
  const facingX = Math.sin(motor.heading());
  const facingZ = Math.cos(motor.heading());
  return {
    id: spec.id,
    solid: false,
    shape: {
      kind: 'box',
      centre: { x: motor.position.x, z: motor.position.z },
      halfX:
        Math.abs(facingX) * extents.halfLength + Math.abs(facingZ) * extents.halfWidth,
      halfZ:
        Math.abs(facingZ) * extents.halfLength + Math.abs(facingX) * extents.halfWidth,
    },
  };
}

/** Every road tile centre in row-major order. */
function roadTiles(grid: TownGrid): readonly TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (grid.isRoad({ x, y })) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

/** Two draws, two distinct tiles — the pair never starts stacked. */
function pickStarts(random: () => number, count: number): [number, number] {
  const first = Math.floor(random() * count);
  const second = Math.floor(random() * Math.max(count - 1, 1));
  return [first, second >= first ? second + 1 : second];
}

/** A tiny seeded die (mulberry32) — the whole town's randomness rests here. */
function seeded(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
