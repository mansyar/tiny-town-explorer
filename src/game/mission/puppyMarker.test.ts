/**
 * Tests for the lost puppy's two markers (FR7, FR9).
 *
 * Scene code is normally manual-verify per the workflow's Guiding Principle,
 * but one thing here is a rule rather than a look: the paw print is the puppy
 * mission's only signpost, and the pup is *meant* to hide behind houses, trees
 * and the dumpster — so the print must draw over town geometry. That is a
 * behavioural contract, and it is pinned here.
 */

import { Mesh, type MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { createHeartMarker, createPawMarker } from './puppyMarker';

/** Every mesh inside a marker's object graph. */
function meshesOf(object: {
  traverse: (visit: (child: unknown) => void) => void;
}): Mesh[] {
  const found: Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof Mesh) {
      found.push(child);
    }
  });
  return found;
}

describe('the paw marker (FR7)', () => {
  it('draws over town geometry, so a hidden pup still shows where to drive', () => {
    const meshes = meshesOf(createPawMarker().object);
    expect(meshes.length).toBeGreaterThan(0);

    for (const mesh of meshes) {
      // Depth testing off keeps the print from being rejected by a wall; the
      // render order is what makes it land on top of one it is drawn before.
      expect((mesh.material as MeshBasicMaterial).depthTest, mesh.name).toBe(false);
      expect(mesh.renderOrder, mesh.name).toBeGreaterThan(0);
    }
  });

  it('still places, shows, hides and animates like the other markers', () => {
    const paw = createPawMarker();
    expect(paw.isShowing()).toBe(false);
    expect(paw.object.visible).toBe(false);

    paw.place({ x: 1.5, z: -2 });
    paw.show();
    expect(paw.isShowing()).toBe(true);
    expect(paw.object.visible).toBe(true);
    expect(paw.object.position.x).toBe(1.5);
    expect(paw.object.position.z).toBe(-2);

    paw.update(0.35);
    paw.update(-5); // a negative frame is not time passing
    paw.hide();
    expect(paw.isShowing()).toBe(false);
    expect(paw.object.visible).toBe(false);
  });
});

describe('the heart marker (FR9)', () => {
  it('floats above the roofline, so it needs no depth exemption', () => {
    // The heart marks the owner's door from above the roof (MARKER_BASE_HEIGHT),
    // which is why only the ground-level paw print is drawn on top.
    const heart = createHeartMarker();
    heart.place({ x: 0, z: 0 });
    expect(heart.object.position.y).toBeGreaterThan(1);
    for (const mesh of meshesOf(heart.object)) {
      expect((mesh.material as MeshBasicMaterial).depthTest, mesh.name).toBe(true);
    }
  });
});
