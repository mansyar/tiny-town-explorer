import { describe, expect, it } from 'vitest';
import { findPath } from '../path/pathfinder';
import { createTownGrid, type TownGrid } from '../town/townGrid';
import type { Vec2 } from '../town/townTypes';
import { MIN_HOUSE_DISTANCE } from './calmGapPacer';
import {
  chooseOwnerHouse,
  createPuppySpots,
  isClearOfHouses,
  isScoopable,
} from './puppySpots';

const fixedRandom = (value: number) => () => value;

const grid: TownGrid = createTownGrid();

/** A tile-local offset in world space, the way the spot table expresses one. */
const at = (
  tile: { readonly x: number; readonly y: number },
  offset: { readonly x: number; readonly y: number },
): Vec2 => {
  const centre = grid.tileToWorld(tile);
  return {
    x: centre.x + offset.x * grid.tileSize,
    z: centre.z + offset.y * grid.tileSize,
  };
};

describe('puppySpots', () => {
  describe('the authored hiding spots (FR6)', () => {
    it('authors at least three spots, each on a non-road tile', () => {
      const { spots } = createPuppySpots({ grid, random: fixedRandom(0) });
      expect(spots.length).toBeGreaterThanOrEqual(3);
      for (const spot of spots) {
        expect(grid.tileAt(spot.tile)).not.toBe('road');
      }
    });

    it('keeps every spot reachable over the town’s own pathing', () => {
      const spawn = grid.spawnPoints[0];
      expect(spawn).toBeDefined();
      if (!spawn) return;
      for (const spot of createPuppySpots({ grid, random: fixedRandom(0) }).spots) {
        expect(findPath(grid, spawn, spot.position)).toBeDefined();
      }
    });

    it('never chooses the same spot twice running', () => {
      const unit = createPuppySpots({ grid, random: fixedRandom(0) });
      expect(unit.lastSpotId()).toBeUndefined();
      let previous: string | undefined;
      for (let i = 0; i < 40; i++) {
        const spot = unit.drawSpot();
        expect(spot.id).not.toBe(previous);
        previous = spot.id;
        expect(unit.lastSpotId()).toBe(spot.id);
      }
    });

    it('draws with the town default when no seed is given', () => {
      const unit = createPuppySpots({ grid });
      const spot = unit.drawSpot();
      expect(unit.spots.map((s) => s.id)).toContain(spot.id);
    });
  });

  describe('every spot is findable and scoopable (FR7, AC8)', () => {
    it('stands every authored spot clear of every house footprint', () => {
      for (const spot of createPuppySpots({ grid, random: fixedRandom(0) }).spots) {
        expect(isClearOfHouses(grid, spot.position), spot.id).toBe(true);
      }
    });

    it('leaves a legal car position within the drive-over radius of every spot', () => {
      for (const spot of createPuppySpots({ grid, random: fixedRandom(0) }).spots) {
        expect(isScoopable(grid, spot.position), spot.id).toBe(true);
      }
    });

    it('rejects the two lot positions the Phase 5 walkthrough caught', () => {
      // `spot-garden` sat 0.3 by 0.35 inside house-4's lot and `spot-verge` 0.35
      // inside house-5's — both within a house's capped footprint.
      const garden = at({ x: 2, y: 3 }, { x: -0.3, y: 0.35 });
      expect(isClearOfHouses(grid, garden)).toBe(false);
      // The garden one was worse than hidden: adjacent houses leave gaps
      // narrower than the car, so no legal car position came within reach and
      // the errand could never finish — the town's busy gate stays shut for
      // the rest of the session behind a pup nobody can collect.
      expect(isScoopable(grid, garden)).toBe(false);

      const verge = at({ x: 1, y: 4 }, { x: -0.35, y: 0 });
      expect(isClearOfHouses(grid, verge)).toBe(false);
    });
  });

  describe('the owner house (FR10)', () => {
    it('is a house at least two tiles from the hiding spot', () => {
      for (const roll of [0, 0.5, 0.99]) {
        const unit = createPuppySpots({ grid, random: fixedRandom(roll) });
        for (const spot of unit.spots) {
          const ownerId = unit.drawOwnerHouse(spot);
          expect(ownerId).toBeDefined();
          const house = grid.houseById(ownerId ?? '');
          expect(house).toBeDefined();
          if (!house) return;
          const distance = Math.hypot(
            house.position.x - spot.position.x,
            house.position.z - spot.position.z,
          );
          expect(distance).toBeGreaterThanOrEqual(MIN_HOUSE_DISTANCE);
        }
      }
    });

    it('falls back to the only house when none is two tiles away', () => {
      const near = { id: 'house-near', position: { x: 0, z: 0 } };
      const spot: Vec2 = { x: 0.5, z: 0 };
      expect(chooseOwnerHouse([near], spot, fixedRandom(0))).toBe('house-near');
    });

    it('returns undefined for a town with no houses', () => {
      expect(chooseOwnerHouse([], { x: 0, z: 0 }, fixedRandom(0))).toBeUndefined();
    });
  });
});
