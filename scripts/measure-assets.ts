import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import {
  type GltfAccessor,
  type GltfDocument,
  type GltfNode,
  type GltfPrimitive,
  MODE_TRIANGLES,
  POSITION_ATTRIBUTE,
  parseGlb,
} from './glb.ts';

/**
 * Measures the vendored Kenney kits without a browser.
 *
 * The scene/asset layer is verified manually (conductor/workflow.md), so the
 * numbers that gate the frame budget need a deterministic, scriptable source of
 * truth. This reads only the GLB container and its JSON chunk: no WebGL, no
 * image decoding, no network. Accessor `min`/`max` bounds are walked through the
 * node hierarchy with three's own matrix math, so the reported extents are true
 * world-space sizes rather than per-mesh authoring space.
 *
 * Usage: `node scripts/measure-assets.ts [dir] [--top=15] [--budget=50000]`
 */

/** What one model contributes to the frame budget. */
export interface ModelStats {
  /** Path as passed in, used as the display identity. */
  readonly path: string;
  readonly bytes: number;
  readonly triangles: number;
  readonly materials: number;
  readonly images: number;
  /** World-space extent of every mesh instance, or undefined if unbounded. */
  readonly size: Vec3 | undefined;
}

/** Axis-aligned extents in world units. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Counts rendered triangles. Non-triangle primitives (points, lines) are
 * skipped; indexed primitives use the index count, plain ones the vertex count.
 * glTF's default primitive mode is TRIANGLES when `mode` is absent.
 */
export function countTriangles(gltf: GltfDocument): number {
  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.mode !== undefined && primitive.mode !== MODE_TRIANGLES) {
        continue;
      }
      triangles += Math.floor(primitiveVertexCount(gltf, primitive) / 3);
    }
  }
  return triangles;
}

function primitiveVertexCount(gltf: GltfDocument, primitive: GltfPrimitive): number {
  const accessorIndex = primitive.indices ?? primitive.attributes?.[POSITION_ATTRIBUTE];
  if (accessorIndex === undefined) {
    return 0;
  }
  return gltf.accessors?.[accessorIndex]?.count ?? 0;
}

/** Local transform of a node: an explicit matrix, or composed TRS. */
function localMatrix(node: GltfNode): Matrix4 {
  if (node.matrix !== undefined) {
    return new Matrix4().fromArray(node.matrix as readonly number[] as number[]);
  }
  return new Matrix4().compose(
    vectorFrom(node.translation),
    quaternionFrom(node.rotation),
    vectorFrom(node.scale, 1),
  );
}

function vectorFrom(values: readonly number[] | undefined, fallback = 0): Vector3 {
  return new Vector3(
    values?.[0] ?? fallback,
    values?.[1] ?? fallback,
    values?.[2] ?? fallback,
  );
}

function quaternionFrom(values: readonly number[] | undefined): Quaternion {
  return values === undefined
    ? new Quaternion()
    : new Quaternion().fromArray(values as readonly number[] as number[]);
}

/** Root node indices: the default scene's nodes, else every parentless node. */
function rootNodes(gltf: GltfDocument): readonly number[] {
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (scene?.nodes !== undefined) {
    return scene.nodes;
  }
  const childIndices = new Set((gltf.nodes ?? []).flatMap((node) => node.children ?? []));
  return (gltf.nodes ?? [])
    .map((_node, index) => index)
    .filter((index) => !childIndices.has(index));
}

/** Expands a box by the transformed corners of an accessor's declared bounds. */
function expandByAccessorBounds(
  box: Box3,
  accessor: GltfAccessor | undefined,
  matrix: Matrix4,
): void {
  const { min, max } = accessor ?? {};
  if (min === undefined || max === undefined) {
    return;
  }
  for (let corner = 0; corner < 8; corner++) {
    const point = new Vector3(
      (corner & 1) === 0 ? min[0] : max[0],
      (corner & 2) === 0 ? min[1] : max[1],
      (corner & 4) === 0 ? min[2] : max[2],
    );
    box.expandByPoint(point.applyMatrix4(matrix));
  }
}

/**
 * World-space bounds of every mesh instance in the document, or undefined when
 * no primitive declares accessor bounds.
 */
