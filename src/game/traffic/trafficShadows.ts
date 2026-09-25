import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { sunGroundOffset } from '../scene';
import type { TownGrid } from '../town/townGrid';
import { ROAD_SURFACE_HEIGHT } from '../vehicle/vehicleActor';
import { type TrafficSystem, trafficActorFittedHeight } from './trafficSystem';

/**
 * Following blob shadows for the two wanderers (FR8).
 *
 * Exactly the parked cars' language (`parkedShadows`): a box's real shadow is
 * its footprint together with that footprint shifted away from the sun, so the
 * blob is the box around those two — one stretched quad per car, centred half
 * way down the sun offset. The difference is that these blobs follow: both
 * quads live in one merged mesh whose vertices are rewritten every frame, so
 * the whole town's moving shadows cost one draw call.
 *
 * The blobs stay out of collision, taps and the shadow-map pass for the same
 * reason the parked blobs do: a blob is a picture of a shadow, not a thing.
 */

/** How dark a mover's blob is drawn — the parked cars' tone, one lighting family. */
export const TRAFFIC_SHADOW_OPACITY = 0.3;

/**
 * How far above the asphalt the blobs sit, in world units.
 *
 * The movers ride the road surface ({@link ROAD_SURFACE_HEIGHT}), so their
 * blobs clear that plus the same hair the parked blobs use above the kerb.
 */
export const TRAFFIC_SHADOW_LIFT = 0.004;

/** The shadowed-ground tone: the parked blobs' dark, cool green. */
const TRAFFIC_SHADOW_COLOR = 0x24332a;

/** One blob: where it sits and how far it reaches, in world units. */
export interface TrafficShadowQuad {
  readonly center: { readonly x: number; readonly z: number };
  readonly halfX: number;
  readonly halfZ: number;
}

/** The merged blobs plus the sync that follows the cars, and the teardown. */
export interface TrafficShadowMount {
  readonly mesh: Mesh;
  /** Slide the blobs under their cars — one write of the shared geometry. */
  sync(): void;
  /** Frees the merged geometry and its material. */
  dispose(): void;
}

/**
 * Where each mover's blob sits this frame, derived from its live footprint and
 * the sun's ground direction (FR8).
 *
 * The height is the model's fitted height per kind: the taller sedan throws
 * its shadow further than the lower hatchback, and one number for both would
 * put one of the two blobs visibly in the wrong place.
 */
export function trafficShadowQuads(
  grid: TownGrid,
  traffic: TrafficSystem,
): readonly TrafficShadowQuad[] {
  const poses = traffic.poses();
  const quads: TrafficShadowQuad[] = [];
  traffic.footprints().forEach((obstacle, index) => {
    const pose = poses[index];
    const shape = obstacle.shape;
    if (pose === undefined || shape.kind !== 'box') {
      // Footprints and poses publish as a pair; anything else is noise.
      return;
    }
    const offset = sunGroundOffset(grid.tileSize * trafficActorFittedHeight(pose.kind));
    quads.push({
      center: {
        x: shape.centre.x + offset.x / 2,
        z: shape.centre.z + offset.z / 2,
      },
      halfX: shape.halfX + Math.abs(offset.x) / 2,
      halfZ: shape.halfZ + Math.abs(offset.z) / 2,
    });
  });
  return quads;
}

/**
 * Merges both blobs into one dynamic mesh: one draw call and two triangles per
 * car, translated with their car every frame (FR8).
 *
 * Returns `undefined` when nothing is moving, so the caller can add whatever
 * it gets without a special case.
 */
export function mountTrafficShadows(
  grid: TownGrid,
  traffic: TrafficSystem,
): TrafficShadowMount | undefined {
  const quads = trafficShadowQuads(grid, traffic);
  if (quads.length === 0) {
    return undefined;
  }

  const y = grid.tileSize * ROAD_SURFACE_HEIGHT + TRAFFIC_SHADOW_LIFT;
  const positions = new Float32Array(quads.length * 4 * 3);
  const indices: number[] = [];
  for (let index = 0; index < quads.length; index++) {
    const base = index * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new BufferGeometry();
  const attribute = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', attribute);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const write = (): void => {
    trafficShadowQuads(grid, traffic).forEach((quad, index) => {
      const corners: readonly (readonly [number, number])[] = [
        [quad.center.x - quad.halfX, quad.center.z - quad.halfZ],
        [quad.center.x + quad.halfX, quad.center.z - quad.halfZ],
        [quad.center.x + quad.halfX, quad.center.z + quad.halfZ],
        [quad.center.x - quad.halfX, quad.center.z + quad.halfZ],
      ];
      corners.forEach(([x, z], corner) => {
        positions.set([x, y, z], (index * 4 + corner) * 3);
      });
    });
    attribute.needsUpdate = true;
  };

  const material = new MeshBasicMaterial({
    color: TRAFFIC_SHADOW_COLOR,
    transparent: true,
    opacity: TRAFFIC_SHADOW_OPACITY,
    // Flat on the ground and only ever seen from above, so culling earns
    // nothing here — while a wrong winding would silently hide every blob.
    side: DoubleSide,
    // A translucent quad that wrote depth would punch holes in whatever is
    // drawn after it, including the car standing on it.
    depthWrite: false,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = 'trafficCarShadows';
  // Shadow-map work is exactly what the blobs exist to avoid, and a blob that
  // received shadows would double-darken where a house's shadow crosses it.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  write();

  return {
    mesh,
    sync: write,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
