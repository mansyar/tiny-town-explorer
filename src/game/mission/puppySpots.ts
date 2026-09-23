import type { TownGrid } from '../town/townGrid';
import { HOUSE_LOT_FIT, type TileCoord, type Vec2 } from '../town/townTypes';
import { CAR_RADIUS } from '../vehicle/vehicleMotor';
import { MIN_HOUSE_DISTANCE } from './calmGapPacer';
import { PICKUP_RADIUS } from './parkPickup';

/**
 * Where the puppy hides (FR6): four authored spots — behind the park trees,
 * beside the dumpster's corner, at a house's garden kerb, and on the far
 * verge — each on a non-road tile the town's own pathing can reach. Authored
 * rather than scattered so every hiding place reads as a place (there is a
 * reason the puppy chose *that* spot), while the draw still varies run to run.
 *
 * Two rules decide whether a spot is a hiding place at all (FR7, added after
 * the Phase 5 walkthrough):
 *
 * - **Clear of buildings** ({@link isClearOfHouses}). A house fills up to
 *   `HOUSE_LOT_FIT` of its lot, so a spot inside that footprint is a pup
 *   embedded in a wall. This is why the two lot spots sit on the *kerb* of the
 *   street their house faces rather than halfway across its lawn.
 * - **Scoopable** ({@link isScoopable}). Somewhere the car can legally stand
 *   must lie within the drive-over radius, or the pup can never be collected
 *   and the town's busy gate stays shut for the rest of the session behind an
 *   errand nobody can finish. Adjacent houses leave gaps narrower than the
 *   car, so "behind the house" is not a place the truck can reach.
 *
 * Hiding is still the point — the two park spots put the pup behind a tree and
 * the dumpster, where the camera genuinely loses it. What the marker layer
 * guarantees is that the *paw print* never gets lost with it (`puppyMarker`).
 */
export interface PuppySpot {
  readonly id: string;
  readonly tile: TileCoord;
  /** World-space centre the paw marker blooms over. */
  readonly position: Vec2;
}

/** The minimal house shape the owner rule needs — grid houses fit it. */
export interface PuppyHouse {
  readonly id: string;
  readonly position: Vec2;
}



/** How much room beyond a building's capped footprint a spot keeps. */
export const SPOT_HOUSE_MARGIN = 0.04;

/** Angles sampled around a spot when asking whether a car can reach it. */
const SCOOP_SAMPLES = 32;

/**
 * Whether a point stands clear of every building (FR7).
 *
 * Measured against the `HOUSE_LOT_FIT` cap rather than the mounted art on
 * purpose: the cap bounds every model the renderer can mount, so a spot that
 * clears it clears whatever is actually drawn, including after an art swap.
 */
export function isClearOfHouses(grid: TownGrid, point: Vec2): boolean {
  const half = (grid.tileSize * HOUSE_LOT_FIT) / 2 + SPOT_HOUSE_MARGIN;
  return grid.houses.every(
    (house) =>
      Math.abs(point.x - house.position.x) > half ||
      Math.abs(point.z - house.position.z) > half,
  );
}

/**
 * Whether a hiding spot can be collected: somewhere a car can legally stand
 * (on the town, clear of every building by the car's own radius) lies within
 * {@link PICKUP_RADIUS} of it (FR7).
 *
 * Sampled rather than solved — a ring of probes at four radii, plus the spot
 * itself — because the town's buildings are a union of boxes and a closed-form
 * answer would be more machinery than the question deserves. A spot only has
 * to find *one* way in, and the samples are dense enough that the corner cases
 * this rule exists for (a pup walled in behind a house) report no way in at
 * all.
 */
export function isScoopable(grid: TownGrid, point: Vec2): boolean {
  if (carFits(grid, point)) {
    return true;
  }
  for (const share of [0.99, 0.75, 0.5, 0.25]) {
    const reach = PICKUP_RADIUS * share;
    for (let step = 0; step < SCOOP_SAMPLES; step += 1) {
      const angle = (step / SCOOP_SAMPLES) * Math.PI * 2;
      if (
        carFits(grid, {
          x: point.x + Math.cos(angle) * reach,
          z: point.z + Math.sin(angle) * reach,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Whether the car can legally stand on a point, at its own radius. */
function carFits(grid: TownGrid, point: Vec2): boolean {
  const { minX, maxX, minZ, maxZ } = grid.bounds;
  if (point.x < minX || point.x > maxX || point.z < minZ || point.z > maxZ) {
    return false;
  }
  const half = (grid.tileSize * HOUSE_LOT_FIT) / 2 + CAR_RADIUS;
  return grid.houses.every(
    (house) =>
      Math.abs(point.x - house.position.x) > half ||
      Math.abs(point.z - house.position.z) > half,
  );
}

export interface PuppySpots {
  /** Every authored spot, for tests and marker wiring. */
  readonly spots: readonly PuppySpot[];
  /**
   * Picks the next hiding spot, never the one that just ran — the same
   * never-twice-in-a-row rule the mission rotation keeps.
   */
  drawSpot(): PuppySpot;
  /** The spot that went last, or `undefined` before the first draw. */
  lastSpotId(): string | undefined;
  /** The owner's house for a spot: the pacer's ≥2-tile distance rule (FR10). */
  drawOwnerHouse(spot: PuppySpot): string | undefined;
}

export interface PuppySpotsOptions {
  readonly grid: TownGrid;
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  readonly random?: () => number;
}

export function createPuppySpots(options: PuppySpotsOptions): PuppySpots {
  const { grid } = options;
  const random = options.random ?? Math.random;

  const spots: readonly PuppySpot[] = grid.hidingSpots.map((def) => {
    const centre = grid.tileToWorld(def.tile);
    return {
      id: def.id,
      tile: def.tile,
      position: {
        x: centre.x + def.offset.x * grid.tileSize,
        z: centre.z + def.offset.y * grid.tileSize,
      },
    };
  });

  let lastSpotId: string | undefined;

  return {
    spots,
    lastSpotId: () => lastSpotId,

    drawSpot(): PuppySpot {
      // The filter drops at most the one spot that just ran, so candidates is
      // never empty while the map authors at least one hiding spot.
      const candidates = spots.filter((spot) => spot.id !== lastSpotId);
      const index = Math.min(
        candidates.length - 1,
        Math.floor(random() * candidates.length),
      );
      const spot = candidates[index] as PuppySpot;
      lastSpotId = spot.id;
      return spot;
    },

    drawOwnerHouse(spot): string | undefined {
      return chooseOwnerHouse(grid.houses, spot.position, random);
    },
  };
}

/**
 * The owner house for a hiding spot (FR10): among the houses at least
 * {@link MIN_HOUSE_DISTANCE} from the spot — the fire pacer's proven
 * separation rule, reused rather than re-invented. A tiny town can run out of
 * far houses, so the rule degrades to any house rather than to no delivery:
 * zero-failure beats a perfect distance.
 */
export function chooseOwnerHouse(
  houses: readonly PuppyHouse[],
  spot: Vec2,
  random: () => number,
): string | undefined {
  if (houses.length === 0) {
    return undefined;
  }
  const farEnough = houses.filter(
    (house) =>
      Math.hypot(house.position.x - spot.x, house.position.z - spot.z) >=
      MIN_HOUSE_DISTANCE,
  );
  const candidates = farEnough.length > 0 ? farEnough : houses;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  // Non-empty here: houses passed the early return, and farEnough is only
  // chosen when it has at least one member.
  return (candidates[index] as PuppyHouse).id;
}
