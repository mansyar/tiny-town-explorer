import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Material,
  Mesh,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTownScene, SKY_COLOR } from './scene';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createTownScene', () => {
  it('paints the sky background and matching fog', () => {
    const { scene, dispose } = createTownScene();

    expect(scene.background).toBeInstanceOf(Color);
    if (scene.background instanceof Color) {
      expect(scene.background.getHex()).toBe(SKY_COLOR);
    }

    expect(scene.fog).toBeInstanceOf(Fog);
    if (scene.fog instanceof Fog) {
      expect(scene.fog.color.getHex()).toBe(SKY_COLOR);
    }

    dispose();
  });

  it('adds a flat, shadow-receiving ground plane at the origin', () => {
    const { scene, dispose } = createTownScene();

    const ground = scene.getObjectByName('ground');
    expect(ground).toBeInstanceOf(Mesh);
    if (ground instanceof Mesh) {
      expect(ground.rotation.x).toBeCloseTo(-Math.PI / 2);
      expect(ground.position.y).toBeCloseTo(0);
      expect(ground.receiveShadow).toBe(true);
    }

    dispose();
  });

  it('adds hemisphere bounce plus a warm sun from above', () => {
    const { scene, dispose } = createTownScene();

    expect(scene.getObjectByName('hemisphereLight')).toBeInstanceOf(HemisphereLight);

    const sun = scene.getObjectByName('sunLight');
    expect(sun).toBeInstanceOf(DirectionalLight);
    if (sun instanceof DirectionalLight) {
      expect(sun.position.y).toBeGreaterThan(0);
    }

    dispose();
  });

  it('dispose frees geometries and materials, then empties the scene', () => {
    const geometrySpy = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materialSpy = vi.spyOn(Material.prototype, 'dispose');
    const { scene, dispose } = createTownScene();

    dispose();

    expect(geometrySpy).toHaveBeenCalled();
    expect(materialSpy).toHaveBeenCalled();
    expect(scene.children).toHaveLength(0);
  });
});
