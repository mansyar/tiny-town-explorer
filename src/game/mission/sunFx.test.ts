import { describe, expect, it } from 'vitest';
import { createSunFx, SUN_RAY_COUNT, SUN_SECONDS, sunFrame } from './sunFx';

describe('the sun’s shape over time', () => {
  it('starts small and rises into itself', () => {
    const start = sunFrame(0);
    const quarter = sunFrame(SUN_SECONDS * 0.25);
    expect(start.scale).toBeLessThan(quarter.scale);
    expect(start.finished).toBe(false);
    expect(start.opacity).toBe(1);
  });

  it('overshoots a little on the way in, then settles', () => {
    const peak = sunFrame(SUN_SECONDS * 0.125);
    const settled = sunFrame(SUN_SECONDS * 0.5);
    expect(peak.scale).toBeGreaterThan(1);
    expect(settled.scale).toBeCloseTo(1, 2);
  });

  it('fades out over the last quarter rather than snapping off', () => {
    expect(sunFrame(SUN_SECONDS * 0.7).opacity).toBe(1);
    expect(sunFrame(SUN_SECONDS * 0.8).opacity).toBeLessThan(1);
    expect(sunFrame(SUN_SECONDS * 0.8).opacity).toBeGreaterThan(0);
  });

  it('is spent at the end, and stays spent', () => {
    const end = sunFrame(SUN_SECONDS);
    expect(end.finished).toBe(true);
    expect(end.opacity).toBe(0);
    expect(sunFrame(SUN_SECONDS * 5).finished).toBe(true);
  });

  it('turns steadily rather than wobbling', () => {
    const a = sunFrame(SUN_SECONDS * 0.2).turn;
    const b = sunFrame(SUN_SECONDS * 0.4).turn;
    const c = sunFrame(SUN_SECONDS * 0.6).turn;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('clamps a negative moment to the start', () => {
    const frame = sunFrame(-4);
    expect(frame.scale).toBeCloseTo(0.5);
    expect(frame.finished).toBe(false);
  });
});

describe('the sun layer', () => {
  it('stays out of sight until a mission ends', () => {
    const sun = createSunFx();
    expect(sun.isShowing()).toBe(false);
    expect(sun.object.visible).toBe(false);
    sun.update(1 / 60);
    expect(sun.isShowing()).toBe(false);
  });

  it('rises over the lot it was given and comes back down for good', () => {
    const sun = createSunFx();
    sun.show({ x: 1.5, z: 0.5 });
    expect(sun.isShowing()).toBe(true);
    expect(sun.object.position.x).toBe(1.5);
    expect(sun.object.position.z).toBe(0.5);

    sun.update(0.5);
    expect(sun.isShowing()).toBe(true);

    sun.update(SUN_SECONDS);
    expect(sun.isShowing()).toBe(false);
    expect(sun.object.visible).toBe(false);
  });

  it('has a full ring of rays and one smile', () => {
    const sun = createSunFx();
    for (let index = 0; index < SUN_RAY_COUNT; index += 1) {
      expect(sun.object.getObjectByName(`sunRay-${index}`)).toBeDefined();
    }
    expect(sun.object.getObjectByName('sunSmile')).toBeDefined();
    expect(sun.object.getObjectByName('sunEye-0')).toBeDefined();
    expect(sun.object.getObjectByName('sunEye-1')).toBeDefined();
  });

  it('can be taken away early when a new fire starts', () => {
    const sun = createSunFx();
    sun.show({ x: 0, z: 0 });
    sun.hide();
    expect(sun.isShowing()).toBe(false);
  });
});
