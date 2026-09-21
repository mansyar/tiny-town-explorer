import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createScene, SKY_COLOR } from './scene';

describe('createScene', () => {
  it('paints the sky background and matching fog', () => {
    const { scene, dispose } = createScene();

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

  it('adds hemisphere bounce plus a shadow-casting sun from above', () => {
    const { scene, dispose } = createScene();

    expect(scene.getObjectByName('hemisphereLight')).toBeInstanceOf(HemisphereLight);

    const sun = scene.getObjectByName('sunLight');
    expect(sun).toBeInstanceOf(DirectionalLight);
    if (sun instanceof DirectionalLight) {
      expect(sun.position.y).toBeGreaterThan(0);
      expect(sun.castShadow).toBe(true);
      // Shadow frustum must cover the whole town so no house drops its shadow.
      expect(sun.shadow.camera.right).toBeGreaterThanOrEqual(6);
      expect(sun.shadow.camera.left).toBeLessThanOrEqual(-6);
    }

    dispose();
  });

  it('starts as an empty stage: the town supplies its own geometry', () => {
    const { scene, dispose } = createScene();

    expect(scene.children).toHaveLength(1);
    expect(scene.getObjectByName('lights')).toBeDefined();
    expect(scene.getObjectByName('ground')).toBeUndefined();

    dispose();
  });

  it('dispose empties the scene graph', () => {
    const { scene, dispose } = createScene();

    dispose();

    expect(scene.children).toHaveLength(0);
  });

  it('dispose frees every mesh mounted on the stage, single or multi-material', () => {
    const { scene, dispose } = createScene();
    const geometry = new BoxGeometry(1, 1, 1);
    const single = new MeshLambertMaterial({ color: 0xffffff });
    const multi = [
      new MeshLambertMaterial({ color: 0xff0000 }),
      new MeshLambertMaterial({ color: 0x00ff00 }),
    ];
    const geometrySpy = vi.spyOn(geometry, 'dispose');
    const singleSpy = vi.spyOn(single, 'dispose');
    const multiSpies = multi.map((material) => vi.spyOn(material, 'dispose'));
    scene.add(new Mesh(geometry, single), new Mesh(geometry, multi));

    dispose();

    expect(geometrySpy).toHaveBeenCalledTimes(2);
    expect(singleSpy).toHaveBeenCalledTimes(1);
    for (const spy of multiSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
    expect(scene.children).toHaveLength(0);
  });
});
