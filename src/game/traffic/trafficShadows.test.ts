import { BufferGeometry, DoubleSide, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SUN_POSITION, sunGroundOffset } from '../scene';
import { createTownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import { ROAD_SURFACE_HEIGHT } from '../vehicle/vehicleActor';
import {
  mountTrafficShadows,
  TRAFFIC_SHADOW_LIFT,
  TRAFFIC_SHADOW_OPACITY,
  trafficShadowQuads,
} from './trafficShadows';
import {
  createTrafficSystem,
  type TrafficSystem,
  trafficActorFittedHeight,
} from './trafficSystem';

const grid = createTownGrid(TOWN_MAP);

/** The same town again — every test drives its own wanderers. */
function town(): TrafficSystem {
  return createTrafficSystem({ grid, seed: 7 });
}

/** The live box one mover stands in. */
function boxOf(traffic: TrafficSystem, index: number) {
  const shape = traffic.footprints()[index]?.shape;
  if (shape?.kind !== 'box') {
    throw new Error('expected a box footprint');
  }
  return shape;
}

/** The sun offset this mover's blob is thrown by. */
function offsetFor(kind: Parameters<typeof trafficActorFittedHeight>[0]): {
  x: number;
  z: number;
} {
  return sunGroundOffset(grid.tileSize * trafficActorFittedHeight(kind));
}

describe('the wanderers’ following blob shadows (FR8)', () => {
  it('draws one blob per mover', () => {
    const traffic = town();
    const quads = trafficShadowQuads(grid, traffic);

    expect(quads).toHaveLength(traffic.poses().length);
    expect(quads.length).toBeGreaterThan(0);
  });

  it('centres each blob half way down its sun offset', () => {
    const traffic = town();
    const quads = trafficShadowQuads(grid, traffic);

    traffic.poses().forEach((pose, index) => {
      const box = boxOf(traffic, index);
      const quad = quads[index];
      const offset = offsetFor(pose.kind);
      expect(quad?.center.x).toBeCloseTo(box.centre.x + offset.x / 2, 10);
      expect(quad?.center.z).toBeCloseTo(box.centre.z + offset.z / 2, 10);
    });
  });

  it('throws every blob away from the sun', () => {
    for (const pose of town().poses()) {
      const height = grid.tileSize * trafficActorFittedHeight(pose.kind);
      const offset = sunGroundOffset(height);
      // The sign convention both shadow modules share: the blob slides to the
      // dark side of its car.
      expect(offset.x * SUN_POSITION.x + offset.z * SUN_POSITION.z).toBeLessThan(0);
      expect(Math.abs(offset.x)).toBeCloseTo(1.2 * height, 10);
      expect(Math.abs(offset.z)).toBeCloseTo(0.9 * height, 10);
    }
  });

  it('stretches each blob by half the offset on every side', () => {
    const traffic = town();
    const quads = trafficShadowQuads(grid, traffic);

    traffic.poses().forEach((pose, index) => {
      const box = boxOf(traffic, index);
      const quad = quads[index];
      const offset = offsetFor(pose.kind);
      expect(quad?.halfX).toBeCloseTo(box.halfX + Math.abs(offset.x) / 2, 10);
      expect(quad?.halfZ).toBeCloseTo(box.halfZ + Math.abs(offset.z) / 2, 10);
    });
  });

  it('gives the taller sedan a longer throw than the low hatchback', () => {
    const kinds = town()
      .poses()
      .map((pose) => pose.kind);
    expect(kinds).toContain('parkedSedan');
    expect(kinds).toContain('parkedHatchback');

    const sedan = offsetFor('parkedSedan');
    const hatchback = offsetFor('parkedHatchback');
    expect(Math.hypot(sedan.x, sedan.z)).toBeGreaterThan(
      Math.hypot(hatchback.x, hatchback.z),
    );
  });

  it('merges both blobs into one mesh of two triangles per car', () => {
    const traffic = town();
    const mount = mountTrafficShadows(grid, traffic);
    if (mount === undefined) {
      throw new Error('expected a mount');
    }
    const quads = trafficShadowQuads(grid, traffic);

    expect(mount.mesh.geometry.getAttribute('position').count).toBe(quads.length * 4);
    expect(mount.mesh.geometry.getIndex()?.count).toBe(quads.length * 6);
  });

  it('casts and receives no shadows', () => {
    const mount = mountTrafficShadows(grid, town());
    if (mount === undefined) {
      throw new Error('expected a mount');
    }

    expect(mount.mesh.castShadow).toBe(false);
    expect(mount.mesh.receiveShadow).toBe(false);
  });

  it('sits just above the asphalt the cars ride', () => {
    const mount = mountTrafficShadows(grid, town());
    if (mount === undefined) {
      throw new Error('expected a mount');
    }
    const positions = mount.mesh.geometry.getAttribute('position');

    // Vertex positions are float32, so the tolerance matches their precision.
    expect(positions.getY(0)).toBeCloseTo(
      grid.tileSize * ROAD_SURFACE_HEIGHT + TRAFFIC_SHADOW_LIFT,
      5,
    );
  });

  it('carries no prop identity, so nothing can tap or snap to a blob', () => {
    const mount = mountTrafficShadows(grid, town());
    if (mount === undefined) {
      throw new Error('expected a mount');
    }

    expect(mount.mesh.userData.propId).toBeUndefined();
  });

  it('hands back no mount when nothing is moving', () => {
    const idle: TrafficSystem = {
      update: () => undefined,
      footprints: () => [],
      poses: () => [],
    };

    expect(mountTrafficShadows(grid, idle)).toBeUndefined();
  });

  it('paints like the parked cars’ blobs, so both read as one lighting', () => {
    const mount = mountTrafficShadows(grid, town());
    if (mount === undefined) {
      throw new Error('expected a mount');
    }
    const material = mount.mesh.material;
    if (Array.isArray(material) || !(material instanceof MeshBasicMaterial)) {
      throw new Error('expected one basic material');
    }

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(TRAFFIC_SHADOW_OPACITY);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(DoubleSide);
    expect(material.color.getHex()).toBe(0x24332a);
  });

  it('slides the blobs along with their cars', () => {
    const traffic = town();
    const mount = mountTrafficShadows(grid, traffic);
    if (mount === undefined) {
      throw new Error('expected a mount');
    }
    const before = trafficShadowQuads(grid, traffic).map((quad) => quad.center.x);

    for (let frame = 0; frame < 30; frame++) {
      traffic.update(1 / 30);
      mount.sync();
    }

    expect(trafficShadowQuads(grid, traffic).map((quad) => quad.center.x)).not.toEqual(
      before,
    );
    // The shared geometry is rewritten to match: corner zero of each quad.
    const positions = mount.mesh.geometry.getAttribute('position');
    trafficShadowQuads(grid, traffic).forEach((quad, index) => {
      expect(positions.getX(index * 4)).toBeCloseTo(quad.center.x - quad.halfX, 6);
      expect(positions.getZ(index * 4)).toBeCloseTo(quad.center.z - quad.halfZ, 6);
    });
  });

  it('lies under the whole car', () => {
    const traffic = town();
    const quads = trafficShadowQuads(grid, traffic);

    traffic.poses().forEach((_pose, index) => {
      const box = boxOf(traffic, index);
      const quad = quads[index];
      if (quad === undefined) {
        throw new Error('expected a quad per mover');
      }
      // Containment up to float rounding: the two sides sum in a different
      // order and land a few ulps apart.
      const slack = 1e-9;
      expect(Math.abs(box.centre.x - quad.center.x) + box.halfX).toBeLessThanOrEqual(
        quad.halfX + slack,
      );
      expect(Math.abs(box.centre.z - quad.center.z) + box.halfZ).toBeLessThanOrEqual(
        quad.halfZ + slack,
      );
    });
  });

  it('frees its geometry and material exactly once', () => {
    const mount = mountTrafficShadows(grid, town());
    if (mount === undefined) {
      throw new Error('expected a mount');
    }
    const geometrySpy = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materialSpy = vi.spyOn(MeshBasicMaterial.prototype, 'dispose');

    mount.dispose();

    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(materialSpy).toHaveBeenCalledTimes(1);
    geometrySpy.mockRestore();
    materialSpy.mockRestore();
  });
});
