import type { Obstacle } from '../collision/collision';
import type { TownGrid } from '../town/townGrid';
import {
  parkedCarFittedHeight,
  parkedCarHalfExtents,
  type TileCoord,
} from '../town/townTypes';
import { createVehicleMotor } from '../vehicle/vehicleMotor';
import { createTrafficBrain, type TrafficBrain } from './trafficBrain';

/**
 * Light ambient traffic and creature life: six sealed road actors that make the
 * town feel alive.
 *
 * The system owns every actor outright — its motor, brain, and lane — and says
 * only what the town needs: `update` to tick them, `poses` to show them, and
 * `footprints` to publish where they stand. No camera target, engine voice, or
 * tap handler (product.md: the hero car is the only character the child drives).
 * An ambient actor is not a mission; it is the town's natural reason for motion.
 *
 * Deterministic on purpose: `seed` decides the whole wander — starts, routes,
 * the lot — so one launch replays exactly like the next.
 */

type MoverKind = Parameters<typeof parkedCarHalfExtents>[0];

/** The bounded visual and collision kinds the ambient traffic seam can mount. */
export type TrafficActorKind = MoverKind | 'cat' | 'rabbit';

interface MoverSpec {
  /** Stable identity, published on every footprint. */
  readonly id: string;
  /** Which fitted actor body or civilian model stands here. */
  readonly kind: TrafficActorKind;
  /** Which side of the street to hold; the roster alternates sides (FR3). */
  readonly side: 1 | -1;
  /** Cruise pace in world units per second — slower than the kid's 1.6. */
  readonly speed: number;
}

const MOVERS: readonly MoverSpec[] = [
  { id: 'traffic-0', kind: 'parkedSedan', side: 1, speed: 0.8 },
  { id: 'traffic-1', kind: 'parkedHatchback', side: -1, speed: 1.0 },
  // The third (FR8): the van, already precached, sharing a lane with its
  // opposite — where the mover-to-mover squash language takes over. Opposite
  // lanes pass clean under FR3's contract; same-lane meets are comedy, never
  // walls.
  { id: 'traffic-2', kind: 'parkedVan', side: 1, speed: 0.9 },
  { id: 'traffic-3', kind: 'parkedSuv', side: -1, speed: 0.85 },
  { id: 'creature-cat-0', kind: 'cat', side: 1, speed: 0.45 },
  { id: 'creature-rabbit-0', kind: 'rabbit', side: -1, speed: 0.35 },
];

export interface TrafficActorExtents {
  readonly halfLength: number;
  readonly halfWidth: number;
}

const CREATURE_EXTENTS: Readonly<Record<'cat' | 'rabbit', TrafficActorExtents>> = {
  cat: { halfLength: 0.18, halfWidth: 0.12 },
  rabbit: { halfLength: 0.17, halfWidth: 0.11 },
};

/**
 * The fitted world footprint for one ambient actor profile.
 *
 * The creature numbers are measured from the mounted primitive bounds in
 * `trafficActors.ts` (tail tip to nose, widest paw to paw), so the box a child
 * bonks is the body they can see.
 */
export function trafficActorHalfExtents(kind: TrafficActorKind): TrafficActorExtents {
  if (kind === 'cat' || kind === 'rabbit') {
    return CREATURE_EXTENTS[kind];
  }
  return parkedCarHalfExtents(kind);
}

/** The blob-shadow height for one ambient actor profile. */
export function trafficActorFittedHeight(kind: TrafficActorKind): number {
  // The creatures are measured to their ear tips, so a hopping rabbit throws
  // the same sun-offset shadow its height would really cast.
  if (kind === 'cat') {
    return 0.26;
  }
  if (kind === 'rabbit') {
    return 0.37;
  }
  return parkedCarFittedHeight(kind);
}

export interface TrafficSystemOptions {
  /** The road network to wander. */
  readonly grid: TownGrid;
  /** Decides starts and every route; the same seed replays the same town. */
  readonly seed: number;
}

