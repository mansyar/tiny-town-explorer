import { PARKED_CAR_KERB_OFFSET, type TownMapSpec } from './townTypes';

/** Kerb offset toward the street a parked car belongs to, in tile units. */
const KERB = PARKED_CAR_KERB_OFFSET;

/**
 * The authored town: a 10x10 tile grid whose two block loops meet at exactly
 * one shared junction tile - the figure-eight (FR1). The north-west 6x6 keeps
 * the original ring road and cross street byte-for-byte; the second block's
 * loop is the square ring of (5..9)^2 and shares exactly one tile with the old
 * network: (5,5), the old south-east corner, which becomes the town's crossing
 * moment.
 *
 * `#` road, `L` house lot, `P` park or meadow, `W` pond green. Row strings run
 * north (top) first, so the first character of the first row is the
 * north-west tile.
 *
 * ```text
 *    x0 x1 x2 x3 x4 x5 x6 x7 x8 x9
 * y0  #  #  #  #  #  #  P  P  P  P
 * y1  #  P  P  #  L  #  P  P  P  P
 * y2  #  L  L  #  L  #  P  P  P  P
 * y3  #  L  L  #  L  #  P  P  P  P
 * y4  #  L  L  #  L  #  P  P  P  P
 * y5  #  #  #  #  #  #  #  #  #  #     (5,5) junction: four arms
 * y6  P  P  P  P  P  #  S  L  L  #     S shop lot at the junction corner
 * y7  P  P  P  P  P  #  L  W  L  #     W pond green in the loop's heart
 * y8  P  P  P  P  P  #  L  L  L  #
 * y9  P  P  P  P  P  #  #  #  #  #
 * ```
 *
 * The `P` meadows padding the north-east and south-west are grass, not lots,
 * so "every lot touches a street" still holds across both loops. The park
 * mission keeps its two original `P` tiles and can never drift onto the pond,
 * which is its own tile kind. `figureEight.test.ts` holds these claims to
 * account.
 */
/** A quarter turn: the yaw that lies a car along an east-west street. */
const QUARTER_TURN = Math.PI / 2;

