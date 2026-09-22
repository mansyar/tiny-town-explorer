import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { sunGroundOffset } from '../scene';
import type { TownGrid } from './townGrid';
import {
  isParkedCarKind,
  PARKED_CAR_SEAT_HEIGHT,
  parkedCarFittedHeight,
} from './townTypes';

/**
 * How dark a parked car's blob shadow is drawn.
 *
 * The houses carry real shadow-map shadows, and this is what has to sit in the
 * same family: a shadowed patch of ground keeps only the hemisphere fill, so a
 * translucent dark quad at this opacity reads like the same lighting rather
 * than like a decal.
 */
export const PARKED_SHADOW_OPACITY = 0.3;

/**
 * How far above the kerb top the blobs sit, in world units.
 *
 * A parked car is seated at {@link PARKED_CAR_SEAT_HEIGHT} and its footprint
 * crosses lawn (0.00), asphalt (+0.01) and kerb top (+0.02), so a blob at the
 * kerb top plus a hair clears all three and cannot z-fight with the ground it
 * lies on.
 */
export const PARKED_SHADOW_LIFT = 0.004;

/**
 * The shadowed-ground tone: dark, and cool-green rather than neutral black so
 * it belongs to the same daylight the houses are lit by.
 */
const PARKED_SHADOW_COLOR = 0x24332a;

/** One blob: where it sits and how far it reaches, in world units. */
export interface ParkedShadowQuad {
  readonly center: { readonly x: number; readonly z: number };
  readonly halfX: number;
  readonly halfZ: number;
}

/** The mounted blobs plus the teardown for the geometry they own. */
export interface ParkedShadowMount {
  readonly mesh: Mesh;
  /** Frees the merged geometry and its material. */
  dispose(): void;
}

/**
 * Where each parked car's blob sits, derived from the car's own footprint and
 * the sun's ground direction (FR7).
 *
 * A box's real shadow is its footprint together with that footprint shifted
 * away from the sun, so the blob is the box around those two: centred half way
 * down the offset, and reaching half the offset further along each axis. That
 * makes the visible part read as a shadow *stretching* away from the sun rather
 * than a puddle under the car, and it costs one quad per car.
 *
 * The height is the model's fitted height, measured rather than assumed: a tall
 * van throws its shadow further than a low hatchback, and using one number for
 * both would put one of the six blobs visibly in the wrong place.
 */
export function parkedShadowQuads(grid: TownGrid): readonly ParkedShadowQuad[] {
  const quads: ParkedShadowQuad[] = [];
  for (const prop of grid.props) {
    // Only parked cars publish a footprint (FR5): what carries one is exactly
    // what needs a faked shadow, so nothing here has to re-derive the shapes.
    const footprint = prop.footprint;
    if (footprint === undefined || !isParkedCarKind(prop.kind)) {
      // Only a parked car can carry a footprint (FR5) — the grid derives it from
      // `parkedCarFootprint` — so the kind check is the type system's way of
      // saying what the data already guarantees, not a second filter.
      continue;
    }
    const offset = sunGroundOffset(grid.tileSize * parkedCarFittedHeight(prop.kind));
    quads.push({
      center: {
        x: prop.position.x + offset.x / 2,
        z: prop.position.z + offset.z / 2,
      },
      halfX: footprint.halfX + Math.abs(offset.x) / 2,
      halfZ: footprint.halfZ + Math.abs(offset.z) / 2,
    });
  }
  return quads;
}

/**
 * Merges every parked car's blob into one static mesh: one draw call and 12
 * triangles for six cars, rather than six draw calls for four times nothing
 * (FR7).
 *
 * The cars stay out of the shadow-map pass for the same reason they get blobs:
 * six more shadow casters in a 1024 map would cost re-rendering the town six
 * more times per frame, which the performance-floor device cannot afford.
 *
 * Returns `undefined` when the town has no parked cars, so the caller can add
 * whatever it gets without a special case.
 */
export function mountParkedShadows(grid: TownGrid): ParkedShadowMount | undefined {
  const quads = parkedShadowQuads(grid);
  if (quads.length === 0) {
    return undefined;
  }

  const y = grid.tileSize * PARKED_CAR_SEAT_HEIGHT + PARKED_SHADOW_LIFT;
  const positions = new Float32Array(quads.length * 4 * 3);
  const indices: number[] = [];
  quads.forEach((quad, index) => {
    const corners: readonly (readonly [number, number])[] = [
      [quad.center.x - quad.halfX, quad.center.z - quad.halfZ],
      [quad.center.x + quad.halfX, quad.center.z - quad.halfZ],
      [quad.center.x + quad.halfX, quad.center.z + quad.halfZ],
      [quad.center.x - quad.halfX, quad.center.z + quad.halfZ],
    ];
    corners.forEach(([x, z], corner) => {
      positions.set([x, y, z], (index * 4 + corner) * 3);
    });
    const base = index * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new MeshBasicMaterial({
    color: PARKED_SHADOW_COLOR,
    transparent: true,
    opacity: PARKED_SHADOW_OPACITY,
    // Flat on the ground and only ever seen from above, so culling earns
    // nothing here — while a wrong winding would silently hide every blob.
    side: DoubleSide,
    // A translucent quad that wrote depth would punch holes in whatever is
    // drawn after it, including the car standing on it.
    depthWrite: false,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = 'parkedCarShadows';
  // Shadow-map work is exactly what the blobs exist to avoid, and a blob that
  // received shadows would double-darken where a house's shadow crosses it.
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return {
    mesh,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
