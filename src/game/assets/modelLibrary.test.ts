import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createModelLibrary, type ModelSource } from './modelLibrary';

/** A model together with the palette texture its material samples. */
interface TexturedModel {
  readonly model: Group;
  readonly texture: Texture;
}

/** Builds a one-mesh model whose material samples a named palette texture. */
function texturedModel(name: string, textureName: string): TexturedModel {
  const texture = new Texture();
  texture.name = textureName;
  const group = new Group();
  group.name = name;
  group.add(
    new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ map: texture, name: `${name}-material` }),
    ),
  );
  return { model: group, texture };
}

interface StubSource {
  readonly source: ModelSource;
  /** URLs requested, in order. */
  readonly calls: string[];
}

function stubSource(models: Readonly<Record<string, Object3D>>): StubSource {
  const calls: string[] = [];
  return {
    calls,
    source: {
      loadAsync: async (url: string): Promise<{ readonly scene: Object3D }> => {
        calls.push(url);
        const scene = models[url];
        if (scene === undefined) {
          throw new Error(`no stub model for ${url}`);
        }
        return { scene };
      },
    },
  };
}

function firstMesh(root: Object3D): Mesh {
  let found: Mesh | undefined;
  root.traverse((node) => {
    if (found === undefined && node instanceof Mesh) {
      found = node;
    }
  });
  if (found === undefined) {
    throw new Error('no mesh in model');
  }
  return found;
}

function mapOf(root: Object3D): Texture | null | undefined {
  return (firstMesh(root).material as MeshStandardMaterial).map;
}

describe('createModelLibrary', () => {
  it('loads each url once and returns the cached template', async () => {
    const stub = stubSource({ 'a.glb': texturedModel('a', 'kit/colormap').model });
    const library = createModelLibrary({ source: stub.source });

    const first = await library.load('a.glb');
    const second = await library.load('a.glb');

    expect(stub.calls).toEqual(['a.glb']);
    expect(second).toBe(first);
  });

  it('instantiates independent clones that share geometry and material', async () => {
    const stub = stubSource({ 'a.glb': texturedModel('a', 'kit/colormap').model });
    const library = createModelLibrary({ source: stub.source });

    const template = await library.load('a.glb');
    const one = await library.instantiate('a.glb');
    const two = await library.instantiate('a.glb');

    expect(one).not.toBe(two);
    expect(one).not.toBe(template);
    expect(one.parent).toBeNull();
    expect(firstMesh(one).geometry).toBe(firstMesh(template).geometry);
    expect(firstMesh(one).material).toBe(firstMesh(template).material);
  });

  it('casts and receives shadows on loaded meshes', async () => {
    const stub = stubSource({ 'a.glb': texturedModel('a', 'kit/colormap').model });
    const lit = await createModelLibrary({ source: stub.source }).load('a.glb');
    expect(firstMesh(lit).castShadow).toBe(true);
    expect(firstMesh(lit).receiveShadow).toBe(true);

    const unlit = await createModelLibrary({ source: stub.source, shadows: false }).load(
      'a.glb',
    );
    expect(firstMesh(unlit).castShadow).toBe(false);
  });

  it('shares one palette texture across models and releases the duplicate', async () => {
    const first = texturedModel('a', 'city-kit-suburban/colormap');
    const second = texturedModel('b', 'city-kit-suburban/colormap');
    const released = vi.spyOn(second.texture, 'dispose');
    const stub = stubSource({ 'a.glb': first.model, 'b.glb': second.model });
    const library = createModelLibrary({ source: stub.source });

    await library.load('a.glb');
    await library.load('b.glb');

    // The second model is repointed at the palette already uploaded, so the
    // duplicate never reaches the GPU.
    expect(mapOf(second.model)).toBe(first.texture);
    expect(released).toHaveBeenCalled();
  });

  it('keeps textures apart when their names differ, as two kits would', async () => {
    const toy = texturedModel('toy', 'toy-car-kit/colormap');
    const city = texturedModel('city', 'city-kit-suburban/colormap');
    const stub = stubSource({ 'toy.glb': toy.model, 'city.glb': city.model });
    const library = createModelLibrary({ source: stub.source });

    await library.load('toy.glb');
    await library.load('city.glb');

    expect(mapOf(city.model)).toBe(city.texture);
    expect(mapOf(toy.model)).toBe(toy.texture);
  });

  it('leaves unnamed textures alone', async () => {
    const first = texturedModel('a', '');
    const second = texturedModel('b', '');
    const stub = stubSource({ 'a.glb': first.model, 'b.glb': second.model });
    const library = createModelLibrary({ source: stub.source });

    await library.load('a.glb');
    await library.load('b.glb');

    expect(mapOf(second.model)).toBe(second.texture);
  });

  it('retries a failed load instead of caching the failure', async () => {
    const stub = stubSource({ 'a.glb': texturedModel('a', 'kit/colormap').model });
    const library = createModelLibrary({ source: stub.source });

    await expect(library.load('missing.glb')).rejects.toThrow(/no stub model/);
    await expect(library.load('a.glb')).resolves.toBeDefined();
    expect(stub.calls).toEqual(['missing.glb', 'a.glb']);
  });

  it('refetches after dispose', async () => {
    const stub = stubSource({ 'a.glb': texturedModel('a', 'kit/colormap').model });
    const library = createModelLibrary({ source: stub.source });

    await library.load('a.glb');
    library.dispose();
    await library.load('a.glb');

    expect(stub.calls).toEqual(['a.glb', 'a.glb']);
  });
});
