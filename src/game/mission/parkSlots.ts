import type { TownGrid } from '../town/townGrid';
import type { TileCoord, Vec2 } from '../town/townTypes';

/**
 * The park mission's fixed litter layout, as pure data.
 *
 * It lives apart from `parkLitter.ts` because the kerb reservation (FR8) has to
 * read the same layout to work out which kerbs the park has spoken for, and a
 * cycle between the two would otherwise be the only way to share it.
 *
 * Five pieces at fixed readable slots — three on the west park tile, two on the
 * east — kept clear of the two authored trees (offsets ±0.2). The park is the
 * mission's focal point, so its layout reads the same every round; only the
 * three kerbside lots are drawn from the seed.
 */
const PARK_SLOTS: readonly (readonly Vec2[])[] = [
  [
    { x: -0.3, z: -0.35 },
    { x: 0.35, z: -0.3 },
    { x: -0.3, z: 0.35 },
  ],
  [
    { x: 0.3, z: -0.35 },
    { x: -0.35, z: -0.3 },
  ],
];

/** One fixed park piece: the tile it lies on and where in the world it sits. */
export interface ParkItem {
  readonly tile: TileCoord;
  readonly position: Vec2;
}

/**
 * The park's fixed pieces in world space, in park-tile order.
 *
 * Both the mission and the reservation build their view from this, so the
 * declared kerbs can never drift from where the litter actually goes.
 */
export function fixedParkItems(grid: TownGrid): readonly ParkItem[] {
  const items: ParkItem[] = [];
  grid.parkTiles.forEach((tile, tileIndex) => {
    const centre = grid.tileToWorld(tile);
    for (const slot of PARK_SLOTS[tileIndex] ?? []) {
      items.push({
        tile,
        position: {
          x: centre.x + slot.x * grid.tileSize,
          z: centre.z + slot.z * grid.tileSize,
        },
      });
    }
  });
  return items;
}
