import type { TownGrid } from '../town/townGrid';
import type { TileCoord, Vec2 } from '../town/townTypes';
import { kerbEdgesOfPoint, kerbKey, takenKerbKeys } from './kerbReservation';
import { fixedParkItems } from './parkSlots';

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

  // The park's layout comes from `parkSlots`, which the kerb reservation reads
  // too: one definition of where the fixed pieces are, so a declared kerb can
  // never drift from the litter it is meant to protect.
  for (const item of fixedParkItems(grid)) {
    id += 1;
    pieces.push({ id: `litter-${id}`, tile: item.tile, position: item.position });
  }

  for (const tile of drawKerbsideLots(grid, random, 3)) {
    id += 1;
    pieces.push({
      id: `litter-${id}`,
      tile,
      position: kerbPiecePosition(grid, tile),
    });
  }

  return pieces;
}

/**
 * Lots the kerbside draw may choose from, in row-major order: every lot that
 * touches the ring road and whose kerb is free (FR8).
 *
 * A lot drops out when the kerb this piece would stand on is already spoken
 * for — by a parked car, or by another mission's fixed item. The pool is the
 * mission's variety: it has to stay bigger than the three pieces drawn, or the
 * seed stops mattering and every round sends the kid down the same kerbs.
 */
export function kerbsideLotCandidates(grid: TownGrid): readonly TileCoord[] {
  const taken = takenKerbKeys(grid);
  const candidates: TileCoord[] = [];
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const tile = { x, y };
      if (grid.tileAt(tile) !== 'lot' || !touchesRingRoad(grid, tile)) {
        continue;
      }
      const edges = kerbEdgesOfPoint(grid, kerbPiecePosition(grid, tile));
      if (edges.every((edge) => !taken.has(kerbKey(edge)))) {
        candidates.push(tile);
      }
    }
  }
  return candidates;
}

/**
 * Lots chosen for this round, drawn without replacement so no two pieces share
 * a lot.
 */
function drawKerbsideLots(
  grid: TownGrid,
  random: () => number,
  count: number,
): TileCoord[] {
  const candidates = [...kerbsideLotCandidates(grid)];

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

/**
 * Where a kerbside piece on `tile` stands: its centre nudged toward the
 * ring-road neighbour it touches (the kerb).
 *
 * Exported because it is the only honest way to ask which kerb a lot's piece
 * uses — the answer comes from the same arithmetic the placer runs.
 */
export function kerbPiecePosition(grid: TownGrid, tile: TileCoord): Vec2 {
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
