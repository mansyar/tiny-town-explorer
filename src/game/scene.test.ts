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
import {
  createScene,
  SKY_COLOR,
  SUN_POSITION,
  SUN_SHADOW_TEXEL,
  sunShadowSnap,
} from './scene';

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
      // Shadow frustum is deliberately wider than the ~5.3-unit camera view,
      // while staying tight enough to exclude distant town casters.
      expect(sun.shadow.camera.right).toBe(5.5);
      expect(sun.shadow.camera.left).toBe(-5.5);
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

describe('the sun shadow follow (FR7)', () => {
  it('snaps its focus to shadow texels, idempotently', () => {
    const once = sunShadowSnap({ x: 1.2345, z: -0.6789 });
    const twice = sunShadowSnap(once);
    expect(twice.x).toBeCloseTo(once.x, 10);
    expect(twice.z).toBeCloseTo(once.z, 10);
    // The snapped focus stays within about a cell of the car: the ground
    // lattice is a sheared parallelogram (diagonal under two texels).
    expect(Math.hypot(once.x - 1.2345, once.z - -0.6789)).toBeLessThan(
      SUN_SHADOW_TEXEL * 2,
    );
  });

  it('holds the shadow map still while the car creeps inside one cell', () => {
    const focus = sunShadowSnap({ x: 1, z: 1 });
    const nudged = sunShadowSnap({
      x: focus.x + SUN_SHADOW_TEXEL * 0.4,
      z: focus.z,
    });
    // Sub-texel travel must not move the map at all — that is the shimmer.
    expect(nudged.x).toBeCloseTo(focus.x, 10);
    expect(nudged.z).toBeCloseTo(focus.z, 10);
  });

  it('aims the sun and its target at the car’s snapped focus', () => {
    const { followSun, scene, dispose } = createScene();
    followSun({ x: 2.4, z: -1.7 });
    const sun = scene.getObjectByName('sunLight');
    expect(sun).toBeInstanceOf(DirectionalLight);
    if (sun instanceof DirectionalLight) {
      const focus = sunShadowSnap({ x: 2.4, z: -1.7 });
      expect(sun.target.position.x).toBeCloseTo(focus.x, 10);
      expect(sun.target.position.z).toBeCloseTo(focus.z, 10);
      expect(sun.position.x - focus.x).toBeCloseTo(SUN_POSITION.x, 10);
      expect(sun.position.z - focus.z).toBeCloseTo(SUN_POSITION.z, 10);
    }
    dispose();
  });
});
