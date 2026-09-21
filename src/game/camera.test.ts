import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCamera, updateCameraFrustum, VIEW_HEIGHT } from './camera';

function makeCamera(): OrthographicCamera {
  return new OrthographicCamera(0, 0, 0, 0, 0.1, 400);
}

describe('updateCameraFrustum', () => {
  it('keeps the fixed vertical extent in landscape', () => {
    const camera = makeCamera();
    updateCameraFrustum(camera, 16 / 9);

    expect(camera.top - camera.bottom).toBeCloseTo(VIEW_HEIGHT);
    expect(camera.right - camera.left).toBeCloseTo(VIEW_HEIGHT * (16 / 9));
  });

  it('keeps the fixed vertical extent in portrait', () => {
    const camera = makeCamera();
    updateCameraFrustum(camera, 9 / 16);

    expect(camera.top - camera.bottom).toBeCloseTo(VIEW_HEIGHT);
    expect(camera.right - camera.left).toBeCloseTo(VIEW_HEIGHT * (9 / 16));
  });

  it('falls back to square framing for a degenerate viewport aspect', () => {
    const camera = makeCamera();
    updateCameraFrustum(camera, 0);

    expect(camera.right - camera.left).toBeCloseTo(VIEW_HEIGHT);
  });
});

describe('createCamera', () => {
  it('looks down at the town from above', () => {
    const camera = createCamera(1);
    const direction = camera.getWorldDirection(new Vector3());

    expect(camera.position.y).toBeGreaterThan(0);
    expect(direction.y).toBeLessThan(0);
  });
});
