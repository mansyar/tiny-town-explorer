import type { Camera, WebGLRenderer } from 'three';
import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRenderLoop } from './renderLoop';

interface AnimationFrameHarness {
  /**
   * Runs the pending frame callback, if any; reports whether one ran.
   * Defaults to a realistic `performance.now()` timestamp, matching what
   * the browser's animation-frame scheduler supplies.
   */
  flushFrame(timestamp?: number): boolean;
  hasPendingFrame(): boolean;
}

/** Stand-in for the browser scheduler that honors cancellation. */
function installAnimationFrameStub(): AnimationFrameHarness {
  let pending: FrameRequestCallback | undefined;
  let nextHandle = 1;

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending = callback;
    return nextHandle++;
  });
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn(() => {
      pending = undefined;
    }),
  );

  return {
    flushFrame(timestamp = performance.now()): boolean {
      const callback = pending;
      pending = undefined;
      callback?.(timestamp);
      return callback !== undefined;
    },
    hasPendingFrame(): boolean {
      return pending !== undefined;
    },
  };
}

function makeRenderer() {
  // Minimal double: the loop only ever calls `render`.
  return { render: vi.fn() } as unknown as WebGLRenderer;
}

function makeCamera() {
  return {} as unknown as Camera;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startRenderLoop', () => {
  it('renders once per scheduled frame and keeps scheduling', () => {
    const frames = installAnimationFrameStub();
    const renderer = makeRenderer();

    startRenderLoop(renderer, new Scene(), makeCamera());
    expect(frames.hasPendingFrame()).toBe(true);

    expect(frames.flushFrame()).toBe(true);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(frames.hasPendingFrame()).toBe(true);
  });

  it('reports frame timing to the per-frame hook', () => {
    const frames = installAnimationFrameStub();
    const onFrame = vi.fn();

    startRenderLoop(makeRenderer(), new Scene(), makeCamera(), onFrame);
    frames.flushFrame();

    expect(onFrame).toHaveBeenCalledTimes(1);
    const frame = onFrame.mock.calls[0]?.[0] as { delta: number; elapsed: number };
    expect(frame.delta).toBeGreaterThanOrEqual(0);
    expect(frame.elapsed).toBeGreaterThanOrEqual(0);
  });

  it('stop cancels the pending frame and halts rendering', () => {
    const frames = installAnimationFrameStub();
    const renderer = makeRenderer();

    const stop = startRenderLoop(renderer, new Scene(), makeCamera());
    stop();

    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledWith(1);
    expect(frames.hasPendingFrame()).toBe(false);

    frames.flushFrame();
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
