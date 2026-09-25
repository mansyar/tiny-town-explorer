import {
  InstancedMesh,
  Mesh,
  type Object3D,
  type OrthographicCamera,
  type Scene,
  type Vector3,
  type WebGLRenderer,
} from 'three';
import {
  createRenderWindowRecorder,
  type RenderInventory,
  type RenderSample,
  type RenderWindowSummary,
  summarizeRenderWindow,
} from './renderMetrics';

/** Dev-only browser controls used to collect named render windows. */
export interface RenderMetricsApi {
  start(name: string): void;
  stop(name: string): RenderWindowSummary;
  snapshot(): readonly RenderWindowSummary[];
  inventory(): RenderInventory;
  clear(): void;
}

type RenderMetricsWindow = Window & {
  __tteRenderMetrics?: RenderMetricsApi;
};

export interface RenderProbeOptions {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  readonly focus: Vector3;
  readonly target: Window;
}

export interface RenderProbe {
  readonly afterRender: () => void;
  readonly api: RenderMetricsApi;
}

/** Counts authored meshes and estimates their geometry for the dev probe. */
function readRenderInventory(scene: Scene): RenderInventory {
  let meshes = 0;
  let visibleMeshes = 0;
  let frustumCulledFalse = 0;
  let estimatedTriangles = 0;

  const visibleInHierarchy = (node: Mesh): boolean => {
    let current: Object3D | null = node;
    while (current !== null) {
      if (!current.visible) {
        return false;
      }
      current = current.parent;
    }
    return true;
  };

  scene.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    meshes += 1;
    if (visibleInHierarchy(node)) {
      visibleMeshes += 1;
    }
    if (!node.frustumCulled) {
      frustumCulledFalse += 1;
    }
    const vertexCount =
      node.geometry.index?.count ?? node.geometry.getAttribute('position')?.count ?? 0;
    const instances = node instanceof InstancedMesh ? node.count : 1;
    estimatedTriangles += Math.floor(vertexCount / 3) * instances;
  });

  return { meshes, visibleMeshes, frustumCulledFalse, estimatedTriangles };
}

/** Installs a development-only named-window probe on the browser target. */
export function installRenderProbe(options: RenderProbeOptions): RenderProbe {
  const { renderer, scene, camera, focus, target } = options;
  const active = new Map<string, ReturnType<typeof createRenderWindowRecorder>>();
  const completed: RenderWindowSummary[] = [];
  let frame = 0;

  const record = (): void => {
    frame += 1;
    const sample: RenderSample = {
      frame,
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      context: {
        focusX: focus.x,
        focusZ: focus.z,
        zoom: camera.zoom,
        pixelRatio: renderer.getPixelRatio(),
        shadowPass: renderer.shadowMap.enabled,
      },
    };
    for (const recorder of active.values()) {
      recorder.record(sample);
    }
  };

  const api: RenderMetricsApi = {
    start(name): void {
      active.set(name, createRenderWindowRecorder(name));
    },
    stop(name): RenderWindowSummary {
      const recorder = active.get(name);
      if (recorder === undefined) {
        return summarizeRenderWindow(name, []);
      }
      const summary = recorder.summary();
      completed.push(summary);
      active.delete(name);
      return summary;
    },
    snapshot(): readonly RenderWindowSummary[] {
      return [
        ...completed,
        ...Array.from(active.values(), (recorder) => recorder.summary()),
      ];
    },
    inventory(): RenderInventory {
      return readRenderInventory(scene);
    },
    clear(): void {
      active.clear();
      completed.length = 0;
      frame = 0;
    },
  };

  (target as RenderMetricsWindow).__tteRenderMetrics = api;
  return { afterRender: record, api };
}
