import { Mesh, type MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SUN_POSITION, sunGroundOffset } from '../scene';
import {
  mountParkedShadows,
  PARKED_SHADOW_LIFT,
  type ParkedShadowMount,
  type ParkedShadowQuad,
  parkedShadowQuads,
} from './parkedShadows';
import { createTownGrid } from './townGrid';
import { TOWN_MAP } from './townMap';
import {
  isParkedCarKind,
  PARKED_CAR_SEAT_HEIGHT,
  type ParkedCarKind,
  parkedCarFittedHeight,
} from './townTypes';

const grid = createTownGrid(TOWN_MAP);
const cars = grid.props.filter((prop) => prop.footprint !== undefined);
const quads = parkedShadowQuads(grid);

/** The blob belonging to the car at `index`, so a test can assert the pair. */
function quadAt(index: number): ParkedShadowQuad {
  const quad = quads[index];
  if (quad === undefined) {
    throw new Error(`no blob for car ${index}`);
  }
  return quad;
}

/** The mounted blobs, failing loudly rather than silently skipping asserts. */
function mountOrThrow(): ParkedShadowMount {
  const mount = mountParkedShadows(grid);
  if (mount === undefined) {
    throw new Error('the town parks cars, so it must mount blobs');
  }
  return mount;
}

/** The offset the sun's direction and this car's own fitted height imply. */
function offsetFor(kind: ParkedCarKind): { x: number; z: number } {
  return sunGroundOffset(grid.tileSize * parkedCarFittedHeight(kind));
}

/** The union of a car's footprint and the same footprint shifted by the sun. */
function shadowBox(kind: ParkedCarKind, footprint: { halfX: number; halfZ: number }) {
  const offset = offsetFor(kind);
  return {
    halfX: footprint.halfX + Math.abs(offset.x) / 2,
    halfZ: footprint.halfZ + Math.abs(offset.z) / 2,
  };
}

describe('parkedShadowQuads (FR7)', () => {
  it('gives every parked car exactly one blob and nothing else one', () => {
    expect(cars.length).toBeGreaterThan(0);
    expect(quads).toHaveLength(cars.length);
  });

  it('places each blob where the sun would throw it, not under the car', () => {
    // The failure this guards is the one that reads as a hole: a blob centred on
    // its car contradicts every house's real shadow. Half the offset is the
    // centre of the car's footprint unioned with its sun-shifted copy.
    cars.forEach((car, index) => {
      const offset = offsetFor(car.kind as ParkedCarKind);
      const quad = quadAt(index);
      expect(quad.center.x).toBeCloseTo(car.position.x + offset.x / 2, 6);
      expect(quad.center.z).toBeCloseTo(car.position.z + offset.z / 2, 6);
    });
  });

  it('throws every shadow away from the sun, never toward it', () => {
    // A sign slip here is invisible in the numbers above (the magnitude is
    // right either way) and glaring on screen, so the direction is asserted
    // against the sun itself rather than against a hard-coded vector.
    for (const car of cars) {
      const offset = offsetFor(car.kind as ParkedCarKind);
      expect(offset.x * SUN_POSITION.x + offset.z * SUN_POSITION.z).toBeLessThan(0);
      // 1.2 and 0.9 units of shadow per unit of height: the sun's own tilt.
      const height = grid.tileSize * parkedCarFittedHeight(car.kind as ParkedCarKind);
      expect(Math.abs(offset.x)).toBeCloseTo(1.2 * height, 6);
      expect(Math.abs(offset.z)).toBeCloseTo(0.9 * height, 6);
    }
  });

  it('stretches each blob along the sun by the offset, one quad per car', () => {
    cars.forEach((car, index) => {
      const footprint = car.footprint as { halfX: number; halfZ: number };
      const expected = shadowBox(car.kind as ParkedCarKind, footprint);
      const quad = quadAt(index);
      expect(quad.halfX).toBeCloseTo(expected.halfX, 6);
      expect(quad.halfZ).toBeCloseTo(expected.halfZ, 6);
      // Longer than the car it belongs to, or it is not stretched at all.
      expect(quad.halfX).toBeGreaterThan(footprint.halfX);
      expect(quad.halfZ).toBeGreaterThan(footprint.halfZ);
    });
  });

  it('measures the height per model, so a tall car throws a longer shadow', () => {
    const van = parkedCarFittedHeight('parkedVan');
    const hatchback = parkedCarFittedHeight('parkedHatchback');
    expect(van).toBeGreaterThan(hatchback);
    // Both kinds park in this town, so the difference is on screen, not theory.
    const kinds = new Set(cars.map((car) => car.kind));
    expect(kinds.has('parkedVan')).toBe(true);
    expect(kinds.has('parkedHatchback')).toBe(true);
  });
});

describe('mountParkedShadows (FR7)', () => {
  it('merges every blob into one mesh of two triangles per car', () => {
    const mount = mountOrThrow();
    // One draw call for the whole fleet: one quad per car, two triangles each.
    expect(mount.mesh).toBeInstanceOf(Mesh);
    expect(mount.mesh.geometry.getAttribute('position').count).toBe(cars.length * 4);
    expect(mount.mesh.geometry.getIndex()?.count).toBe(cars.length * 6);
    expect(mount.mesh.material).not.toBeInstanceOf(Array);
    mount.dispose();
  });

  it('never casts or receives a shadow, which is the cost it exists to avoid', () => {
    const mount = mountOrThrow();
    expect(mount.mesh.castShadow).toBe(false);
    expect(mount.mesh.receiveShadow).toBe(false);
    mount.dispose();
  });

  it('sits just above the kerb top the cars are seated on, without z-fighting', () => {
    const mount = mountOrThrow();
    const positions = mount.mesh.geometry.getAttribute('position').array as Float32Array;
    const seat = grid.tileSize * PARKED_CAR_SEAT_HEIGHT;
    expect(positions.length).toBe(cars.length * 4 * 3);
    for (let i = 1; i < positions.length; i += 3) {
      expect(positions[i]).toBeCloseTo(seat + PARKED_SHADOW_LIFT, 6);
      // Strictly above the kerb top and the asphalt, or it could not be seen.
      expect(positions[i]).toBeGreaterThan(seat);
    }
    mount.dispose();
  });

  it('carries no prop identity, so collision and taps cannot find it', () => {
    // The blobs are drawn ground, not town furniture: nothing in the obstacle
    // set or the input router may be able to reach them (FR7).
    const mount = mountOrThrow();
    expect(mount.mesh.userData.propId).toBeUndefined();
    expect(grid.props.some((prop) => prop.id === mount.mesh.name)).toBe(false);
    mount.dispose();
  });

  it('mounts nothing at all in a town with no parked cars', () => {
    const empty = { props: [], tileSize: 1 } as unknown as typeof grid;
    expect(parkedShadowQuads(empty)).toHaveLength(0);
    expect(mountParkedShadows(empty)).toBeUndefined();
  });

  it('draws with the darkened-ground material, not a lit one', () => {
    const material = mountOrThrow().mesh.material as MeshBasicMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('frees its geometry and material on teardown', () => {
    const mount = mountOrThrow();
    const geometry = mount.mesh.geometry;
    const material = mount.mesh.material as MeshBasicMaterial;
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    mount.dispose();

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});

describe('the town this track ships', () => {
  it('parks only cars that publish a footprint, so every blob has a box under it', () => {
    for (const car of cars) {
      expect(isParkedCarKind(car.kind)).toBe(true);
      // A blob is derived from the collision box, so the two cannot disagree
      // about where the car is.
      expect(car.footprint).toBeDefined();
    }
  });
});
