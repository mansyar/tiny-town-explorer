import { describe, expect, it } from 'vitest';
import { createTownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import type { TownMapSpec, Vec2 } from '../town/townTypes';
import { fixedParkItems } from './parkSlots';
import { createPuppySpots } from './puppySpots';

/**
 * Mission spots derive from the map (FR6).
 *
 * The puppy's hiding places and the park's fixed litter slots used to carry
 * tile coordinates inside their mission modules, which meant a new town map
 * would silently misplace them. Both are authored map data now — in
 * `townMap.ts`, beside the houses and props they read as places among — and
 * the mission modules derive world positions from the grid.
 *
 * This file pins the two halves of that contract: the shipped map still
 * yields exactly the spots it always had (golden equivalence, positions
 * included, because the kerb reservation reads those positions), and a
 * different map yields different spots — nothing is pinned to 6x6
 * coordinates.
 */

const grid = createTownGrid(TOWN_MAP);

/** Asserts a world position within float noise of the expected one. */
function expectPosition(actual: Vec2 | undefined, expected: Vec2): void {
  expect(actual, 'a derived world position exists').toBeDefined();
  expect(actual?.x ?? Number.NaN).toBeCloseTo(expected.x, 10);
  expect(actual?.z ?? Number.NaN).toBeCloseTo(expected.z, 10);
}

describe('golden equivalence on the shipped map (FR6)', () => {
  it('derives exactly the seven authored puppy spots', () => {
    // Every hiding place goes through one arithmetic: the tile centre of a
    // 10x10 town (centres at -4.5 to 4.5) plus the authored nudge. The world
    // positions are pinned so an offset-convention slip (y maps to world z)
    // cannot pass unnoticed.
    const { spots } = createPuppySpots({ grid });

    expect(spots.map((spot) => ({ id: spot.id, tile: spot.tile }))).toEqual([
      { id: 'spot-trees', tile: { x: 1, y: 1 } },
      { id: 'spot-dumpster', tile: { x: 2, y: 1 } },
      { id: 'spot-garden', tile: { x: 2, y: 3 } },
      { id: 'spot-verge', tile: { x: 1, y: 4 } },
      { id: 'spot-pond', tile: { x: 7, y: 7 } },
      { id: 'spot-orchard', tile: { x: 6, y: 8 } },
      { id: 'spot-lawn', tile: { x: 8, y: 8 } },
    ]);
    expectPosition(spots[0]?.position, { x: -3.8, z: -3.8 });
    expectPosition(spots[1]?.position, { x: -2.2, z: -3.8 });
    expectPosition(spots[2]?.position, { x: -2.02, z: -1.25 });
    expectPosition(spots[3]?.position, { x: -3.3, z: -0.02 });
    expectPosition(spots[4]?.position, { x: 2.5, z: 2.9 });
    expectPosition(spots[5]?.position, { x: 1.2, z: 3.2 });
    expectPosition(spots[6]?.position, { x: 3.8, z: 3.2 });
  });

  it('derives exactly the five park slots on the two park tiles', () => {
    // Order matters too: `parkLitter` numbers the pieces and the kerb
    // reservation names its declarations after them, so a reshuffled layout
    // would rename what a failure message talks about.
    const items = fixedParkItems(grid);

    expect(items.map((item) => item.tile)).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 1 },
    ]);
    expectPosition(items[0]?.position, { x: -3.8, z: -3.85 });
    expectPosition(items[1]?.position, { x: -3.15, z: -3.8 });
    expectPosition(items[2]?.position, { x: -3.8, z: -3.15 });
    expectPosition(items[3]?.position, { x: -2.2, z: -3.85 });
    expectPosition(items[4]?.position, { x: -2.85, z: -3.8 });
  });

  it('derives exactly the four spawn points', () => {
    expect(grid.spawnPoints).toHaveLength(4);
    expectPosition(grid.spawnPoints[0], { x: -1.5, z: -2.5 });
    expectPosition(grid.spawnPoints[1], { x: -3.5, z: -4.5 });
    expectPosition(grid.spawnPoints[2], { x: 2.5, z: 0.5 });
    expectPosition(grid.spawnPoints[3], { x: 2.5, z: 4.5 });
  });
});

describe('the spots follow the map, not the module (FR6)', () => {
  it('derives puppy spots from the map’s authored hiding places', () => {
    // A map that authors one hiding place derives one hiding place — at the
    // map's tile, not at any remembered 6x6 coordinate.
    const custom: TownMapSpec = {
      ...TOWN_MAP,
      hidingSpots: [{ id: 'spot-solo', tile: { x: 1, y: 2 }, offset: { x: 0, y: 0 } }],
    };

    const { spots } = createPuppySpots({ grid: createTownGrid(custom) });

    expect(spots.map((spot) => spot.id)).toEqual(['spot-solo']);
    expectPosition(spots[0]?.position, { x: -3.5, z: -2.5 });
  });

  it('lays park litter on P tiles only, ignoring any other kind', () => {
    // Three park tiles, layouts on the outer two — and one rogue layout on a
    // lot tile. Only `P` is the park mission's anchor, which is exactly what
    // keeps a future green (the pond) from ever receiving litter: it will be
    // its own tile kind, and this filter asks for `'park'` and nothing else.
    const custom: TownMapSpec = {
      tileSize: 1,
      rows: ['PPP', '...', '...'],
      houses: [],
      props: [],
      hidingSpots: [],
      parkSlots: [
        { tile: { x: 0, y: 0 }, slots: [{ x: -0.3, y: -0.3 }] },
        { tile: { x: 2, y: 0 }, slots: [{ x: 0.3, y: 0.3 }] },
        { tile: { x: 1, y: 1 }, slots: [{ x: 0, y: 0 }] },
      ],
      spawnPoints: [],
    };

    const items = fixedParkItems(createTownGrid(custom));

    // The middle park tile authored no layout and gets none; the lot tile's
    // layout is ignored outright.
    expect(items.map((item) => item.tile)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('derives spawn points from the map’s road tiles', () => {
    const custom: TownMapSpec = { ...TOWN_MAP, spawnPoints: [{ x: 0, y: 0 }] };
    const customGrid = createTownGrid(custom);

    expect(customGrid.spawnPoints).toEqual([customGrid.tileToWorld({ x: 0, y: 0 })]);
  });
});
