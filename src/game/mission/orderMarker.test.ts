import { describe, expect, it } from 'vitest';
import { createOrderMarker, markerBounce, markerSway } from './orderMarker';

describe('the bounce', () => {
  it('rests at the base and lifts mid-cycle', () => {
    expect(markerBounce(0)).toBe(0);
    expect(markerBounce(0.35)).toBeGreaterThan(0.1);
  });

  it('comes back down every cycle, so the marker never drifts skyward', () => {
    for (const seconds of [0.7, 1.4, 2.1, 5.6]) {
      expect(markerBounce(seconds)).toBeGreaterThanOrEqual(0);
      expect(markerBounce(seconds)).toBeLessThanOrEqual(0.16);
    }
  });
});

describe('the sway', () => {
  it('leans both ways but never far', () => {
    expect(markerSway(0)).toBe(0);
    let sawLeft = false;
    let sawRight = false;
    for (let frame = 0; frame < 120; frame += 1) {
      const sway = markerSway(frame / 60);
      expect(Math.abs(sway)).toBeLessThanOrEqual(0.09);
      if (sway < -0.05) {
        sawLeft = true;
      }
      if (sway > 0.05) {
        sawRight = true;
      }
    }
    expect(sawLeft).toBe(true);
    expect(sawRight).toBe(true);
  });
});

describe('the marker object', () => {
  it('builds hidden, shows on command, and ticks without throwing', () => {
    const marker = createOrderMarker();
    expect(marker.isShowing()).toBe(false);

    marker.place({ x: 1.5, z: -0.5 });
    expect(marker.object.position.x).toBe(1.5);
    expect(marker.object.position.z).toBe(-0.5);

    marker.show();
    expect(marker.isShowing()).toBe(true);
    marker.update(1 / 60);
    marker.update(5);
    expect(marker.isShowing()).toBe(true);

    marker.hide();
    expect(marker.isShowing()).toBe(false);
    expect(marker.object.visible).toBe(false);
  });
});
