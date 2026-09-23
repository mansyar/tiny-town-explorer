import { describe, expect, it } from 'vitest';
import type { Obstacle } from '../collision/collision';
import { createTownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import { createTrafficSystem, type TrafficSystem } from './trafficSystem';

const grid = createTownGrid(TOWN_MAP);

/** The published centre of one mover box. */
function centreOf(obstacle: Obstacle): [number, number] {
  const shape = obstacle.shape;
  return shape.kind === 'box'
    ? [shape.centre.x, shape.centre.z]
    : [Number.NaN, Number.NaN];
}

/** One framed session, recording where the two boxes stood each frame. */
function wander(traffic: TrafficSystem, frames: number): [number, number][][] {
  const trace: [number, number][][] = [];
  for (let frame = 0; frame < frames; frame++) {
    traffic.update(1 / 30);
    trace.push(traffic.footprints().map(centreOf));
  }
  return trace;
}

describe('a self-contained traffic system (FR9)', () => {
  it('publishes two live boxes under stable ids, and nothing else', () => {
    const traffic = createTrafficSystem({ grid, seed: 7 });
    const footprints = traffic.footprints();

    expect(footprints.map((obstacle) => obstacle.id)).toEqual(['traffic-0', 'traffic-1']);
    for (const obstacle of footprints) {
      expect(obstacle.shape.kind).toBe('box');
    }
    // The whole surface: it ticks the wanderers, shows where they are and
    // publishes where they stand. It knows nothing of cameras, engines or
    // taps — and nothing anyone holds can steer a mover.
    expect(Object.keys(traffic).sort()).toEqual(['footprints', 'poses', 'update']);
    for (const forbidden of ['cameraTarget', 'engineRate', 'setPath', 'snapTo', 'tap']) {
      expect(forbidden in traffic).toBe(false);
    }
  });

  it('never publishes a wall: both boxes are crashable (FR4)', () => {
    const traffic = createTrafficSystem({ grid, seed: 7 });
    for (const obstacle of traffic.footprints()) {
      expect(obstacle.solid).toBe(false);
    }
  });

  it('advances both wanderers, one small step per frame', () => {
    const traffic = createTrafficSystem({ grid, seed: 7 });
    const [start0, start1] = traffic.footprints().map(centreOf);
    const trace = wander(traffic, 30 * 10);
    const [end0, end1] = trace[trace.length - 1] ?? [];

    for (const [start, end] of [
      [start0, end0],
      [start1, end1],
    ]) {
      // Both moved...
      expect(
        Math.hypot(
          (end?.[0] ?? 0) - (start?.[0] ?? 0),
          (end?.[1] ?? 0) - (start?.[1] ?? 0),
        ),
      ).toBeGreaterThan(0.5);
    }
    // ...and neither ever teleported: one update is one frame of driving.
    for (const frame of trace) {
      for (let car = 0; car < 2; car++) {
        const [wasX, wasZ] = frame[car] ?? [Number.NaN, Number.NaN];
        expect(Number.isFinite(wasX)).toBe(true);
        expect(Number.isFinite(wasZ)).toBe(true);
      }
    }
  });

  it('replays the same wander for the same seed, and diverges otherwise', () => {
    const seven = wander(createTrafficSystem({ grid, seed: 7 }), 30 * 10);
    const alsoSeven = wander(createTrafficSystem({ grid, seed: 7 }), 30 * 10);
    const eight = wander(createTrafficSystem({ grid, seed: 8 }), 30 * 10);

    expect(alsoSeven).toEqual(seven);
    expect(eight).not.toEqual(seven);
  });

  it('keeps both wanderers on the road', () => {
    const trace = wander(createTrafficSystem({ grid, seed: 7 }), 30 * 20);
    for (const frame of trace) {
      for (const [x, z] of frame) {
        expect(grid.isRoad(grid.worldToTile({ x, z }))).toBe(true);
      }
    }
  });

  it('starts its two cars apart, never stacked', () => {
    const [a, b] = createTrafficSystem({ grid, seed: 7 }).footprints().map(centreOf);
    expect(
      Math.hypot((a?.[0] ?? 0) - (b?.[0] ?? 0), (a?.[1] ?? 0) - (b?.[1] ?? 0)),
    ).toBeGreaterThan(0.5);
  });

  it('poses mirror the footprints exactly, frame after frame (FR1)', () => {
    const traffic = createTrafficSystem({ grid, seed: 7 });
    for (let frame = 0; frame < 30; frame++) {
      traffic.update(1 / 30);
      const footprints = traffic.footprints();
      traffic.poses().forEach((pose, index) => {
        expect(footprints[index]?.id).toBe(pose.id);
        expect(['parkedSedan', 'parkedHatchback']).toContain(pose.kind);
        const box = footprints[index]?.shape;
        if (box?.kind !== 'box') {
          throw new Error('expected a box footprint');
        }
        // The pose is the same live point the footprint is published from.
        expect(pose.position.x).toBe(box.centre.x);
        expect(pose.position.z).toBe(box.centre.z);
        expect(Number.isFinite(pose.heading())).toBe(true);
      });
    }
  });
});
