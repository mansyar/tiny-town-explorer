import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_LENGTH, CAR_VIEW_SHARE, createCameraRig, VIEW_HEIGHT } from './camera';

/** Longest screen edge wins: portrait and landscape must both frame the town. */
const LANDSCAPE = 16 / 9;
const PORTRAIT = 9 / 16;

function makeRig(aspect: number = LANDSCAPE) {
  const rig = createCameraRig(aspect);
  rig.snapTo({ x: 0, z: 0 });
  return rig;
}

/** Advances the rig in fixed 60fps steps. */
function advance(rig: ReturnType<typeof makeRig>, seconds: number): void {
  const step = 1 / 60;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    rig.update(step);
  }
}

describe('camera framing', () => {
  it('shows a car as the share of viewport height the spec asks for', () => {
    expect(VIEW_HEIGHT * CAR_VIEW_SHARE).toBeCloseTo(CAR_LENGTH, 5);
    expect(CAR_VIEW_SHARE).toBeGreaterThanOrEqual(0.15);
    expect(CAR_VIEW_SHARE).toBeLessThanOrEqual(0.2);
  });

  it('keeps the vertical world extent across orientation changes', () => {
    const rig = makeRig(LANDSCAPE);
    const landscapeHeight = rig.camera.top - rig.camera.bottom;

    rig.resize(PORTRAIT);

    expect(rig.camera.top - rig.camera.bottom).toBeCloseTo(landscapeHeight);
    expect(rig.camera.right - rig.camera.left).toBeCloseTo(VIEW_HEIGHT * PORTRAIT);
  });

  it('falls back to square framing for a degenerate viewport', () => {
    const rig = makeRig();

    rig.resize(0);

    expect(rig.camera.right - rig.camera.left).toBeCloseTo(VIEW_HEIGHT);
  });

  it('tilts down at the town from roughly 45 degrees', () => {
    const rig = makeRig();
    const direction = rig.camera.getWorldDirection(new Vector3());
    const aboveHorizon =
      (Math.atan2(-direction.y, Math.hypot(direction.x, direction.z)) * 180) / Math.PI;

    expect(aboveHorizon).toBeGreaterThan(35);
    expect(aboveHorizon).toBeLessThan(55);
    expect(rig.camera.position.y).toBeGreaterThan(0);
  });

  it('centres the focused point in the viewport', () => {
    const rig = makeRig(PORTRAIT);

    const projected = rig.focus.clone().project(rig.camera);

    expect(projected.x).toBeCloseTo(0, 5);
    expect(projected.y).toBeCloseTo(0, 5);
  });

  it('frames a spawn point in the middle of the town view', () => {
    const rig = createCameraRig(LANDSCAPE);
    rig.snapTo({ x: 1.5, z: -0.5 });

    expect(rig.focus.x).toBeCloseTo(1.5);
    expect(rig.focus.z).toBeCloseTo(-0.5);
    const projected = rig.focus.clone().project(rig.camera);
    expect(projected.x).toBeCloseTo(0, 5);
    expect(projected.y).toBeCloseTo(0, 5);
  });
});

describe('camera follow', () => {
  it('eases toward a new target instead of snapping to it', () => {
    const rig = makeRig();
    rig.setTarget({ x: 2, z: 0 });

    rig.update(1 / 60);

    expect(rig.focus.x).toBeGreaterThan(0);
    expect(rig.focus.x).toBeLessThan(2);
  });

  it('closes the gap to a distant target within about a second', () => {
    const rig = makeRig();
    const travel = Math.hypot(3, 2);
    rig.setTarget({ x: 3, z: -2 });

    advance(rig, 1.5);

    // Eased follow should have covered better than 95% of the distance.
    const remaining = Math.hypot(3 - rig.focus.x, -2 - rig.focus.z);
    expect(remaining).toBeLessThan(travel * 0.05);
  });

  it('moves the same distance regardless of frame rate', () => {
    const oneStep = makeRig();
    oneStep.setTarget({ x: 3, z: 1 });
    oneStep.update(0.2);

    const twoSteps = makeRig();
    twoSteps.setTarget({ x: 3, z: 1 });
    twoSteps.update(0.1);
    twoSteps.update(0.1);

    expect(twoSteps.focus.x).toBeCloseTo(oneStep.focus.x, 4);
    expect(twoSteps.focus.z).toBeCloseTo(oneStep.focus.z, 4);
  });

  it('ignores zero and negative frame deltas', () => {
    const rig = makeRig();
    rig.setTarget({ x: 1, z: 0 });

    rig.update(0);
    rig.update(-1);

    expect(rig.focus.x).toBeCloseTo(0, 6);
    expect(rig.focus.z).toBeCloseTo(0, 6);
  });

  it('keeps the focus point centred while following', () => {
    const rig = makeRig();
    rig.setTarget({ x: -2, z: 2 });
    advance(rig, 0.5);

    const projected = rig.focus.clone().project(rig.camera);

    expect(projected.x).toBeCloseTo(0, 5);
    expect(projected.y).toBeCloseTo(0, 5);
  });

  it('snapTo jumps immediately, without easing', () => {
    const rig = makeRig();
    rig.snapTo({ x: -2.5, z: 2.5 });

    expect(rig.focus.x).toBeCloseTo(-2.5, 6);
    expect(rig.focus.z).toBeCloseTo(2.5, 6);
  });
});
