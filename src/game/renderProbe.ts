import {
  DirectionalLight,
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
/** Static scene groups used only for controlled shadow-pass experiments. */
export type ShadowExperimentGroup =
  | 'roads'
  | 'props'
  | 'roads-and-props'
  | 'houses'
  | 'hero';

export interface RenderMetricsApi {
  start(name: string): void;
  stop(name: string): RenderWindowSummary;
  snapshot(): readonly RenderWindowSummary[];
  inventory(): RenderInventory;
  setShadowGroup(group: ShadowExperimentGroup, enabled: boolean): void;
  setShadowExtent(extent: number): void;
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

function belongsToShadowGroup(
  node: Object3D,
  scene: Scene,
  group: ShadowExperimentGroup,
): boolean {
  const prefixes =
    group === 'roads'
      ? ['road-']
      : group === 'props'
        ? ['cone-', 'dumpster-', 'powerPole-', 'tree-']
        : group === 'houses'
          ? ['house-']
          : group === 'hero'
            ? ['vehicle']
            : ['road-', 'cone-', 'dumpster-', 'powerPole-', 'tree-'];
  let current: Object3D | null = node;
  while (current !== null && current !== scene) {
    if (prefixes.some((prefix) => current?.name.startsWith(prefix))) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function setShadowGroup(
  scene: Scene,
  group: ShadowExperimentGroup,
  enabled: boolean,
): void {
  scene.traverse((node) => {
    if (node instanceof Mesh && belongsToShadowGroup(node, scene, group)) {
      node.castShadow = enabled;
    }
  });
}

function setShadowExtent(scene: Scene, extent: number): void {
  if (!Number.isFinite(extent) || extent <= 0) {
    throw new Error(`Shadow extent must be positive and finite, got ${extent}`);
  }
  let sun: DirectionalLight | undefined;
  scene.traverse((node) => {
    if (node instanceof DirectionalLight) {
      sun = node;
    }
  });
  if (sun === undefined) {
    throw new Error('No directional light found for the shadow experiment');
  }
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.updateProjectionMatrix();
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
    setShadowGroup(group: ShadowExperimentGroup, enabled: boolean): void {
      setShadowGroup(scene, group, enabled);
    },
    setShadowExtent(extent: number): void {
      setShadowExtent(scene, extent);
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
