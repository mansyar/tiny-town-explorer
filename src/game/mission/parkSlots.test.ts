import { describe, expect, it } from 'vitest';
import { createTownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import { isParkedCarKind, PROP_COLLISION_RADIUS } from '../town/townTypes';
import { fixedParkItems } from './parkSlots';

/**
 * The park's fixed litter layout (FR1).
 *
 * The park is the mission's focal point, so these five pieces read the same
 * every round: their slots are authored data, and what makes them *readable* is
 * the margin they keep — clear of each other, inside their own tile, and clear
 * of the trees and dumpster the park already had. That is a property of the
 * numbers in this module and nothing else tests it directly.
 */

const grid = createTownGrid(TOWN_MAP);
const items = fixedParkItems(grid);

/** The park's own props: the things a piece of litter must not sit inside. */
const parkProps = grid.props.filter(
  (prop) => !isParkedCarKind(prop.kind) && grid.tileAt(prop.tile) === 'park',
);

describe('the park’s fixed litter slots', () => {
  it('lays five pieces, three on the first park tile and two on the second', () => {
    const perTile = grid.parkTiles
      .map(
        (tile) =>
          items.filter((item) => item.tile.x === tile.x && item.tile.y === tile.y).length,
      )
      .filter((count) => count > 0);

    expect(items).toHaveLength(5);
    expect(perTile).toEqual([3, 2]);
  });

  it('keeps every piece on the park tile it belongs to', () => {
    for (const item of items) {
      expect(grid.tileAt(item.tile), `${item.tile.x},${item.tile.y} is park`).toBe(
        'park',
      );
      const centre = grid.tileToWorld(item.tile);
      const half = grid.tileSize / 2;
      expect(Math.abs(item.position.x - centre.x)).toBeLessThan(half);
      expect(Math.abs(item.position.z - centre.z)).toBeLessThan(half);
    }
  });

  it('keeps every piece clear of the trees and the dumpster', () => {
    // Inside a tree's own footprint the piece would be half-buried in the trunk,
    // and the kid would be steering at a bag they cannot see.
    for (const item of items) {
      for (const prop of parkProps) {
        const radius = prop.collisionRadius ?? 0;
        const gap = Math.hypot(
          item.position.x - prop.position.x,
          item.position.z - prop.position.z,
        );
        expect(gap, `a litter slot is inside ${prop.id}`).toBeGreaterThan(radius);
      }
    }
    expect(PROP_COLLISION_RADIUS.tree).toBeGreaterThan(0);
  });

  it('never stacks two pieces on the same slot', () => {
    const spots = items.map((item) => `${item.position.x},${item.position.z}`);
    expect(new Set(spots).size).toBe(items.length);
  });

  it('scales its offsets with the tile size', () => {
    const big = fixedParkItems(createTownGrid({ ...TOWN_MAP, tileSize: 2 }));
    const first = items[0]?.tile;
    expect(first).toBeDefined();
    if (first === undefined) {
      return;
    }
    const smallCentre = grid.tileToWorld(first);
    const bigCentre = {
      x: smallCentre.x * 2,
      z: smallCentre.z * 2,
    };
    const smallOffset = {
      x: (items[0]?.position.x ?? 0) - smallCentre.x,
      z: (items[0]?.position.z ?? 0) - smallCentre.z,
    };

    expect((big[0]?.position.x ?? 0) - bigCentre.x).toBeCloseTo(smallOffset.x * 2, 6);
    expect((big[0]?.position.z ?? 0) - bigCentre.z).toBeCloseTo(smallOffset.z * 2, 6);
  });
});
