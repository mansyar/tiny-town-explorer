import { describe, expect, it } from 'vitest';
import { createTownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import { DIRECTION_STEPS, isParkedCarKind } from '../town/townTypes';
import {
  declaredKerbs,
  declaredKerbViolations,
  kerbEdgesOfPoint,
  kerbKey,
  parkedCarKerbEdges,
  takenKerbKeys,
} from './kerbReservation';

/**
 * The kerb reservation across the missions (FR8).
 *
 * Phase 1 authored six parked cars onto kerbs, and two missions were already
 * using those same kerbs: the park mission lays litter on ring-road lots and the
 * puppy hides by two houses' kerbs. Nothing in the code recorded that, so
 * "which kerb has the town spoken for" had to be re-derived by reading two
 * modules. This suite holds the single answer.
 *
 * The cross-cutting half — that no mission item ever ends up inside a parked
 * car, across every mission and many seeds — is `kerbInvariant.test.ts`.
 */

const grid = createTownGrid(TOWN_MAP);
const parked = grid.props.filter((prop) => isParkedCarKind(prop.kind));

describe('the kerb band', () => {
  it('reads the kerb a point stands on from its position alone', () => {
    // The suv parks on the cross street, 0.46 west of the lane's centre line.
    const suv = grid.props.find((prop) => prop.kind === 'parkedSuv');
    expect(suv).toBeDefined();
    if (suv === undefined) {
      return;
    }

    const edges = kerbEdgesOfPoint(grid, suv.position);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ road: suv.tile, toward: 'west' });
  });

  it('ignores the driving surface and open ground', () => {
    // The lane's own centre line is road, not kerb.
    const centre = grid.tileToWorld({ x: 3, y: 2 });
    expect(kerbEdgesOfPoint(grid, centre)).toEqual([]);
    // And a lot's middle is nobody's kerb.
    const lot = grid.tileToWorld({ x: 2, y: 2 });
    expect(kerbEdgesOfPoint(grid, lot)).toEqual([]);
  });

  it('reports every band a point stands in, nearest first', () => {
    // A corner slot of the park is in two bands at once: 0.65 from the north
    // ring road's centre line and 0.70 from the west ring road's. Both kerbs
    // would collide with it, so both are reported, nearest first.
    const edges = kerbEdgesOfPoint(grid, { x: -3.8, z: -3.85 });

    expect(edges).toHaveLength(2);
    expect(edges[0]).toEqual({ road: { x: 1, y: 0 }, toward: 'south' });
    expect(edges[1]).toEqual({ road: { x: 0, y: 1 }, toward: 'east' });
  });
});

describe('the missions’ declared kerbs', () => {
  it('declares the park mission’s two north-edge slots, from its own layout', () => {
    const declared = declaredKerbs(grid).filter((kerb) => kerb.owner === 'park-litter');
    const keys = declared.map((kerb) => kerbKey(kerb.edge));

    // The two slots 0.65 from the north ring road's centre line, one over each
    // park tile — derived from the authored slot offsets, never hand-listed.
    expect(keys).toContain(kerbKey({ road: { x: 1, y: 0 }, toward: 'south' }));
    expect(keys).toContain(kerbKey({ road: { x: 2, y: 0 }, toward: 'south' }));
  });

  it('declares both kerbside puppy spots', () => {
    const keys = declaredKerbs(grid)
      .filter((kerb) => kerb.owner === 'puppy')
      .map((kerb) => kerbKey(kerb.edge));

    // spot-garden hugs lot (2,3)'s cross-street kerb, spot-verge lot (1,4)'s
    // ring-road kerb. The two park spots also stand in kerb bands — but on park
    // tiles, where no car can ever park, so they claim nothing a car wants.
    expect(keys).toEqual(
      expect.arrayContaining([
        kerbKey({ road: { x: 3, y: 3 }, toward: 'west' }),
        kerbKey({ road: { x: 1, y: 5 }, toward: 'north' }),
      ]),
    );
  });

  it('claims no lot-facing kerb except the puppy’s lot spots', () => {
    // Over-declaring is not harmless: every declared lot kerb is one fewer lot
    // the litter draw may send the kid down, and the draw's variety is the whole
    // point of it. Only the puppy's lot-side spots face a lot - its two park
    // hides stand in no band at all.
    const lotFacing = declaredKerbs(grid).filter((kerb) => {
      const step = DIRECTION_STEPS[kerb.edge.toward];
      const facing = {
        x: kerb.edge.road.x + step.x,
        y: kerb.edge.road.y + step.y,
      };
      return grid.tileAt(facing) === 'lot';
    });

    expect(lotFacing.map((kerb) => kerbKey(kerb.edge)).sort()).toEqual(
      [
        kerbKey({ road: { x: 1, y: 5 }, toward: 'north' }),
        kerbKey({ road: { x: 3, y: 3 }, toward: 'west' }),
        kerbKey({ road: { x: 5, y: 8 }, toward: 'east' }),
        kerbKey({ road: { x: 9, y: 8 }, toward: 'west' }),
      ].sort(),
    );
  });

  it('reports an edge once, however many items stand near it', () => {
    // The park's corner slots and the puppy's park spots really do share two
    // kerbs, and taking a kerb twice has to be free: `takenKerbKeys` is a set.
    const declared = declaredKerbs(grid).map((kerb) => kerbKey(kerb.edge));
    const taken = takenKerbKeys(grid);
    for (const key of declared) {
      expect(taken.has(key)).toBe(true);
    }
    expect(taken.size).toBeLessThan(declared.length);
  });

  it('leaves the shipped authoring alone: no parked car stands on a declared kerb', () => {
    expect(declaredKerbViolations(grid)).toEqual([]);
  });

  it('rejects a car authored onto a declared kerb', () => {
    // The puppy's kerb on lot (2,3): a car there would sit where a pup hides.
    const clash = createTownGrid({
      ...TOWN_MAP,
      props: [
        ...TOWN_MAP.props,
        { kind: 'parkedVan', tile: { x: 3, y: 3 }, offset: { x: -0.46, y: 0 }, yaw: 0 },
      ],
    });

    const violations = declaredKerbViolations(clash);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.owner).toBe('puppy');
    expect(violations[0]?.propId).toBe('parkedVan-2');
  });
});

describe('kerbs the cars occupy', () => {
  it('gives every parked car exactly one kerb, and no two the same', () => {
    const edges = parkedCarKerbEdges(grid);
    expect(edges).toHaveLength(parked.length);
    const keys = edges.map((entry) => kerbKey(entry.edge));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('takes a kerb when either the cars or the missions have spoken for it', () => {
    const taken = takenKerbKeys(grid);
    for (const entry of parkedCarKerbEdges(grid)) {
      expect(taken.has(kerbKey(entry.edge))).toBe(true);
    }
    for (const kerb of declaredKerbs(grid)) {
      expect(taken.has(kerbKey(kerb.edge))).toBe(true);
    }
  });
});
