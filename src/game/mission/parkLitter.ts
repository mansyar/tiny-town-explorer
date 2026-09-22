import type { TownGrid } from '../town/townGrid';
import type { TileCoord, Vec2 } from '../town/townTypes';

/**
 * One piece of litter the garbage truck can drive over and collect (FR1, FR3).
 */
export interface LitterPiece {
  readonly id: string;
  /** The non-road tile the piece sits on: a park tile or a kerbside lot. */
  readonly tile: TileCoord;
  /** World-space centre, nudged within the tile (kerb offset for lots). */
  readonly position: Vec2;
}

export interface SpawnParkLitterOptions {
  readonly grid: TownGrid;
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  readonly random?: () => number;
}

/** How far a kerbside piece sits from its lot's centre toward the ring road. */
const KERB_OFFSET = 0.35;

/**
 * Fixed slots for the five park pieces — three on the west park tile, two on
 * the east — kept clear of the two authored trees (offsets ±0.2). The park is
 * the mission's focal point, so its layout reads the same every round; only
 * the three kerbside lots are drawn from the seed.
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

/**
 * Lays out the eight litter pieces (FR1): five on the park's two tiles at
 * fixed readable slots, three on lot tiles that touch the ring road, drawn
 * without replacement from the seed so the same seed always gives the same
 * town and a different seed sends the kid down a different kerb.
 */
export function spawnParkLitter(options: SpawnParkLitterOptions): readonly LitterPiece[] {
  const { grid } = options;
  const random = options.random ?? Math.random;

  const pieces: LitterPiece[] = [];
  let id = 0;

  grid.parkTiles.forEach((tile, tileIndex) => {
    const slots = PARK_SLOTS[tileIndex] ?? [];
    const centre = grid.tileToWorld(tile);
    for (const slot of slots) {
      id += 1;
      pieces.push({
        id: `litter-${id}`,
        tile,
        position: {
          x: centre.x + slot.x * grid.tileSize,
          z: centre.z + slot.z * grid.tileSize,
        },
      });
    }
  });

  for (const tile of drawKerbsideLots(grid, random, 3)) {
    id += 1;
    pieces.push({
      id: `litter-${id}`,
      tile,
      position: kerbPosition(grid, tile),
    });
  }

  return pieces;
}

/**
 * Lots that touch the ring road (a road tile on the map's outer edge), in
 * row-major order, drawn without replacement so no two pieces share a lot.
 */
function drawKerbsideLots(
  grid: TownGrid,
  random: () => number,
  count: number,
): TileCoord[] {
  const candidates: TileCoord[] = [];
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const tile = { x, y };
      if (grid.tileAt(tile) === 'lot' && touchesRingRoad(grid, tile)) {
        candidates.push(tile);
      }
    }
  }

  const chosen: TileCoord[] = [];
  while (chosen.length < count && candidates.length > 0) {
    const index = Math.min(
      candidates.length - 1,
      Math.floor(random() * candidates.length),
    );
    const [tile] = candidates.splice(index, 1);
    if (tile) chosen.push(tile);
  }
  return chosen;
}

function touchesRingRoad(grid: TownGrid, tile: TileCoord): boolean {
  return grid
    .neighbours(tile)
    .some(
      (n) =>
        grid.isRoad(n) &&
        (n.x === 0 || n.x === grid.size - 1 || n.y === 0 || n.y === grid.size - 1),
    );
}

/** Lot centre nudged toward the ring-road neighbour it touches (the kerb). */
function kerbPosition(grid: TownGrid, tile: TileCoord): Vec2 {
  const centre = grid.tileToWorld(tile);
  const kerb = grid
    .neighbours(tile)
    .find(
      (n) =>
        grid.isRoad(n) &&
        (n.x === 0 || n.x === grid.size - 1 || n.y === 0 || n.y === grid.size - 1),
    );
  if (!kerb) return centre;
  return {
    x: centre.x + (kerb.x - tile.x) * KERB_OFFSET * grid.tileSize,
    z: centre.z + (kerb.y - tile.y) * KERB_OFFSET * grid.tileSize,
  };
}
