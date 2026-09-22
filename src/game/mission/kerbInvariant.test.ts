import { describe, expect, it } from 'vitest';
import { createTownGrid, type TownProp } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import { isParkedCarKind, type Vec2 } from '../town/townTypes';
import {
  declaredKerbs,
  kerbEdgesOfPoint,
  kerbKey,
  parkedCarKerbEdges,
} from './kerbReservation';
import { spawnParkLitter } from './parkLitter';
import { createPuppySpots, isScoopable } from './puppySpots';

/**
 * The town-wide invariant: no mission item ever lands inside a parked car (FR8).
 *
 * This is the cross-cutting half of the reservation — `kerbReservation.test.ts`
 * holds the rule itself, and this suite walks the shipped town through every
 * mission that places something, across many seeds, to check the rule survives
 * contact with all of them at once. It is the test that would have caught the
 * litter draw putting a bag of rubbish inside a parked car.
 */

const grid = createTownGrid(TOWN_MAP);
const parked = grid.props.filter((prop) => isParkedCarKind(prop.kind));
const spots = createPuppySpots({ grid }).spots;

/** A tiny deterministic PRNG, so "many seeds" is still reproducible. */
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

/** Whether a point lies inside a parked car's footprint, exactly. */
function insideFootprint(prop: TownProp, point: Vec2): boolean {
  const footprint = prop.footprint;
  if (footprint === undefined) {
    return false;
  }
  return (
    Math.abs(point.x - prop.position.x) <= footprint.halfX &&
    Math.abs(point.z - prop.position.z) <= footprint.halfZ
  );
}

/**
 * Every world position a mission places or aims at, across many seeds.
 *
 * Litter is the only seeded one; the rest are fixed and listed so the invariant
 * covers what the town actually carries rather than only the newest system: the
 * puppy's spots, the houses the fire, ice-cream and puppy missions all aim at,
 * and the park's own props.
 */
function everyMissionItem(): readonly { readonly what: string; readonly point: Vec2 }[] {
  const items: { what: string; point: Vec2 }[] = [];
  for (let seed = 0; seed < 40; seed++) {
    for (const piece of spawnParkLitter({ grid, random: seeded(seed) })) {
      items.push({ what: `seed ${seed} ${piece.id}`, point: piece.position });
    }
  }
  for (const spot of spots) {
    items.push({ what: spot.id, point: spot.position });
  }
  for (const house of grid.houses) {
    // The fire mission burns a house, the ice-cream mission serves one and the
    // puppy's owner lives in one: all three aim at the lot centre, which is
    // also where the order marker floats.
    items.push({ what: house.id, point: house.position });
  }
  for (const prop of grid.props.filter((candidate) => !isParkedCarKind(candidate.kind))) {
    items.push({ what: prop.id, point: prop.position });
  }
  return items;
}

describe('no mission item inside a parked car (FR8)', () => {
  it('never places any mission item inside a parked car, across seeds', () => {
    for (const item of everyMissionItem()) {
      for (const car of parked) {
        expect(insideFootprint(car, item.point), `${item.what} is inside ${car.id}`).toBe(
          false,
        );
      }
    }
  });

  it('keeps every kerbside litter piece on a kerb no car occupies, across seeds', () => {
    const carKeys = new Set(parkedCarKerbEdges(grid).map((entry) => kerbKey(entry.edge)));
    for (let seed = 0; seed < 40; seed++) {
      const pieces = spawnParkLitter({ grid, random: seeded(seed) });
      for (const piece of pieces) {
        if (grid.tileAt(piece.tile) === 'park') {
          continue;
        }
        const edges = kerbEdgesOfPoint(grid, piece.position);
        expect(edges.length, `seed ${seed}: ${piece.id} sits on a kerb`).toBeGreaterThan(
          0,
        );
        for (const edge of edges) {
          expect(
            carKeys.has(kerbKey(edge)),
            `seed ${seed}: ${piece.id} shares a kerb with a parked car`,
          ).toBe(false);
        }
      }
    }
  });

  it('leaves every puppy spot scoopable with the cars present', () => {
    // Two different rules keep this true, and it is worth naming which does
    // what: the reservation keeps cars off the kerbs the two lot spots sit on,
    // and crashability (FR5) means a car anywhere else can never wall a spot in
    // — `isScoopable` samples buildings alone.
    const declared = new Set(declaredKerbs(grid).map((kerb) => kerbKey(kerb.edge)));
    for (const spot of spots) {
      expect(isScoopable(grid, spot.position), `${spot.id} is reachable`).toBe(true);
      for (const edge of kerbEdgesOfPoint(grid, spot.position)) {
        expect(declared.has(kerbKey(edge)), `${spot.id}'s kerb is declared`).toBe(true);
      }
    }
  });
});
