import { describe, expect, it } from 'vitest';
import {
  BIT_START_SCALE,
  BURST_PLANS,
  BURST_SECONDS,
  burstBits,
  burstFrame,
  FLASH_SECONDS,
  flashFrame,
  SIREN_COLORS,
} from './abilityFx';

describe('the burst fade', () => {
  it('starts full size and transparent-free, then fades out', () => {
    const start = burstFrame(0);
    expect(start.scale).toBe(BIT_START_SCALE);
    expect(start.opacity).toBe(1);
    expect(start.finished).toBe(false);
    expect(burstFrame(BURST_SECONDS / 2).opacity).toBeCloseTo(0.5);
  });

  it('is finished, and shrunk, once its time is up', () => {
    const end = burstFrame(BURST_SECONDS);
    expect(end.finished).toBe(true);
    expect(end.opacity).toBe(0);
    expect(end.scale).toBeLessThan(BIT_START_SCALE);
  });

  it('clamps a negative or over-long elapsed time', () => {
    expect(burstFrame(-5).opacity).toBe(1);
    expect(burstFrame(BURST_SECONDS * 10).finished).toBe(true);
  });
});

describe('the launch velocities', () => {
  it('throws one bit per plan', () => {
    for (const [kind, plan] of Object.entries(BURST_PLANS)) {
      expect(burstBits(kind as keyof typeof BURST_PLANS, 0)).toHaveLength(plan.count);
    }
  });

  it('always lifts, so a burst arcs instead of skidding', () => {
    for (const bit of burstBits('gulp', 0)) {
      expect(bit.y).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a seed and different across seeds', () => {
    expect(burstBits('spray', 1.2, 7)).toEqual(burstBits('spray', 1.2, 7));
    expect(burstBits('spray', 1.2, 7)).not.toEqual(burstBits('spray', 1.2, 8));
  });

  it('aims the hose where the car is facing', () => {
    // Heading 0 is +z, so a narrow fan must travel that way, not backwards.
    for (const bit of burstBits('spray', 0)) {
      expect(bit.z).toBeGreaterThan(0);
    }
  });

  it('sprays the morph puff in every direction', () => {
    const bits = burstBits('poof', 0);
    expect(bits.some((bit) => bit.x < 0)).toBe(true);
    expect(bits.some((bit) => bit.x > 0)).toBe(true);
  });
});

describe('the siren wash', () => {
  it('blooms outward as it fades', () => {
    const start = flashFrame(0);
    const end = flashFrame(FLASH_SECONDS);
    expect(start.radius).toBeLessThan(end.radius);
    expect(end.opacity).toBe(0);
    expect(end.finished).toBe(true);
  });

  it('alternates the two police colours on the way out', () => {
    expect(flashFrame(0).color).toBe(SIREN_COLORS[0]);
    expect(flashFrame(FLASH_SECONDS * 0.3).color).toBe(SIREN_COLORS[1]);
    expect(flashFrame(FLASH_SECONDS * 0.6).color).toBe(SIREN_COLORS[0]);
  });

  it('clamps a negative elapsed time', () => {
    expect(flashFrame(-1).finished).toBe(false);
  });
});
