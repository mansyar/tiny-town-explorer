import type { BufferGeometry, Material, Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createTownGrid } from '../town/townGrid';
import { spawnParkLitter } from './parkLitter';
import { createLitterField, type LitterField } from './parkLitterFx';

const grid = createTownGrid();
/** One deterministic round: the same eight pieces every run. */
const pieces = spawnParkLitter({ grid, random: () => 0 });

/** Every geometry and material the field put on the GPU, each listed once. */
function resources(field: LitterField): {
  geometries: BufferGeometry[];
  materials: Material[];
} {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  field.object.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh !== true) {
      return;
    }
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      materials.add(material);
    }
  });
  return { geometries: [...geometries], materials: [...materials] };
}

/** Disposal spies for every resource, in a stable order. */
function spyDisposals(field: LitterField): ReturnType<typeof vi.spyOn>[] {
  const { geometries, materials } = resources(field);
  return [
    ...geometries.map((geometry) => vi.spyOn(geometry, 'dispose')),
    ...materials.map((material) => vi.spyOn(material, 'dispose')),
  ];
}

/** The ground-plane height of every piece the field is still showing. */
function heights(field: LitterField): number[] {
  return field.object.children.map((node) => node.position.y);
}

describe('LitterField.dispose (FR7)', () => {
  it('frees every geometry and material it allocated, each exactly once', () => {
    // The tied bag shares one material across its two meshes, so a traversal
    // that disposes per mesh frees it twice. Three tolerates that; the
    // ownership contract does not — one allocation, one release.
    const field = createLitterField(pieces);
    const { geometries, materials } = resources(field);
    expect(geometries.length).toBeGreaterThan(0);
    expect(materials.length).toBeGreaterThan(0);

    const spies = spyDisposals(field);
    field.dispose();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledOnce();
    }
  });

  it('frees pieces already collected, not just the ones still bouncing', () => {
    // `remove()` drops an entry from the bounce set, so a `dispose()` that
    // walks only what is still bouncing orphans exactly the pieces a child
    // already drove over — the leak grows with play, not with idleness.
    const field = createLitterField(pieces);
    const collected = pieces[0];
    expect(collected).toBeDefined();
    const spies = spyDisposals(field);

    field.remove(collected?.id ?? '');
    field.dispose();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledOnce();
    }
  });

  it('stops a disposed field bouncing: update() moves nothing afterwards', () => {
    const field = createLitterField(pieces);
    field.update(0.3);
    const settled = heights(field);

    field.dispose();
    field.update(0.4);

    expect(heights(field)).toEqual(settled);
  });

  it('frees the outgoing field and leaves its replacement live', () => {
    // The sequence `startPark()` performs every round: release the old field,
    // then build the new one. Nothing the replacement allocates may be caught
    // in the outgoing field's teardown.
    const outgoing = createLitterField(pieces);
    const spies = spyDisposals(outgoing);

    outgoing.dispose();
    const replacement = createLitterField(pieces);
    const freshSpies = spyDisposals(replacement);

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledOnce();
    }
    for (const spy of freshSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
