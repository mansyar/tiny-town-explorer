import type { TownMapSpec } from './townTypes';

/**
 * The authored town: a 6x6 tile grid whose ring road plus one cross street
 * double as the driving graph.
 *
 * `#` road, `L` house lot, `P` park. Row strings run north (top) first, so
 * the first character of the first row is the north-west tile.
 *
 * ```text
 *    x0 x1 x2 x3 x4 x5
 * y0  #  #  #  #  #  #     ring road (all four sides)
 * y1  #  P  P  #  L  #
 * y2  #  L  L  #  L  #     cross street runs north-south at x3
 * y3  #  L  L  #  L  #
 * y4  #  L  L  #  L  #
 * y5  #  #  #  #  #  #
 * ```
 *
 * Every lot touches a street, so a mission can always park beside a house,
 * and the road network is a single connected loop for pathing.
 */
export const TOWN_MAP: TownMapSpec = {
  // One world unit per track tile keeps the 6x6 town at 6x6 units, which
  // frames a roughly car-sized vehicle at the spec'd 15-20% of viewport
  // height. Revisit once the Kenney kit's real tile scale is measured.
  tileSize: 1,
  rows: ['######', '#PP#L#', '#LL#L#', '#LL#L#', '#LL#L#', '######'],
  houses: [
    { id: 'house-1', tile: { x: 1, y: 2 }, facing: 'west' },
    { id: 'house-2', tile: { x: 2, y: 2 }, facing: 'east' },
    { id: 'house-3', tile: { x: 1, y: 3 }, facing: 'west' },
    { id: 'house-4', tile: { x: 2, y: 3 }, facing: 'east' },
    { id: 'house-5', tile: { x: 1, y: 4 }, facing: 'south' },
    { id: 'house-6', tile: { x: 2, y: 4 }, facing: 'east' },
    { id: 'house-7', tile: { x: 4, y: 1 }, facing: 'north' },
    { id: 'house-8', tile: { x: 4, y: 2 }, facing: 'east' },
    { id: 'house-9', tile: { x: 4, y: 3 }, facing: 'east' },
    { id: 'house-10', tile: { x: 4, y: 4 }, facing: 'south' },
  ],
  // Offsets nudge props to the kerb of the street they belong to.
  props: [
    { kind: 'cone', tile: { x: 2, y: 2 }, offset: { x: 0.35, y: 0 } },
    { kind: 'cone', tile: { x: 1, y: 3 }, offset: { x: -0.35, y: 0 } },
    { kind: 'cone', tile: { x: 4, y: 2 }, offset: { x: 0.35, y: 0 } },
    { kind: 'cone', tile: { x: 2, y: 4 }, offset: { x: 0, y: 0.35 } },
    { kind: 'powerPole', tile: { x: 1, y: 2 }, offset: { x: -0.3, y: 0 } },
    { kind: 'powerPole', tile: { x: 4, y: 3 }, offset: { x: 0.3, y: 0 } },
    { kind: 'powerPole', tile: { x: 1, y: 4 }, offset: { x: -0.3, y: 0 } },
    { kind: 'tree', tile: { x: 1, y: 1 }, offset: { x: 0.2, y: 0.2 } },
    { kind: 'tree', tile: { x: 2, y: 1 }, offset: { x: -0.2, y: 0.2 } },
  ],
  spawnPoints: [
    { x: 3, y: 2 },
    { x: 1, y: 0 },
    { x: 5, y: 3 },
    { x: 4, y: 5 },
  ],
};
