/**
 * The small, renderer-independent contract used by the performance track.
 *
 * Browser probes collect samples from `renderer.info`; this module turns those
 * samples into a stable report without importing three.js or touching the DOM.
 * Keeping the arithmetic here means a measurement window can be tested and
 * compared without a WebGL context.
 */

/** Camera position plus the renderer settings that define a fair window. */
export interface RenderContext {
  /** The camera focus point on the ground plane; it may follow the car. */
  readonly focusX: number;
  readonly focusZ: number;
  /** The orthographic camera's zoom. */
  readonly zoom: number;
  /** The renderer's current pixel ratio. */
  readonly pixelRatio: number;
  /** Whether the sample includes the shadow-map pass. */
  readonly shadowPass: boolean;
}

/** One completed render, sampled after the frame has been drawn. */
export interface RenderSample {
  readonly frame: number;
  readonly triangles: number;
  readonly calls: number;
  readonly context: RenderContext;
}

/** The summary used when comparing before and after measurements. */
export interface RenderWindowSummary {
  readonly name: string;
  readonly sampleCount: number;
  readonly firstFrame: number | undefined;
  readonly lastFrame: number | undefined;
  readonly peakTriangles: number;
  readonly averageTriangles: number;
  readonly peakCalls: number;
  readonly averageCalls: number;
  /** The first context in the window, for the report's assumptions. */
  readonly context: RenderContext | undefined;
  /** False when a window mixed zoom, pixel-ratio, or shadow settings. */
  readonly contextConsistent: boolean;
}

/** A rough scene inventory used to compare authored work with rendered work. */
export interface RenderInventory {
  readonly meshes: number;
  readonly visibleMeshes: number;
  readonly frustumCulledFalse: number;
  readonly estimatedTriangles: number;
}

/** Mutable collection behind one named measurement window. */
export interface RenderWindowRecorder {
  readonly name: string;
  readonly samples: readonly RenderSample[];
  record(sample: RenderSample): void;
  summary(): RenderWindowSummary;
  clear(): void;
}

/** Whether two samples used the same non-positional measurement settings. */
function sameContext(left: RenderContext, right: RenderContext): boolean {
  return (
    left.zoom === right.zoom &&
    left.pixelRatio === right.pixelRatio &&
    left.shadowPass === right.shadowPass
  );
}

/**
 * Summarizes one named render window.
 *
 * The first sample supplies the reported context. Later samples contribute
 * their peaks and means, while a context mismatch is surfaced rather than
 * silently averaged into a misleading number.
 */
export function summarizeRenderWindow(
  name: string,
  samples: readonly RenderSample[],
): RenderWindowSummary {
  const [first, ...rest] = samples;
  if (first === undefined) {
    return {
      name,
      sampleCount: 0,
      firstFrame: undefined,
      lastFrame: undefined,
      peakTriangles: 0,
      averageTriangles: 0,
      peakCalls: 0,
      averageCalls: 0,
      context: undefined,
      contextConsistent: true,
    };
  }

  let peakTriangles = first.triangles;
  let peakCalls = first.calls;
  let triangleTotal = first.triangles;
  let callTotal = first.calls;
  let contextConsistent = true;
  for (const sample of rest) {
    peakTriangles = Math.max(peakTriangles, sample.triangles);
    peakCalls = Math.max(peakCalls, sample.calls);
    triangleTotal += sample.triangles;
    callTotal += sample.calls;
    contextConsistent &&= sameContext(first.context, sample.context);
  }

  return {
    name,
    sampleCount: samples.length,
    firstFrame: first.frame,
    lastFrame: samples[samples.length - 1]?.frame,
    peakTriangles,
    averageTriangles: triangleTotal / samples.length,
    peakCalls,
    averageCalls: callTotal / samples.length,
    context: first.context,
    contextConsistent,
  };
}

/** Creates a recorder for one named measurement window. */
export function createRenderWindowRecorder(name: string): RenderWindowRecorder {
  const samples: RenderSample[] = [];
  return {
    name,
    samples,
    record(sample: RenderSample): void {
      samples.push(sample);
    },
    summary(): RenderWindowSummary {
      return summarizeRenderWindow(name, samples);
    },
    clear(): void {
      samples.length = 0;
    },
  };
}
