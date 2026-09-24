import type { TownGrid } from '../town/townGrid';
import type { TileCoord, Vec2 } from '../town/townTypes';

/**
 * The park mission's fixed litter layout, derived from the map's authored
 * `parkSlots` (FR6).
 *
 * It lives apart from `parkLitter.ts` because the kerb reservation (FR8) has to
 * read the same layout to work out which kerbs the park has spoken for, and a
 * cycle between the two would otherwise be the only way to share it. The
 * layout itself is authored in `townMap.ts` beside the trees it avoids; this
 * module only projects it onto the world and holds the line that only `P`
 * tiles carry park litter, which is what keeps another green (the pond is its
 * own tile kind) from ever receiving a piece.
 */

/** One fixed park piece: the tile it lies on and where in the world it sits. */
export interface ParkItem {
  readonly tile: TileCoord;
  readonly position: Vec2;
}

/**
 * The park's fixed pieces in world space, in authored order.
 *
 * Both the mission and the reservation build their view from this, so the
 * declared kerbs can never drift from where the litter actually goes.
 */
export function fixedParkItems(grid: TownGrid): readonly ParkItem[] {
  const items: ParkItem[] = [];
  for (const layout of grid.parkSlots) {
    if (grid.tileAt(layout.tile) !== 'park') {
      continue;
    }
    const centre = grid.tileToWorld(layout.tile);
    for (const slot of layout.slots) {
      items.push({
        tile: layout.tile,
        position: {
          x: centre.x + slot.x * grid.tileSize,
          z: centre.z + slot.y * grid.tileSize,
        },
      });
    }
  }
  return items;
}
