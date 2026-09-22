import { describe, expect, it } from 'vitest';
import type { LitterPiece } from './parkLitter';
import { createParkPickup, GULP_MIN_MS, SWEEP_MIN_MS, SWEEP_RADIUS } from './parkPickup';

const piece = (id: string, x: number, z: number): LitterPiece => ({
  id,
  tile: { x: 0, y: 0 },
  position: { x, z },
});

/** Ticks the collector at 60 fps for `seconds`, from `car` with `pieces` left. */
const driveFor = (
  pickup: ReturnType<typeof createParkPickup>,
  seconds: number,
  car: { x: number; z: number },
  pieces: readonly LitterPiece[],
) => {
  const collected: string[] = [];
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    const result = pickup.update(
      1 / 60,
      car,
      pieces.filter((p) => !collected.includes(p.id)),
    );
    collected.push(...result.collected.map((p) => p.id));
  }
  return collected;
};

describe('createParkPickup', () => {
  describe('drive-over pickup (FR3)', () => {
    it('collects a piece within 0.6 of the truck’s centre', () => {
      const pickup = createParkPickup();
      const near = piece('litter-1', 0.6, 0);
      const result = pickup.update(1 / 60, { x: 0, z: 0 }, [near]);
      expect(result.collected.map((p) => p.id)).toEqual(['litter-1']);
    });

    it('leaves a piece at 0.61 for a later pass', () => {
      const pickup = createParkPickup();
      const far = piece('litter-1', 0.61, 0);
      const result = pickup.update(1 / 60, { x: 0, z: 0 }, [far]);
      expect(result.collected).toEqual([]);
    });

    it('collects each piece exactly once — one gulp per piece', () => {
      const pickup = createParkPickup();
      const only = piece('litter-1', 0.3, 0);
      const first = pickup.update(1 / 60, { x: 0, z: 0 }, [only]);
      const second = pickup.update(1 / 60, { x: 0, z: 0 }, [only]);
      expect(first.collected).toHaveLength(1);
      expect(second.collected).toEqual([]);
    });

    it('rate-limits gulps to at least 150 ms apart during a run', () => {
      const pickup = createParkPickup();
      const a = piece('litter-1', 0, 0);
      const b = piece('litter-2', 0.3, 0);
      const c = piece('litter-3', 0.6, 0);
      const all = [a, b, c];
      const gulps: number[] = [];
      let clock = 0;
      let remaining = all;
      for (let i = 0; i < 12; i++) {
        clock += 1 / 60;
        const result = pickup.update(1 / 60, { x: 0, z: 0 }, remaining);
        if (result.gulp) gulps.push(clock);
        remaining = remaining.filter((p) => !result.collected.includes(p));
      }
      expect(gulps.length).toBeGreaterThan(0);
      for (let i = 1; i < gulps.length; i++) {
        const current = gulps[i] ?? Number.NaN;
        const previous = gulps[i - 1] ?? Number.NaN;
        expect((current - previous) * 1000).toBeGreaterThanOrEqual(GULP_MIN_MS - 1);
      }
    });

    it('collects every piece in range once the rate-limit window passes', () => {
      const pickup = createParkPickup();
      const all = [
        piece('litter-1', 0, 0),
        piece('litter-2', 0.3, 0),
        piece('litter-3', 0.6, 0),
      ];
      const collected = driveFor(pickup, 2, { x: 0, z: 0 }, all);
      expect(collected).toHaveLength(3);
    });
  });

  describe('ability sweep (FR4)', () => {
    it('sweeps every piece within 1.5 with one gulp for the group', () => {
      const pickup = createParkPickup();
      const cluster = [
        piece('litter-1', 0.2, 0),
        piece('litter-2', -0.4, 0.3),
        piece('litter-3', 1.0, 0.5),
      ];
      const result = pickup.sweep({ x: 0, z: 0 }, cluster);
      expect(result.collected.map((p) => p.id).sort()).toEqual(
        ['litter-1', 'litter-2', 'litter-3'].sort(),
      );
      expect(result.gulp).toBe(true);
    });

    it('leaves a piece at 1.51 outside the sweep radius', () => {
      const pickup = createParkPickup();
      const near = piece('litter-1', 0.1, 0);
      const outside = piece('litter-2', 1.51, 0);
      const result = pickup.sweep({ x: 0, z: 0 }, [near, outside]);
      expect(result.collected.map((p) => p.id)).toEqual(['litter-1']);
      expect(SWEEP_RADIUS).toBe(1.5);
    });

    it('sweeps nothing but still spends one gulp when the ground is clear', () => {
      const pickup = createParkPickup();
      const result = pickup.sweep({ x: 0, z: 0 }, []);
      expect(result.collected).toEqual([]);
      expect(result.gulp).toBe(true);
    });

    it('honours a 0.5 s cadence between sweeps', () => {
      const pickup = createParkPickup();
      expect(SWEEP_MIN_MS).toBe(500);
      const first = pickup.sweep({ x: 0, z: 0 }, [piece('litter-1', 0, 0)]);
      expect(first.gulp).toBe(true);
      const tooSoon = pickup.sweep({ x: 0, z: 0 }, [piece('litter-2', 0, 0)]);
      expect(tooSoon.gulp).toBe(false);
      expect(tooSoon.collected).toEqual([]);
      // 0.5 s of driving passes the cadence without collecting anything new.
      driveFor(pickup, 0.6, { x: 50, z: 50 }, []);
      const later = pickup.sweep({ x: 0, z: 0 }, [piece('litter-3', 0, 0)]);
      expect(later.gulp).toBe(true);
      expect(later.collected.map((p) => p.id)).toEqual(['litter-3']);
    });

    it('never double-collects a piece the drive-over already took', () => {
      const pickup = createParkPickup();
      const taken = piece('litter-1', 0, 0);
      pickup.update(1 / 60, { x: 0, z: 0 }, [taken]);
      const result = pickup.sweep({ x: 0, z: 0 }, [taken]);
      expect(result.collected).toEqual([]);
    });
  });

  describe('completion (FR5)', () => {
    it('fires exactly once, when the last piece goes', () => {
      const pickup = createParkPickup();
      const a = piece('litter-1', 0, 0);
      const b = piece('litter-2', 0.3, 0);
      expect(pickup.update(1 / 60, { x: 0, z: 0 }, [a, b]).complete).toBe(false);
      // Pace past the 150 ms gulp window before the last piece, the way a
      // driving pass would.
      for (let i = 0; i < 10; i++) {
        expect(pickup.update(1 / 60, { x: 50, z: 50 }, []).complete).toBe(false);
      }
      expect(pickup.update(1 / 60, { x: 0, z: 0 }, [b]).complete).toBe(true);
      expect(pickup.update(1 / 60, { x: 0, z: 0 }, []).complete).toBe(false);
      // A stale list must never re-fire it.
      expect(pickup.update(1 / 60, { x: 0, z: 0 }, [a, b]).complete).toBe(false);
    });

    it('fires once from a sweep of the final pieces too', () => {
      const pickup = createParkPickup();
      const a = piece('litter-1', 0, 0);
      const b = piece('litter-2', 0.4, 0);
      const result = pickup.sweep({ x: 0, z: 0 }, [a, b]);
      expect(result.complete).toBe(true);
      expect(pickup.sweep({ x: 0, z: 0 }, []).complete).toBe(false);
    });

    it('stays quiet on an already-empty park', () => {
      const pickup = createParkPickup();
      expect(pickup.update(1 / 60, { x: 0, z: 0 }, []).complete).toBe(false);
    });
  });

  describe('a fresh round (FR1)', () => {
    it('collects a reset field again — the next round reuses the litter ids', () => {
      const pickup = createParkPickup();
      const only = piece('litter-1', 0.3, 0);
      expect(pickup.update(1 / 60, { x: 0, z: 0 }, [only]).collected).toHaveLength(1);

      // The calm gap passes between rounds before the new field is laid out.
      driveFor(pickup, 0.6, { x: 50, z: 50 }, []);
      pickup.reset();

      const again = pickup.update(1 / 60, { x: 0, z: 0 }, [only]);
      expect(again.collected.map((p) => p.id)).toEqual(['litter-1']);
    });
  });
});
