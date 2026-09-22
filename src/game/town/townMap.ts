import { PARKED_CAR_KERB_OFFSET, type TownMapSpec } from './townTypes';

/** Kerb offset toward the street a parked car belongs to, in tile units. */
const KERB = PARKED_CAR_KERB_OFFSET;

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
/** A quarter turn: the yaw that lies a car along an east-west street. */
const QUARTER_TURN = Math.PI / 2;

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
    // The park's trash landmark (FR1): south-east corner of the east park
    // tile, clear of the tree, the litter slots and spot-dumpster's corner.
    { kind: 'dumpster', tile: { x: 2, y: 1 }, offset: { x: 0.3, y: 0.3 } },

    // Six parked cars (FR1), authored on the *street* tile and offset toward
    // the kerb they sit against, with a yaw that lies them along that street.
    //
    // Each one is on a kerb whose house wall measures at least 0.652 from the
    // street's centre line (`1.00 - fitted depth / 2`), because that is the
    // narrowest wall a car fitted to `PARKED_CAR_FIT` can clear while keeping
    // its inner edge out of the lane. Two kerbs in town cannot host a car at
    // any offset — beside house-8 (type-r, wall 0.574) and house-5 (type-f,
    // 0.576) — and the roomiest kerb of all (0.748) is the puppy's hiding
    // place, so neither is used here.
    //
    // Four of the eight ring-road lots keep their kerbs clear for the park
    // mission's litter draw: (1,2), (1,3), (4,1) and (4,4) are taken here, so a
    // seeded draw still has (1,4), (2,4), (4,2) and (4,3) to choose three from.
    { kind: 'parkedSedan', tile: { x: 0, y: 2 }, offset: { x: KERB, y: 0 }, yaw: 0 },
    {
      kind: 'parkedHatchback',
      tile: { x: 0, y: 3 },
      offset: { x: KERB, y: 0 },
      yaw: Math.PI,
    },
    {
      kind: 'parkedVan',
      tile: { x: 4, y: 0 },
      offset: { x: 0, y: KERB },
      yaw: QUARTER_TURN,
    },
    {
      kind: 'parkedSuv',
      tile: { x: 3, y: 2 },
      offset: { x: -KERB, y: 0 },
      yaw: 0,
    },
    {
      kind: 'parkedSedan',
      tile: { x: 3, y: 4 },
      offset: { x: -KERB, y: 0 },
      yaw: Math.PI,
    },
    {
      kind: 'parkedHatchback',
      tile: { x: 4, y: 5 },
      offset: { x: 0, y: -KERB },
      yaw: QUARTER_TURN,
    },
  ],
  spawnPoints: [
    { x: 3, y: 2 },
    { x: 1, y: 0 },
    { x: 5, y: 3 },
    { x: 4, y: 5 },
  ],
};
