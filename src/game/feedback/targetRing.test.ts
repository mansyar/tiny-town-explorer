import { describe, expect, it } from 'vitest';
import {
  createTargetRing,
  RING_DURATION,
  RING_END_RADIUS,
  RING_START_RADIUS,
  RING_SURFACE_HEIGHT,
  ringFrame,
} from './targetRing';

describe('ringFrame', () => {
  it('starts small and fully opaque', () => {
    const frame = ringFrame(0);

    expect(frame.radius).toBeCloseTo(RING_START_RADIUS, 4);
    expect(frame.opacity).toBeCloseTo(1, 4);
    expect(frame.finished).toBe(false);
  });

  it('reaches its full size and has faded away by the end', () => {
    const frame = ringFrame(RING_DURATION);

    expect(frame.radius).toBeCloseTo(RING_END_RADIUS, 4);
    expect(frame.opacity).toBeCloseTo(0, 4);
    expect(frame.finished).toBe(true);
  });

  it('only ever grows, and only ever fades', () => {
    const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((elapsed) =>
      ringFrame(elapsed * RING_DURATION),
    );

    for (let index = 1; index < samples.length; index++) {
      const previous = samples[index - 1];
      const current = samples[index];
      expect(current?.radius).toBeGreaterThan(previous?.radius ?? 0);
      expect(current?.opacity).toBeLessThan(previous?.opacity ?? 1);
    }
  });

  it('expands fastest at the start, so the tap reads instantly', () => {
    // Half the growth lands in roughly the first quarter of the pulse.
    const quarter = ringFrame(RING_DURATION * 0.25);
    const travelled =
      (quarter.radius - RING_START_RADIUS) / (RING_END_RADIUS - RING_START_RADIUS);

    expect(travelled).toBeGreaterThan(0.5);
  });

  it('sits at the finish for a pulse that ran long, and at the start before it began', () => {
    expect(ringFrame(RING_DURATION * 10)).toEqual(ringFrame(RING_DURATION));
    expect(ringFrame(-1)).toEqual(ringFrame(0));
  });
});

describe('targetRing', () => {
  it('is invisible until something is tapped', () => {
    const ring = createTargetRing();

    expect(ring.object.visible).toBe(false);
  });

  it('appears where the tap landed, clear of the asphalt', () => {
    const ring = createTargetRing();

    ring.show({ x: 1.5, z: -2.25 });

    expect(ring.object.visible).toBe(true);
    expect(ring.object.position.x).toBeCloseTo(1.5, 4);
    expect(ring.object.position.z).toBeCloseTo(-2.25, 4);
    expect(ring.object.position.y).toBeCloseTo(RING_SURFACE_HEIGHT, 4);
    // Above the road surface, or the ring z-fights with the asphalt it marks.
    expect(ring.object.position.y).toBeGreaterThan(0.02);
  });

  it('expands and fades as the frame time passes', () => {
    const ring = createTargetRing();
    ring.show({ x: 0, z: 0 });
    const initialRadius = ring.object.scale.x;
    const initialOpacity = ring.object.material.opacity;

    ring.update(RING_DURATION * 0.3);

    expect(ring.object.scale.x).toBeGreaterThan(initialRadius);
    expect(ring.object.material.opacity).toBeLessThan(initialOpacity);
    // A unit ring scaled, rather than rebuilt: no geometry churn per frame.
    expect(ring.object.scale.y).toBeCloseTo(ring.object.scale.x, 6);
  });

  it('hides itself once the pulse is over', () => {
    const ring = createTargetRing();
    ring.show({ x: 0, z: 0 });

    ring.update(RING_DURATION);

    expect(ring.object.visible).toBe(false);
  });

  it('stays hidden when frames pass with nothing to show', () => {
    const ring = createTargetRing();

    ring.update(1);

    expect(ring.object.visible).toBe(false);
  });

  it('restarts at the newest tap, so a mash cannot leave two rings behind', () => {
    const ring = createTargetRing();
    ring.show({ x: 0, z: 0 });
    ring.update(RING_DURATION * 0.9);

    ring.show({ x: 2, z: 2 });

    expect(ring.object.visible).toBe(true);
    expect(ring.object.position.x).toBeCloseTo(2, 4);
    expect(ring.object.scale.x).toBeCloseTo(RING_START_RADIUS, 4);
    expect(ring.object.material.opacity).toBeCloseTo(1, 4);
  });
});
