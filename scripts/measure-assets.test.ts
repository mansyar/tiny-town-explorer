import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type GltfAccessor,
  type GltfDocument,
  type GltfPrimitive,
  POSITION_ATTRIBUTE,
  parseGlb,
  writeGlb,
} from './glb';
import {
  countTriangles,
  formatReport,
  measureModel,
  scanModels,
  totalStats,
  worldBounds,
} from './measure-assets';

/** A document with one mesh, one node, and the given accessors/primitive. */
function singlePrimitive(
  accessors: readonly GltfAccessor[],
  primitive: GltfPrimitive,
): GltfDocument {
  return {
    accessors,
    meshes: [{ primitives: [primitive] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
  };
}

/** A triangle primitive reading positions from the given accessor. */
function positions(accessorIndex: number): GltfPrimitive {
  return { attributes: { [POSITION_ATTRIBUTE]: accessorIndex } };
}

describe('parseGlb', () => {
  it('reads the JSON chunk of a valid container', () => {
    const glb = writeGlb({ asset: { version: '2.0' }, meshes: [] });
    expect(parseGlb(glb)).toMatchObject({ asset: { version: '2.0' } });
  });

  it('rejects a file that is too short to be a container', () => {
    expect(() => parseGlb(new Uint8Array(8))).toThrow(/only 8 bytes/);
  });

  it('rejects a wrong magic number', () => {
    const glb = writeGlb({ meshes: [] });
    glb[0] = 0;
    expect(() => parseGlb(glb)).toThrow(/bad magic/);
  });

  it('rejects an unsupported version', () => {
    const glb = writeGlb({ meshes: [] });
    new DataView(glb.buffer).setUint32(4, 1, true);
    expect(() => parseGlb(glb)).toThrow(/Unsupported GLB version 1/);
  });

  it('rejects a container with no JSON chunk', () => {
    const glb = writeGlb({ meshes: [] });
    new DataView(glb.buffer).setUint32(16, 0x004e_4942, true);
    expect(() => parseGlb(glb)).toThrow(/no JSON chunk/);
  });
});

describe('countTriangles', () => {
  it('divides indexed vertex counts by three', () => {
    const gltf = singlePrimitive([{ count: 30 }], { indices: 0, attributes: {} });
    expect(countTriangles(gltf)).toBe(10);
  });

  it('falls back to position counts for non-indexed primitives', () => {
    const gltf = singlePrimitive([{ count: 9 }], {
      attributes: { [POSITION_ATTRIBUTE]: 0 },
    });
    expect(countTriangles(gltf)).toBe(3);
  });

  it('skips non-triangle primitives', () => {
    const gltf: GltfDocument = {
      accessors: [{ count: 12 }],
      meshes: [
        { primitives: [{ attributes: { [POSITION_ATTRIBUTE]: 0 }, mode: 1 }] },
        { primitives: [{ attributes: { [POSITION_ATTRIBUTE]: 0 } }] },
      ],
      nodes: [{ mesh: 0 }, { mesh: 1 }],
      scenes: [{ nodes: [0, 1] }],
    };
    expect(countTriangles(gltf)).toBe(4);
  });

  it('treats a primitive with no usable accessor as empty', () => {
    expect(countTriangles(singlePrimitive([], { attributes: {} }))).toBe(0);
  });
});

describe('worldBounds', () => {
  it('returns undefined when nothing declares bounds', () => {
    expect(worldBounds(singlePrimitive([{ count: 3 }], positions(0)))).toBeUndefined();
  });

  it('applies node transforms to accessor bounds', () => {
    const gltf: GltfDocument = {
      accessors: [{ min: [0, 0, 0], max: [1, 2, 1] }],
      meshes: [{ primitives: [positions(0)] }],
      nodes: [{ mesh: 0, translation: [5, 0, 0], scale: [2, 1, 1] }],
      scenes: [{ nodes: [0] }],
    };
    // The accessor spans 1x2x1; the 2x scale doubles x and the shift moves it.
    const bounds = worldBounds(gltf);
    expect(bounds?.min.x).toBe(5);
    expect(bounds?.max.x).toBe(7);
    expect(bounds?.max.y).toBe(2);
  });

  it('unions every instance, walking children', () => {
    const gltf: GltfDocument = {
      accessors: [{ min: [0, 0, 0], max: [1, 1, 1] }],
      meshes: [{ primitives: [positions(0)] }],
      nodes: [{ children: [1, 2] }, { mesh: 0 }, { mesh: 0, translation: [4, 0, 0] }],
      scenes: [{ nodes: [0] }],
    };
    const bounds = worldBounds(gltf);
    expect(bounds?.min.x).toBe(0);
    expect(bounds?.max.x).toBe(5);
  });

  it('survives a cyclic hierarchy', () => {
    const gltf: GltfDocument = {
      accessors: [{ min: [0, 0, 0], max: [1, 1, 1] }],
      meshes: [{ primitives: [positions(0)] }],
      nodes: [{ children: [1] }, { mesh: 0, children: [0] }],
      scenes: [{ nodes: [0] }],
    };
    expect(worldBounds(gltf)?.max.x).toBe(1);
  });
});

describe('measureModel', () => {
  it('reports size, triangles, materials and images', () => {
    const glb = writeGlb(
      {
        accessors: [{ count: 6, min: [-1, 0, -1], max: [1, 2, 1] }],
        meshes: [{ primitives: [positions(0)] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        materials: [{}, {}],
        images: [{}],
      },
      new Uint8Array(4),
    );
    const stats = measureModel('kit/model.glb', glb);
    expect(stats).toMatchObject({
      bytes: glb.byteLength,
      triangles: 2,
      materials: 2,
      images: 1,
    });
    expect(stats.size).toEqual({ x: 2, y: 2, z: 2 });
  });
});

describe('scanModels', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'measure-assets-'));
    await mkdir(join(root, 'kit-a', 'nested'), { recursive: true });
    await writeFile(
      join(root, 'kit-a', 'b.glb'),
      writeGlb(singlePrimitive([{ count: 3 }], positions(0))),
    );
    await writeFile(
      join(root, 'kit-a', 'nested', 'a.glb'),
      writeGlb(singlePrimitive([{ count: 6 }], positions(0))),
    );
    await writeFile(join(root, 'kit-a', 'notes.txt'), 'not a model');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds .glb files recursively, ignoring other files, sorted by path', async () => {
    const models = await scanModels(root);
    expect(models.map((model) => relative(root, model.path))).toEqual([
      join('kit-a', 'b.glb'),
      join('kit-a', 'nested', 'a.glb'),
    ]);
    expect(totalStats(models)).toEqual({
      models: 2,
      triangles: 3,
      bytes: models.reduce((sum, model) => sum + model.bytes, 0),
    });
  });

  it('renders the heaviest models and the budget line', () => {
    const report = formatReport(
      [
        {
          path: 'kit/light.glb',
          bytes: 1024,
          triangles: 12,
          materials: 1,
          images: 1,
          size: { x: 1, y: 1, z: 1 },
        },
        {
          path: 'kit/heavy.glb',
          bytes: 4096,
          triangles: 900,
          materials: 1,
          images: 1,
          size: undefined,
        },
      ],
      { budget: 50_000, top: 1, root: 'kit' },
    );
    expect(report).toContain('heavy.glb');
    expect(report).not.toContain('light.glb');
    expect(report).toContain('n/a');
    expect(report).toContain('Triangle budget: 50000');
  });
});
