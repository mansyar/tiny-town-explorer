import { describe, expect, it } from 'vitest';
import { createTownGrid } from './townGrid';
import { TOWN_MAP } from './townMap';
import {
  isParkedCarKind,
  PARKED_CAR_EXTENTS,
  PARKED_CAR_FIT,
  PARKED_CAR_KERB_OFFSET,
  PARKED_CAR_KINDS,
  parkedCarHalfExtents,
} from './townTypes';

/**
 * The parked cars' data contract (FR1, FR2, FR9).
 *
 * These tests hold the *shape* of the authored town and of what the grid
 * publishes for a parked car — how many, which models, where along the kerb,
 * and the footprint collision will box. Phase 1's placement task then tests the
 * clearance contracts on top of it; this file deliberately asserts nothing
 * about whether a given kerb is safe.
 */

const grid = createTownGrid(TOWN_MAP);
const parked = grid.props.filter((prop) => isParkedCarKind(prop.kind));

/** Authored offset from the street tile's centre, in world units. */
function kerbOffset(prop: (typeof parked)[number]): { x: number; z: number } {
  const centre = grid.tileToWorld(prop.tile);
  return { x: prop.position.x - centre.x, z: prop.position.z - centre.z };
}

describe('parked cars in the authored town', () => {
  it('parks six cars (FR1)', () => {
    expect(parked).toHaveLength(6);
  });

  it('draws them from four distinct Car Kit models (FR1)', () => {
    expect(new Set(parked.map((prop) => prop.kind)).size).toBe(4);
  });

  it('parks every one of them on a street tile, at the kerb', () => {
    for (const prop of parked) {
      expect(grid.isRoad(prop.tile)).toBe(true);
      const offset = kerbOffset(prop);
      // One axis carries the kerb offset, the other sits on the centre line.
      expect(Math.max(Math.abs(offset.x), Math.abs(offset.z))).toBeCloseTo(
        PARKED_CAR_KERB_OFFSET,
        6,
      );
      expect(Math.min(Math.abs(offset.x), Math.abs(offset.z))).toBeCloseTo(0, 6);
    }
  });

  it('authors a yaw that is a quarter turn, so the hitbox stays axis-aligned (FR5)', () => {
    for (const prop of parked) {
      expect(prop.yaw).toBeDefined();
      const quarters = (prop.yaw ?? 0) / (Math.PI / 2);
      expect(Number.isInteger(quarters)).toBe(true);
    }
  });

  it('publishes a footprint whose extents swap with the yaw (FR9)', () => {
    for (const prop of parked) {
      const kind = prop.kind;
      if (!isParkedCarKind(kind)) throw new Error('unreachable');
      const { halfLength, halfWidth } = parkedCarHalfExtents(kind);
      const sideways = Math.abs(Math.sin(prop.yaw ?? 0)) > 0.5;
      expect(prop.footprint?.halfX).toBeCloseTo(sideways ? halfLength : halfWidth, 6);
      expect(prop.footprint?.halfZ).toBeCloseTo(sideways ? halfWidth : halfLength, 6);
    }
  });

  it('parks two of the six cars facing the other way, so the street is not a parade', () => {
    const yaws = parked.map((prop) => prop.yaw ?? 0);
    expect(new Set(yaws).size).toBeGreaterThan(1);
  });

  it('gives parked cars a footprint instead of a circle radius (FR5)', () => {
    for (const prop of parked) {
      expect(prop.collisionRadius).toBeUndefined();
      expect(prop.footprint).toBeDefined();
    }
  });
});

describe('parked-car model data', () => {
  it('measures every parked kind, longer than it is wide', () => {
    for (const kind of PARKED_CAR_KINDS) {
      const extents = PARKED_CAR_EXTENTS[kind];
      expect(extents.length).toBeGreaterThan(extents.width);
    }
  });

  it('derives half extents from the fit, never scaling a model up', () => {
    for (const kind of PARKED_CAR_KINDS) {
      const { halfLength, halfWidth } = parkedCarHalfExtents(kind);
      expect(halfLength).toBeCloseTo(PARKED_CAR_FIT / 2, 6);
      // A fitted car is smaller than its player, and wider than nothing.
      expect(halfWidth).toBeGreaterThan(0);
      expect(halfWidth).toBeLessThan(halfLength);
    }
  });

  it('keeps the sedan the widest model, so one half-width bound covers the fleet', () => {
    const widest = Math.max(
      ...PARKED_CAR_KINDS.map((kind) => parkedCarHalfExtents(kind).halfWidth),
    );
    const sedan = parkedCarHalfExtents('parkedSedan');
    expect(sedan.halfWidth).toBeCloseTo(widest, 6);
  });

  it('treats only the parked kinds as parked', () => {
    expect(isParkedCarKind('cone')).toBe(false);
    expect(isParkedCarKind('dumpster')).toBe(false);
    expect(isParkedCarKind('tree')).toBe(false);
    for (const kind of PARKED_CAR_KINDS) {
      expect(isParkedCarKind(kind)).toBe(true);
    }
  });
});

describe('the props that were already there', () => {
  it('keeps their authored kinds and circle radii, untouched by the parked cars', () => {
    const circles = grid.props.filter((prop) => !isParkedCarKind(prop.kind));
    expect(circles.map((prop) => prop.kind)).toEqual([
      'cone',
      'cone',
      'cone',
      'cone',
      'powerPole',
      'powerPole',
      'powerPole',
      'tree',
      'tree',
      'dumpster',
    ]);
    for (const prop of circles) {
      expect(prop.collisionRadius).toBeGreaterThan(0);
      expect(prop.footprint).toBeUndefined();
    }
  });
});