export function worldBounds(gltf: GltfDocument): Box3 | undefined {
  const box = new Box3();
  const visited = new Set<number>();

  const walk = (index: number, parent: Matrix4): void => {
    // glTF nodes form a strict tree, so a repeat only signals a malformed
    // (cyclic) hierarchy, which would otherwise recurse forever.
    if (visited.has(index)) {
      return;
    }
    visited.add(index);
    const node = gltf.nodes?.[index];
    if (node === undefined) {
      return;
    }
    const world = parent.multiply(localMatrix(node));
    for (const primitive of gltf.meshes?.[node.mesh ?? -1]?.primitives ?? []) {
      expandByAccessorBounds(
        box,
        gltf.accessors?.[primitive.attributes?.[POSITION_ATTRIBUTE] ?? -1],
        world,
      );
    }
    for (const child of node.children ?? []) {
      walk(child, world.clone());
    }
  };

  for (const root of rootNodes(gltf)) {
    walk(root, new Matrix4());
  }
  return box.isEmpty() ? undefined : box;
}

/** Measures one model from its raw GLB bytes. */
export function measureModel(path: string, data: Uint8Array): ModelStats {
  const gltf = parseGlb(data);
  const bounds = worldBounds(gltf);
  return {
    path,
    bytes: data.byteLength,
    triangles: countTriangles(gltf),
    materials: gltf.materials?.length ?? 0,
    images: gltf.images?.length ?? 0,
    size: bounds === undefined ? undefined : toVec3(bounds.getSize(new Vector3())),
  };
}

function toVec3(vector: Vector3): Vec3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

/** Every `.glb` under a directory, measured, sorted by path. */
export async function scanModels(root: string): Promise<ModelStats[]> {
  const paths = await findGlbFiles(root);
  const models: ModelStats[] = [];
  for (const path of paths) {
    models.push(measureModel(path, new Uint8Array(await readFile(path))));
  }
  return models.sort((left, right) => left.path.localeCompare(right.path));
}

async function findGlbFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findGlbFiles(path)));
    } else if (entry.name.endsWith('.glb')) {
      found.push(path);
    }
  }
  return found;
}

/** Aggregate footprint of a model set. */
export interface AssetTotals {
  readonly models: number;
  readonly triangles: number;
  readonly bytes: number;
}

/** Sums a model set. */
export function totalStats(models: readonly ModelStats[]): AssetTotals {
  return {
    models: models.length,
    triangles: models.reduce((sum, model) => sum + model.triangles, 0),
    bytes: models.reduce((sum, model) => sum + model.bytes, 0),
  };
}

function formatSize(size: Vec3 | undefined): string {
  return size === undefined
    ? 'n/a'
    : `${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`;
}

/**
 * Renders the heaviest models plus kit totals and the triangle budget check
 * that Task 2.4 asks for.
 */
export function formatReport(
  models: readonly ModelStats[],
  options: { readonly budget: number; readonly top: number; readonly root: string },
): string {
  const { budget, top, root } = options;
  const heaviest = [...models]
    .sort((left, right) => right.triangles - left.triangles)
    .slice(0, top);

  const lines = [
    `Vendored models under ${relative(process.cwd(), root) || '.'} (heaviest ${heaviest.length}):`,
    '  triangles  KiB  size (x,y,z)   model',
  ];
  for (const model of heaviest) {
    lines.push(
      `  ${String(model.triangles).padStart(9)}  ${(model.bytes / 1024)
        .toFixed(1)
        .padStart(
          4,
        )}  ${formatSize(model.size).padEnd(14)}  ${relative(root, model.path)}`,
    );
  }

  const totals = totalStats(models);
  lines.push(
    '',
    `Models: ${totals.models}   Triangles (all models): ${totals.triangles}   Size: ${(
      totals.bytes / 1024 / 1024
    ).toFixed(2)} MiB`,
    `Triangle budget: ${budget} — a scene mounts a subset of a kit, so compare against the built town, not this total.`,
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const root = args.find((arg) => !arg.startsWith('--')) ?? 'src/assets/kits';
  const budgetArg = args.find((arg) => arg.startsWith('--budget='));
  const topArg = args.find((arg) => arg.startsWith('--top='));
  const models = await scanModels(root);
  process.stdout.write(
    `${formatReport(models, {
      budget: Number(budgetArg?.split('=')[1] ?? 50_000),
      top: Number(topArg?.split('=')[1] ?? 15),
      root,
    })}\n`,
  );
}

if (process.argv[1]?.includes('measure-assets')) {
  await main();
}
