import { describe, expect, it } from 'vitest';
import {
  createFireFx,
  FLAME_HEIGHT,
  flameFlicker,
  flameScale,
  SMOKE_SECONDS,
  smokeFrame,
} from './fireFx';

describe('the flame', () => {
  it('is out when there is nothing left to douse', () => {
    expect(flameScale(0, 4)).toBe(0);
    expect(flameScale(-1, 4)).toBe(0);
    expect(flameScale(3, 0)).toBe(0);
  });

  it('stands full height on the first look', () => {
    expect(flameScale(4, 4)).toBe(1);
  });

  it('shrinks with every burst, down toward a stub', () => {
    const full = flameScale(4, 4);
    const three = flameScale(3, 4);
    const two = flameScale(2, 4);
    const one = flameScale(1, 4);

    expect(three).toBeLessThan(full);
    expect(two).toBeLessThan(three);
    expect(one).toBeLessThan(two);
    expect(one).toBeGreaterThan(0.25);
  });

  it('reads the count it was given, however many bursts that is', () => {
    expect(flameScale(1, 1)).toBe(1);
    expect(flameScale(3, 4)).toBeCloseTo(0.8125);
  });

  it('flickers a little, and never wildly', () => {
    expect(flameFlicker(0)).toBeCloseTo(1.0385, 3);
    for (let seconds = 0; seconds < 12; seconds += 0.13) {
      const value = flameFlicker(seconds);
      expect(value).toBeGreaterThan(0.9);
      expect(value).toBeLessThan(1.1);
    }
  });
});

describe('the smoke', () => {
  it('starts small and thick, then thins as it climbs', () => {
    const start = smokeFrame(0);
    expect(start.scale).toBeCloseTo(0.25);
    expect(start.opacity).toBeCloseTo(0.7);
    expect(start.finished).toBe(false);

    const half = smokeFrame(SMOKE_SECONDS / 2);
    expect(half.scale).toBeGreaterThan(start.scale);
    expect(half.opacity).toBeLessThan(start.opacity);
  });

  it('is spent once its climb is over', () => {
    const end = smokeFrame(SMOKE_SECONDS);
    expect(end.finished).toBe(true);
    expect(end.opacity).toBe(0);
    expect(smokeFrame(SMOKE_SECONDS * 10).finished).toBe(true);
  });

  it('clamps a negative elapsed time to the start of the climb', () => {
    const frame = smokeFrame(-5);
    expect(frame.scale).toBeCloseTo(0.25);
    expect(frame.finished).toBe(false);
  });
});

describe('the fire layer', () => {
  it('is not burning until it is told how much is left', () => {
    const fire = createFireFx();
    expect(fire.isBurning()).toBe(false);
    expect(fire.object.name).toBe('fireFx');
    fire.update(1 / 60);
    expect(fire.isBurning()).toBe(false);
  });

  it('burns while bursts remain and goes out when they run out', () => {
    const fire = createFireFx();
    fire.place({ x: 1.5, z: -0.5 });
    fire.setBursts(3, 4);
    expect(fire.isBurning()).toBe(true);

    fire.update(1 / 60);
    const flame = fire.object.getObjectByName('fireFlame');
    expect(flame?.visible).toBe(true);
    expect(flame?.position.y).toBeGreaterThan(0);
    expect((flame?.position.y ?? 0) * 2).toBeLessThanOrEqual(FLAME_HEIGHT + 0.1);

    fire.setBursts(0, 4);
    expect(fire.isBurning()).toBe(false);
    fire.extinguish();
    expect(fire.object.getObjectByName('fireSmoke-0')?.visible).toBe(false);
  });

  it('drifts its smoke while it burns', () => {
    const fire = createFireFx();
    fire.setBursts(2, 4);
    fire.update(0.5);
    expect(fire.object.children.length).toBeGreaterThan(1);
  });
});
