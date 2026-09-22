import { describe, expect, it } from 'vitest';
import { findPath } from '../path/pathfinder';
import { createTownGrid, type TownGrid } from '../town/townGrid';
import type { TileCoord } from '../town/townTypes';
import { spawnParkLitter } from './parkLitter';

const fixedRandom = (value: number) => () => value;

const grid: TownGrid = createTownGrid();

/** Kerbside means the lot touches the ring road — the map's outer edge. */
const touchesRingRoad = (tile: TileCoord): boolean =>
  grid
    .neighbours(tile)
    .some(
      (n) =>
        grid.isRoad(n) &&
        (n.x === 0 || n.x === grid.size - 1 || n.y === 0 || n.y === grid.size - 1),
    );

const kerbTiles = (pieces: ReturnType<typeof spawnParkLitter>): TileCoord[] =>
  pieces.filter((piece) => grid.tileAt(piece.tile) === 'lot').map((piece) => piece.tile);

describe('spawnParkLitter', () => {
  describe('the eight pieces', () => {
    it('lays out eight pieces — five in the park, three kerbside', () => {
      const pieces = spawnParkLitter({ grid, random: fixedRandom(0) });
      expect(pieces).toHaveLength(8);
      const park = pieces.filter((piece) => grid.tileAt(piece.tile) === 'park');
      const lot = pieces.filter((piece) => grid.tileAt(piece.tile) === 'lot');
      expect(park).toHaveLength(5);
      expect(lot).toHaveLength(3);
    });

    it('never drops a piece on the road', () => {
      for (const piece of spawnParkLitter({ grid, random: fixedRandom(0) })) {
        expect(grid.tileAt(piece.tile)).not.toBe('road');
      }
    });

    it('keeps every piece reachable by the town’s own pathing', () => {
      const spawn = grid.spawnPoints[0];
      expect(spawn).toBeDefined();
      if (!spawn) return;
      for (const piece of spawnParkLitter({ grid, random: fixedRandom(0) })) {
        expect(findPath(grid, spawn, piece.position)).toBeDefined();
      }
    });

    it('puts each kerbside piece on a lot that touches the ring road', () => {
      const kerbs = kerbTiles(spawnParkLitter({ grid, random: fixedRandom(0) }));
      expect(kerbs).toHaveLength(3);
      for (const tile of kerbs) {
        expect(touchesRingRoad(tile)).toBe(true);
      }
    });

    it('never stacks two pieces on the same spot', () => {
      const pieces = spawnParkLitter({ grid, random: fixedRandom(0.5) });
      const spots = pieces.map((piece) => `${piece.position.x},${piece.position.z}`);
      expect(new Set(spots).size).toBe(pieces.length);
    });
  });

  describe('placement is deterministic under a seed', () => {
    it('gives the same layout for the same seed', () => {
      const first = spawnParkLitter({ grid, random: fixedRandom(0.4) });
      const second = spawnParkLitter({ grid, random: fixedRandom(0.4) });
      expect(second).toEqual(first);
    });

    it('chooses different kerbside lots for different seeds', () => {
      const low = kerbTiles(spawnParkLitter({ grid, random: fixedRandom(0) }));
      const high = kerbTiles(spawnParkLitter({ grid, random: fixedRandom(0.999) }));
      expect(low).not.toEqual(high);
    });
  });
});
