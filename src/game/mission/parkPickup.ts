import type { Vec2 } from '../town/townTypes';
import type { LitterPiece } from './parkLitter';

/** Drive-over collection radius, from the truck's centre (FR3). */
export const PICKUP_RADIUS = 0.6;
/** Ability sweep radius (FR4). */
export const SWEEP_RADIUS = 1.5;
/** Minimum spacing between drive-over gulps, in ms (FR3). */
export const GULP_MIN_MS = 150;
/** Minimum spacing between ability sweeps, in ms (FR4). */
export const SWEEP_MIN_MS = 500;

export interface PickupResult {
  /** Pieces collected by this call; each is gone for good. */
  readonly collected: readonly LitterPiece[];
  /** Whether this call earns a `gulp` sound. */
  readonly gulp: boolean;
  /** True only on the call that removes the last outstanding piece (FR5). */
  readonly complete: boolean;
}

export interface ParkPickup {
  /** Per-frame drive-over check: collects at most one piece per gulp window. */
  update(
    deltaSeconds: number,
    carPosition: Vec2,
    pieces: readonly LitterPiece[],
  ): PickupResult;
  /** Ability press: sweeps every piece in range in one gulp (FR4). */
  sweep(carPosition: Vec2, pieces: readonly LitterPiece[]): PickupResult;
  /** A new litter field is down: forget the last round's pieces (FR1). */
  reset(): void;
}

/**
 * The park mission's pure pickup rules (FR3–FR5): a piece is collected when
 * the truck drives within {@link PICKUP_RADIUS}, but never more than one per
 * 150 ms gulp window so a cluster lands as a rhythm rather than a stutter.
 * The ability press sweeps the whole {@link SWEEP_RADIUS} group at once on a
 * 0.5 s cadence. Collected pieces are remembered, so a caller may keep
 * passing a stale list without ever double-collecting or re-firing
 * completion.
 */
export function createParkPickup(): ParkPickup {
  const collectedIds = new Set<string>();
  let clock = 0;
  let lastGulp = Number.NEGATIVE_INFINITY;

  const inRange = (carPosition: Vec2, pieces: readonly LitterPiece[], radius: number) =>
    pieces
      .filter((piece) => !collectedIds.has(piece.id))
      .map((piece) => ({
        piece,
        distance: Math.hypot(
          piece.position.x - carPosition.x,
          piece.position.z - carPosition.z,
        ),
      }))
      .filter((entry) => entry.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

  const finish = (
    taken: readonly LitterPiece[],
    pieces: readonly LitterPiece[],
    gulp: boolean,
  ): PickupResult => {
    for (const piece of taken) collectedIds.add(piece.id);
    const complete =
      taken.length > 0 &&
      pieces.length > 0 &&
      pieces.every((piece) => collectedIds.has(piece.id));
    return { collected: taken, gulp, complete };
  };

  return {
    update(deltaSeconds, carPosition, pieces) {
      clock += Math.max(0, deltaSeconds);
      const candidates = inRange(carPosition, pieces, PICKUP_RADIUS);
      const [nearest] = candidates;
      if (!nearest) return finish([], pieces, false);
      if ((clock - lastGulp) * 1000 < GULP_MIN_MS) return finish([], pieces, false);
      lastGulp = clock;
      return finish([nearest.piece], pieces, true);
    },

    sweep(carPosition, pieces) {
      if ((clock - lastGulp) * 1000 < SWEEP_MIN_MS) return finish([], pieces, false);
      lastGulp = clock;
      const taken = inRange(carPosition, pieces, SWEEP_RADIUS).map(
        (entry) => entry.piece,
      );
      return finish(taken, pieces, true);
    },

    reset(): void {
      // The next field reuses the `litter-N` ids, so the collector's memory
      // must not outlive the round it collected (FR1's repeatable layout).
      collectedIds.clear();
      lastGulp = Number.NEGATIVE_INFINITY;
    },
  };
}
