/**
 * The pond splash trigger (FR4): says when the car has just splashed into the
 * pond.
 *
 * Pure surface semantics, no meshes and no clocks: callers hand it the car's
 * ground point each frame and it answers `true` exactly once per entry onto
 * the water. Staying wet is silent, leaving rearms it, and nothing outside the
 * pond's own tiles ever triggers — the splash is a delight, never a penalty.
 */
import type { TownGrid } from '../town/townGrid';
import type { Vec2 } from '../town/townTypes';

export interface PondWatcher {
  /** True exactly when `point` steps onto pond ground; silent while it stays. */
  note(point: Vec2): boolean;
}

/** Watches a grid's pond tiles for the car entering them. */
export function createPondWatcher(grid: TownGrid): PondWatcher {
  let inPond = false;
  return {
    note(point: Vec2): boolean {
      const here = grid.tileAt(grid.worldToTile(point)) === 'pond';
      const entered = here && !inPond;
      inPond = here;
      return entered;
    },
  };
}
