import { describe, expect, it } from 'vitest';
import {
  createRenderWindowRecorder,
  type RenderContext,
  type RenderSample,
  summarizeRenderWindow,
} from './renderMetrics';

const context: RenderContext = {
  focusX: 0,
  focusZ: 0,
  viewportAspect: 16 / 9,
  zoom: 1,
  pixelRatio: 1.5,
  shadowPass: true,
};

function sample(
  frame: number,
  triangles: number,
  calls: number,
  overrides: Partial<RenderContext> = {},
): RenderSample {
  return {
    frame,
    triangles,
    calls,
    context: { ...context, ...overrides },
  };
}

describe('summarizeRenderWindow', () => {
  it('returns an honest empty summary without inventing a context', () => {
    expect(summarizeRenderWindow('fresh-spawn', [])).toEqual({
      name: 'fresh-spawn',
      sampleCount: 0,
      firstFrame: undefined,
      lastFrame: undefined,
      peakTriangles: 0,
      averageTriangles: 0,
      peakCalls: 0,
      averageCalls: 0,
      context: undefined,
      contextConsistent: true,
    });
  });

  it('reports the frame span, peaks, and means independently', () => {
    const summary = summarizeRenderWindow('transit-peak', [
      sample(10, 50_000, 200),
      sample(11, 56_232, 237),
      sample(12, 52_232, 220),
    ]);

    expect(summary).toMatchObject({
      name: 'transit-peak',
      sampleCount: 3,
      firstFrame: 10,
      lastFrame: 12,
      peakTriangles: 56_232,
      averageTriangles: (50_000 + 56_232 + 52_232) / 3,
      peakCalls: 237,
      averageCalls: (200 + 237 + 220) / 3,
      context,
      contextConsistent: true,
    });
  });

  it('allows the camera focus to follow the car within a window', () => {
    const summary = summarizeRenderWindow('transit', [
      sample(1, 40_000, 180, { focusX: 0, focusZ: 0 }),
      sample(2, 41_000, 181, { focusX: 2, focusZ: 1 }),
    ]);

    expect(summary.contextConsistent).toBe(true);
  });

  it('flags a window that mixed viewport aspect ratios', () => {
    const summary = summarizeRenderWindow('junction', [
      sample(1, 40_000, 180),
      sample(2, 41_000, 181, { viewportAspect: 4 / 3 }),
    ]);

    expect(summary.contextConsistent).toBe(false);
    expect(summary.context).toEqual(context);
  });

  it('flags a window that mixed zoom, pixel-ratio, or shadow contexts', () => {
    const summary = summarizeRenderWindow('junction', [
      sample(1, 40_000, 180),
      sample(2, 41_000, 181, { pixelRatio: 2 }),
      sample(3, 42_000, 182),
    ]);

    expect(summary.contextConsistent).toBe(false);
    expect(summary.context).toEqual(context);
  });
});

describe('createRenderWindowRecorder', () => {
  it('records samples and clears them without changing its name', () => {
    const recorder = createRenderWindowRecorder('fresh-spawn');
    recorder.record(sample(1, 40_000, 180));
    recorder.record(sample(2, 41_000, 181));

    expect(recorder.name).toBe('fresh-spawn');
    expect(recorder.samples).toHaveLength(2);
    expect(recorder.summary()).toMatchObject({
      name: 'fresh-spawn',
      sampleCount: 2,
      peakTriangles: 41_000,
    });

    recorder.clear();
    expect(recorder.samples).toHaveLength(0);
    expect(recorder.summary().sampleCount).toBe(0);
  });
});
