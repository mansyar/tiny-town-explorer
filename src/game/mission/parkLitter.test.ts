import { describe, expect, it } from 'vitest';
import { findPath } from '../path/pathfinder';
import { createTownGrid, type TownGrid, type TownProp } from '../town/townGrid';
import { isParkedCarKind, type TileCoord } from '../town/townTypes';
import {
  kerbEdgesOfPoint,
  kerbKey,
  parkedCarKerbEdges,
  takenKerbKeys,
} from './kerbReservation';
import { kerbPiecePosition, kerbsideLotCandidates, spawnParkLitter } from './parkLitter';

const fixedRandom = (value: number) => () => value;

/** A tiny deterministic PRNG, so "many seeds" stays reproducible. */
function seeded(seed: number): () => number {
  let state = seed + 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  describe('the kerbside draw yields to the parked cars (FR8)', () => {
    const town = createTownGrid();
    const cars = town.props.filter((prop) => isParkedCarKind(prop.kind));
    const occupied = new Set(
      parkedCarKerbEdges(town).map((entry) => kerbKey(entry.edge)),
    );
    const taken = takenKerbKeys(town);

    /** Whether a point lies inside a parked car's footprint, exactly. */
    const insideFootprint = (
      prop: TownProp,
      point: { x: number; z: number },
    ): boolean => {
      const footprint = prop.footprint;
      return (
        footprint !== undefined &&
        Math.abs(point.x - prop.position.x) <= footprint.halfX &&
        Math.abs(point.z - prop.position.z) <= footprint.halfZ
      );
    };

    it('keeps a pool larger than the three it draws', () => {
      // Without this the draw silently stops being a draw: a pool of exactly
      // three lots yields the same three kerbs for every seed, and the mission
      // loses the variety it exists to have.
      const pool = kerbsideLotCandidates(town);
      expect(pool.length).toBeGreaterThan(3);
      for (const tile of pool) {
        expect(touchesRingRoad(tile), `${tile.x},${tile.y} touches the ring road`).toBe(
          true,
        );
      }
    });

    it('never offers a lot whose kerb is already taken', () => {
      for (const tile of kerbsideLotCandidates(town)) {
        // The kerb the piece would use, read off the position the placer would
        // give it — not a guess about which side of the lot it sits on.
        const edges = kerbEdgesOfPoint(town, kerbPiecePosition(town, tile));
        expect(edges.length, `${tile.x},${tile.y} is on a kerb`).toBeGreaterThan(0);
        for (const edge of edges) {
          expect(taken.has(kerbKey(edge)), `${tile.x},${tile.y}'s kerb is free`).toBe(
            false,
          );
        }
      }
    });

    it('still varies with the seed, so the draw is still a draw', () => {
      // The cars took three of the eight candidate kerbs and the puppy's spot
      // took a fourth, leaving four lots for three pieces. If that had left
      // three, every seed would produce the same round and nothing would say so.
      const layouts = new Set<string>();
      for (let seed = 0; seed < 20; seed++) {
        layouts.add(
          spawnParkLitter({ grid: town, random: seeded(seed) })
            .filter((piece) => town.tileAt(piece.tile) === 'lot')
            .map((piece) => `${piece.tile.x},${piece.tile.y}`)
            .sort()
            .join('|'),
        );
      }
      expect(layouts.size).toBeGreaterThan(2);
    });

    it('never draws a lot on a kerb a parked car occupies, across seeds', () => {
      for (let seed = 0; seed < 60; seed++) {
        const pieces = spawnParkLitter({ grid: town, random: seeded(seed) });
        for (const piece of pieces.filter((p) => town.tileAt(p.tile) === 'lot')) {
          for (const edge of kerbEdgesOfPoint(town, piece.position)) {
            expect(
              occupied.has(kerbKey(edge)),
              `seed ${seed}: ${piece.id} sits on a parked car's kerb`,
            ).toBe(false);
          }
        }
      }
    });

    it('never lands a kerbside piece inside a parked car, across seeds', () => {
      for (let seed = 0; seed < 60; seed++) {
        for (const piece of spawnParkLitter({ grid: town, random: seeded(seed) })) {
          for (const car of cars) {
            expect(
              insideFootprint(car, piece.position),
              `seed ${seed}: ${piece.id} is inside ${car.id}`,
            ).toBe(false);
          }
        }
      }
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
