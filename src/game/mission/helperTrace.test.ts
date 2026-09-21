import { describe, expect, it } from 'vitest';
import {
  createHelperTrace,
  routeDots,
  TRACE_SECONDS,
  traceProgress,
} from './helperTrace';

describe('the dotted route', () => {
  it('walks from the car to the destination', () => {
    const dots = routeDots(
      [
        { x: 0, z: 0 },
        { x: 2, z: 0 },
      ],
      0.5,
    );

    expect(dots).toHaveLength(5);
    expect(dots[0]).toEqual({ x: 0, z: 0 });
    expect(dots[dots.length - 1]).toEqual({ x: 2, z: 0 });
  });

  it('turns the corner rather than cutting across it', () => {
    const dots = routeDots(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 1 },
      ],
      1,
    );

    expect(dots).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ]);
  });

  it('carries spare distance over the corner at a steady spacing', () => {
    const dots = routeDots(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 2 },
      ],
      0.6,
    );

    // 0, 0.6 on the first leg; 1.2 overshoots the corner by 0.2, so the second
    // leg resumes at 0.4 and lands on 1.0, 1.6, then the destination at 2.0.
    expect(dots[0]).toEqual({ x: 0, z: 0 });
    expect(dots[dots.length - 1]).toEqual({ x: 1, z: 2 });
    for (let index = 1; index < dots.length; index += 1) {
      const from = dots[index - 1];
      const to = dots[index];
      if (from === undefined || to === undefined) {
        continue;
      }
      const step = Math.hypot(to.x - from.x, to.z - from.z);
      expect(step).toBeLessThanOrEqual(0.6001);
    }
  });

  it('has nothing to draw when the car is already there', () => {
    expect(routeDots([])).toEqual([]);
    expect(
      routeDots([
        { x: 1, z: 1 },
        { x: 1, z: 1 },
      ]),
    ).toEqual([{ x: 1, z: 1 }]);
  });

  it('refuses a spacing that would never advance', () => {
    expect(
      routeDots(
        [
          { x: 0, z: 0 },
          { x: 1, z: 0 },
        ],
        0,
      ),
    ).toEqual([]);
  });
});

describe('the pointer', () => {
  it('starts at the car and ends on the destination', () => {
    expect(traceProgress(0)).toBe(0);
    expect(traceProgress(TRACE_SECONDS)).toBe(1);
    expect(traceProgress(TRACE_SECONDS * 10)).toBe(1);
  });

  it('sets off briskly and settles in, rather than racing the last stretch', () => {
    const quarter = traceProgress(TRACE_SECONDS / 4);
    const half = traceProgress(TRACE_SECONDS / 2);
    const threeQuarters = traceProgress(TRACE_SECONDS * 0.75);
    expect(quarter).toBeGreaterThan(0.25);
    expect(half).toBeGreaterThan(0.5);
    // Eased, so each stretch covers less ground than the one before it.
    expect(quarter).toBeGreaterThan(half - quarter);
    expect(half - quarter).toBeGreaterThan(threeQuarters - half);
    expect(threeQuarters).toBeLessThan(1);
  });

  it('never rewinds on a negative frame', () => {
    expect(traceProgress(-3)).toBe(0);
  });
});

describe('the trace layer', () => {
  it('runs its course once and reports when it has poked the target', () => {
    const trace = createHelperTrace();
    trace.show([
      { x: 0, z: 0 },
      { x: 1.2, z: 0 },
    ]);

    expect(trace.isDone()).toBe(false);
    trace.update(0.1);
    expect(trace.isDone()).toBe(false);

    trace.update(TRACE_SECONDS);
    expect(trace.isDone()).toBe(true);
  });

  it('has nothing to run when the route is too short to draw', () => {
    const trace = createHelperTrace();
    trace.show([{ x: 0, z: 0 }]);
    trace.update(TRACE_SECONDS * 2);
    expect(trace.isDone()).toBe(false);
  });

  it('stops being done once it is taken away', () => {
    const trace = createHelperTrace();
    trace.show([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ]);
    trace.update(TRACE_SECONDS);
    expect(trace.isDone()).toBe(true);
    trace.hide();
    expect(trace.isDone()).toBe(false);
  });
});