export const TOWN_MAP: TownMapSpec = {
  // One world unit per track tile. The orthographic window shows a fixed
  // ~5.3 units around the car, so the doubled town draws no more per frame
  // than the 6x6 did - only what is on screen counts.
  tileSize: 1,
  rows: [
    '######PPPP',
    '#PP#L#PPPP',
    '#LL#L#PPPP',
    '#LL#L#PPPP',
    '#LL#L#PPPP',
    '##########',
    'PPPPP#LLL#',
    'PPPPP#LWL#',
    'PPPPP#LLL#',
    'PPPPP#####',
  ],
  // Eight models across fourteen lots, each named rather than cycled by index:
  // the house on a lot decides the wall its kerb can offer a parked car, so
  // the choice is authored data the placement rules can be tested against. The
  // second block's four use four more distinct silhouettes so the far side of
  // the junction reads as its own neighbourhood.
  houses: [
    { id: 'house-1', tile: { x: 1, y: 2 }, facing: 'west', model: 'type-a' },
    { id: 'house-2', tile: { x: 2, y: 2 }, facing: 'east', model: 'type-b' },
    { id: 'house-3', tile: { x: 1, y: 3 }, facing: 'west', model: 'type-c' },
    { id: 'house-4', tile: { x: 2, y: 3 }, facing: 'east', model: 'type-d' },
    { id: 'house-5', tile: { x: 1, y: 4 }, facing: 'south', model: 'type-f' },
    { id: 'house-6', tile: { x: 2, y: 4 }, facing: 'east', model: 'type-h' },
    { id: 'house-7', tile: { x: 4, y: 1 }, facing: 'north', model: 'type-q' },
    { id: 'house-8', tile: { x: 4, y: 2 }, facing: 'east', model: 'type-r' },
    { id: 'house-9', tile: { x: 4, y: 3 }, facing: 'east', model: 'type-a' },
    { id: 'house-10', tile: { x: 4, y: 4 }, facing: 'south', model: 'type-b' },
    { id: 'house-11', tile: { x: 7, y: 6 }, facing: 'north', model: 'type-c' },
    { id: 'house-12', tile: { x: 8, y: 6 }, facing: 'east', model: 'type-q' },
    { id: 'house-13', tile: { x: 6, y: 7 }, facing: 'west', model: 'type-h' },
    { id: 'house-14', tile: { x: 8, y: 7 }, facing: 'east', model: 'type-f' },
  ],
  // Offsets nudge props to the kerb of the street they belong to.
  //
  // Three of them also step *along* that kerb to the corner of their lot, so a
  // parked car can share the street: a car occupies its tile's centre, and a
  // prop at the lot's centre sits exactly where the car's body goes. Moving the
  // prop 0.45 along the kerb leaves 0.045 of daylight between the two, which is
  // what lets the pole on lot (1,2) and the cones on (1,3) and (2,2) keep the
  // kerbs they were authored for instead of being pushed onto kerbs no car can
  // use.
  props: [
    { kind: 'cone', tile: { x: 2, y: 2 }, offset: { x: 0.35, y: -0.45 } },
    { kind: 'cone', tile: { x: 1, y: 3 }, offset: { x: -0.35, y: 0.45 } },
    { kind: 'cone', tile: { x: 4, y: 2 }, offset: { x: 0.35, y: 0 } },
    { kind: 'cone', tile: { x: 2, y: 4 }, offset: { x: 0, y: 0.35 } },
    { kind: 'powerPole', tile: { x: 1, y: 2 }, offset: { x: -0.3, y: -0.45 } },
    { kind: 'powerPole', tile: { x: 4, y: 3 }, offset: { x: 0.3, y: 0 } },
    { kind: 'powerPole', tile: { x: 1, y: 4 }, offset: { x: -0.3, y: 0 } },
    { kind: 'tree', tile: { x: 1, y: 1 }, offset: { x: 0.2, y: 0.2 } },
    { kind: 'tree', tile: { x: 2, y: 1 }, offset: { x: -0.2, y: 0.2 } },
    // The park's trash landmark (FR1): south-east corner of the east park
    // tile, clear of the tree, the litter slots and spot-dumpster's corner.
    { kind: 'dumpster', tile: { x: 2, y: 1 }, offset: { x: 0.3, y: 0.3 } },

    // The second block's gardens (FR2): one orchard tree per green lot ringing
    // the pond, so the far side of the junction reads planted, not empty.
    { kind: 'tree', tile: { x: 6, y: 8 }, offset: { x: 0.2, y: 0.2 } },
    { kind: 'tree', tile: { x: 7, y: 8 }, offset: { x: 0.2, y: 0.2 } },
    { kind: 'tree', tile: { x: 8, y: 8 }, offset: { x: 0.2, y: 0.2 } },

    // Four parked cars (FR1, FR10), authored on the *street* tile and offset
    // toward the kerb they sit against, with a yaw that lies them along that
    // street.
    //
    // Each one is on a kerb whose house wall measures at least 0.652 from the
    // street's centre line (`1.00 - fitted depth / 2`), because that is the
    // narrowest wall a car fitted to `PARKED_CAR_FIT` can clear while keeping
    // its inner edge out of the lane. Two kerbs in town cannot host a car at
    // any offset - beside house-8 (type-r, wall 0.574) and house-5 (type-f,
    // 0.576) - and the roomiest kerb of all (0.748) is the puppy's hiding
    // place, so neither is used here.
    //
    // Six cars shipped in the parked-cars track; the light-wandering-traffic
    // track spends lever one from `tech-stack.md` - "four cars on the four
    // roomiest kerbs" - so the two tightest went (house-1's kerb at a 0.038
    // gap, house-3's at 0.071) and these four stand at the largest gaps (0.074
    // to 0.147). Their freed kerbs rejoined the park mission's litter draw,
    // which now gets (1,2), (1,3), (2,4), (4,2), (4,3) and (4,4) to choose
    // three from - only (4,1) is still taken here. Phase 6 redistributes all
    // six across the two rings.
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
  // The puppy's hiding places (FR6): behind the park trees, beside the
  // dumpster's corner, at a house's garden kerb, on the far verge - and now
  // three in the second district so the puppy roams both loops. Each sits on a
  // non-road tile the town's own pathing can reach. Authored here rather than
  // scattered so every hiding place reads as a place (there is a reason the
  // puppy chose *that* spot), while the draw still varies run to run.
  //
  // The two park hides put the pup behind a tree and the dumpster, where the
  // camera genuinely loses it. The two lot spots sit on the *kerb* of the
  // street their house faces - `house-4` faces east onto the cross street,
  // `house-5` south onto the ring road - outside the house's capped footprint
  // and within a car's reach of the road (`mission/puppySpots.ts` re-derives
  // those two rules per spot and its tests hold every spot to them).
  hidingSpots: [
    // Park hides: open grass with the tree and the dumpster between the pup
    // and the camera, so "hidden" is honest here.
    { id: 'spot-trees', tile: { x: 1, y: 1 }, offset: { x: -0.3, y: -0.3 } },
    { id: 'spot-dumpster', tile: { x: 2, y: 1 }, offset: { x: 0.3, y: -0.3 } },
    // Lot spots: the kerb of the street each house faces.
    { id: 'spot-garden', tile: { x: 2, y: 3 }, offset: { x: 0.48, y: 0.25 } },
    { id: 'spot-verge', tile: { x: 1, y: 4 }, offset: { x: 0.2, y: 0.48 } },
    // Second-district hides, all on houseless green so no footprint can ever
    // crowd them: the pond's edge, behind the orchard tree, and the far lawn.
    { id: 'spot-pond', tile: { x: 7, y: 7 }, offset: { x: 0, y: 0.4 } },
    { id: 'spot-orchard', tile: { x: 6, y: 8 }, offset: { x: -0.3, y: -0.3 } },
    { id: 'spot-lawn', tile: { x: 8, y: 8 }, offset: { x: 0.3, y: -0.3 } },
  ],

  // The park mission's fixed litter layout (FR6): five pieces at fixed
  // readable slots - three on the west park tile, two on the east - kept clear
  // of the two authored trees (offsets ±0.2). The park is the mission's focal
  // point, so its layout reads the same every round; only the three kerbside
  // lots are drawn from the seed. Keyed to `P` tiles only: the pond green is
  // its own tile kind, so the layout can never drift onto it.
  parkSlots: [
    {
      tile: { x: 1, y: 1 },
      slots: [
        { x: -0.3, y: -0.35 },
        { x: 0.35, y: -0.3 },
        { x: -0.3, y: 0.35 },
      ],
    },
    {
      tile: { x: 2, y: 1 },
      slots: [
        { x: 0.3, y: -0.35 },
        { x: -0.35, y: -0.3 },
      ],
    },
  ],

  // Four vehicles, two per district (FR9), so both halves read as one town
  // from the first second: the old cross street and north ring, the new loop's
  // north edge and south edge.
  spawnPoints: [
    { x: 3, y: 2 },
    { x: 1, y: 0 },
    { x: 7, y: 5 },
    { x: 7, y: 9 },
  ],
};
