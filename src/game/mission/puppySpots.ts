import type { TownGrid } from '../town/townGrid';
import type { TileCoord, Vec2 } from '../town/townTypes';
import { MIN_HOUSE_DISTANCE } from './calmGapPacer';

/**
 * Where the puppy hides (FR6): four authored spots — behind the park trees,
 * beside the dumpster's corner, behind a house's garden, and on the far verge
 * — each on a non-road tile the town's own pathing can reach. Authored rather
 * than scattered so every hiding place reads as a place (there is a reason the
 * puppy chose *that* spot), while the draw still varies run to run.
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

interface SpotDef {
  readonly id: string;
  readonly tile: TileCoord;
  /** Nudge within the tile, in tile fractions (y maps to world z). */
  readonly offset: { readonly x: number; readonly y: number };
}

const SPOT_DEFS: readonly SpotDef[] = [
  { id: 'spot-trees', tile: { x: 1, y: 1 }, offset: { x: -0.3, y: -0.3 } },
  { id: 'spot-dumpster', tile: { x: 2, y: 1 }, offset: { x: 0.3, y: -0.3 } },
  { id: 'spot-garden', tile: { x: 2, y: 3 }, offset: { x: -0.3, y: 0.35 } },
  { id: 'spot-verge', tile: { x: 1, y: 4 }, offset: { x: -0.35, y: 0 } },
];

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

  const spots: readonly PuppySpot[] = SPOT_DEFS.map((def) => {
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
      // never empty while SPOT_DEFS is authored non-empty.
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
