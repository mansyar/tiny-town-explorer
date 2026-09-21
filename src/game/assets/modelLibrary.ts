import {
  type BufferGeometry,
  type Material,
  Mesh,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loading and sharing for the vendored Kenney kits.
 *
 * Two things dominate the cost of mounting a town's worth of models, and both
 * are handled here:
 *
 * - **Repeated models.** A town has one house model on many lots and one kerb
 *   prop on many corners. Each URL is fetched, parsed and prepared once, and
 *   every instance is a clone that shares the template's geometry and material
 *   (three's `clone` copies transforms, not buffers).
 * - **The palette texture.** Every model in a kit points at the same palette,
 *   so without sharing, one town would upload dozens of identical textures.
 *   Textures are therefore deduplicated by name across models.
 *
 * Name-based deduplication is only safe because packing namespaces those names
 * per kit (`city-kit-suburban/colormap`); see `src/assets/kits/README.md`.
 */

/** The loader surface this library needs, so tests can supply a stub. */
export interface ModelSource {
  loadAsync(url: string): Promise<{ readonly scene: Object3D }>;
}

/** Constructor options. */
export interface ModelLibraryOptions {
  readonly source?: ModelSource;
  /** Whether loaded meshes cast and receive shadows. Defaults to true. */
  readonly shadows?: boolean;
}

/** Cached, share-aware access to the kit models. */
export interface ModelLibrary {
  /**
   * The shared template for a URL. Fetch-once and cached; treat the returned
   * object as read-only and mount {@link ModelLibrary.instantiate} instead,
   * except for measuring bounds.
   */
  load(url: string): Promise<Object3D>;
  /** A fresh clone sharing the template's geometry and materials. */
  instantiate(url: string): Promise<Object3D>;
  /** Frees cached geometry, materials and palettes and empties the caches. */
  dispose(): void;
}

/** A material that samples a texture, which is every Kenney kit material. */
interface MappedMaterial extends Material {
  map?: Texture | null;
}

function isMappedMaterial(material: Material): material is MappedMaterial {
  return 'map' in material;
}

/** Materials of a mesh, flattened from three's single-or-array field. */
function materialsOf(mesh: Mesh): readonly Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function eachMesh(root: Object3D, visit: (mesh: Mesh) => void): void {
  root.traverse((node) => {
    if (node instanceof Mesh) {
      visit(node);
    }
  });
}

/** Creates a library over the vendored kits. */
export function createModelLibrary(options: ModelLibraryOptions = {}): ModelLibrary {
  const source = options.source ?? new GLTFLoader();
  const shadows = options.shadows ?? true;
  const templates = new Map<string, Promise<Object3D>>();
  const texturesByName = new Map<string, Texture>();
  const ownedGeometry = new Set<BufferGeometry>();
  const ownedMaterials = new Set<Material>();

  /**
   * Repoints one material's palette at the instance already seen for that
   * name, releasing a duplicate so it never reaches the GPU. The first texture
   * with a given name becomes the shared one.
   */
  function shareNamedTexture(material: Material): void {
    if (!isMappedMaterial(material)) {
      return;
    }
    const map = material.map;
    if (map === null || map === undefined || map.name === '') {
      return;
    }
    const shared = texturesByName.get(map.name);
    if (shared === undefined) {
      texturesByName.set(map.name, map);
      return;
    }
    if (shared !== map) {
      material.map = shared;
      map.dispose();
    }
  }

  /** Points every named palette texture in a model at its shared instance. */
  function shareTextures(root: Object3D): void {
    eachMesh(root, (mesh) => {
      for (const material of materialsOf(mesh)) {
        shareNamedTexture(material);
      }
    });
  }

  function prepare(root: Object3D): Object3D {
    shareTextures(root);
    eachMesh(root, (mesh) => {
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      ownedGeometry.add(mesh.geometry);
      for (const material of materialsOf(mesh)) {
        ownedMaterials.add(material);
      }
    });
    return root;
  }

  async function load(url: string): Promise<Object3D> {
    const cached = templates.get(url);
    if (cached !== undefined) {
      return cached;
    }
    const pending = source
      .loadAsync(url)
      .then((gltf) => prepare(gltf.scene))
      .catch((error: unknown) => {
        // A failed fetch must not poison the cache: the next call retries.
        templates.delete(url);
        throw error;
      });
    templates.set(url, pending);
    return pending;
  }

  return {
    load,
    async instantiate(url: string): Promise<Object3D> {
      const template = await load(url);
      return template.clone(true);
    },
    dispose(): void {
      for (const geometry of ownedGeometry) {
        geometry.dispose();
      }
      for (const material of ownedMaterials) {
        material.dispose();
      }
      for (const texture of texturesByName.values()) {
        texture.dispose();
      }
      ownedGeometry.clear();
      ownedMaterials.clear();
      texturesByName.clear();
      templates.clear();
    },
  };
}