/**
 * A read-only view of one wanderer's live pose, for whoever draws it (FR1).
 *
 * The motors stay sealed inside the system; this mirror is all the mounting
 * ever sees, so nobody can steer a mover from outside.
 */
export interface TrafficPose {
  /** Which mover; the same identity its footprint publishes. */
  readonly id: string;
  /** Which fitted actor stands here — the kind decides the mounted art. */
  readonly kind: TrafficActorKind;
  /** Live world position; follows the car as it drives. */
  readonly position: { readonly x: number; readonly z: number };
  /** Where the nose points, in the town's yaw convention. */
  heading(): number;
  /** Recoil progress 0→1 while a bonk springs back, otherwise nothing. */
  bounceProgress(): number | undefined;
}

export interface TrafficSystem {
  /** Advance every wanderer one frame. */
  update(deltaSeconds: number): void;
  /**
   * Every live box under its stable ids — crashable like every other ambient
   * actor in the town (FR4), for the kid's and each other's sweeps (FR5).
   */
  footprints(): readonly Obstacle[];
  /** Read-only poses to mount models on (FR1) — mirrors, never the motors. */
  poses(): readonly TrafficPose[];
}

interface Carriage {
  readonly spec: MoverSpec;
  readonly motor: ReturnType<typeof createVehicleMotor>;
  readonly brain: TrafficBrain;
  readonly extents: TrafficActorExtents;
  readonly pose: TrafficPose;
}

export function createTrafficSystem(options: TrafficSystemOptions): TrafficSystem {
  const { grid, seed } = options;
  const tiles = roadTiles(grid);
  const starts = pickStarts(seeded(seed), tiles.length, MOVERS.length);

  let carriages: Carriage[] = [];

  const footprints = (): readonly Obstacle[] => carriages.map(footprintOf);
  const poses = (): readonly TrafficPose[] => carriages.map((carriage) => carriage.pose);

  carriages = MOVERS.map((spec, index) =>
    buildCarriage({
      grid,
      spec,
      start: tiles[starts[index] ?? 0] ?? { x: 0, y: 0 },
      random: seeded(seed * 2 + index),
      others: () => carriages.filter((_, i) => i !== index).map(footprintOf),
    }),
  );

  return {
    footprints,
    poses,

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
  random: () => number;
  others: () => readonly Obstacle[];
}): Carriage {
  const extents = trafficActorHalfExtents(options.spec.kind);
  const brain = createTrafficBrain({
    grid: options.grid,
    random: options.random,
    side: options.spec.side,
  });
  const motor = createVehicleMotor({
    position: options.grid.tileToWorld(options.start),
    // No static hitboxes on purpose: a wanderer's lane is authored road, and
    // an ambient car that bonks around the furniture reads as a mistake. It
    // meets the kid and its twin in the one collision language (FR4); all else
    // is scenery it drives past. Since the lanes narrowed (0.136, 2026-09-24)
    // a same-side pass is clean past the parked strip, and a head-on squashes
    // past with a slight overlap — the accepted comedy, see tech-stack.md.
    // The sweep radius is the car's own fitted half-width, so the capsule
    // matches the footprint box exactly.
    radius: extents.halfWidth,
    halfLength: extents.halfLength,
    speed: options.spec.speed,
    dynamicObstacles: options.others,
  });
  const pose: TrafficPose = {
    id: options.spec.id,
    kind: options.spec.kind,
    // The motor's position is written in place, so the mirror follows for free.
    position: motor.position,
    heading: () => motor.heading(),
    bounceProgress: () => motor.bounceProgress(),
  };
  return { spec: options.spec, motor, brain, extents, pose };
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

/** N draws, N distinct tiles — the roster never starts stacked. */
function pickStarts(random: () => number, count: number, picks: number): number[] {
  const tiles = Array.from({ length: count }, (_, index) => index);
  const starts: number[] = [];
  for (let draw = 0; draw < Math.min(picks, count); draw += 1) {
    const chosen = Math.floor(random() * tiles.length);
    starts.push(tiles[chosen] ?? 0);
    tiles.splice(chosen, 1);
  }
  return starts;
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
