/**
 * Minimal GLB (binary glTF) container input/output, shared by the asset
 * scripts.
 *
 * Kenney ships each kit model as a GLB whose palette texture is an *external*
 * `Textures/colormap.png` reference. External references cannot survive a
 * bundler: the sibling PNG is neither emitted nor resolvable from the hashed
 * output URL. Packing embeds those palettes (see `pack-glb-assets.ts`), which
 * needs to rewrite the container, and both directions of that live here so the
 * measurement script reads through exactly the same parser.
 *
 * Only the JSON and BIN chunks are touched; geometry buffers are never
 * decoded, so this stays dependency-free and fast.
 */

/** `glTF` little-endian magic, as it reads in a DataView. */
export const GLB_MAGIC = 0x4654_6c67;
/** Container version this project writes and accepts. */
export const GLB_VERSION = 2;
/** Chunk type for the JSON chunk. */
export const CHUNK_TYPE_JSON = 0x4e4f_534a;
/** Chunk type for the binary (geometry/texture) chunk. */
export const CHUNK_TYPE_BIN = 0x004e_4942;
/** glTF primitive mode `TRIANGLES`. */
export const MODE_TRIANGLES = 4;

/**
 * The glTF attribute key naming vertex positions. Spec-mandated and uppercase,
 * so scripts reference it as a constant rather than writing a key that the
 * naming convention would (rightly) object to.
 */
export const POSITION_ATTRIBUTE = 'POSITION';

/** The slice of a glTF accessor the scripts read. */
export interface GltfAccessor {
  readonly count?: number;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

/** The slice of a glTF primitive the scripts read. */
export interface GltfPrimitive {
  readonly attributes?: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly mode?: number;
}

/** The slice of a glTF mesh the scripts read. */
export interface GltfMesh {
  readonly primitives?: readonly GltfPrimitive[];
}

/** The slice of a glTF node the scripts read. */
export interface GltfNode {
  readonly mesh?: number;
  readonly children?: readonly number[];
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
}

/** The slice of a glTF scene the scripts read. */
export interface GltfScene {
  readonly nodes?: readonly number[];
}

/** The slice of a glTF document the scripts read. */
export interface GltfDocument {
  readonly accessors?: readonly GltfAccessor[];
  readonly meshes?: readonly GltfMesh[];
  readonly nodes?: readonly GltfNode[];
  readonly materials?: readonly unknown[];
  readonly images?: readonly unknown[];
  readonly scenes?: readonly GltfScene[];
  readonly scene?: number;
}

/** The two chunks of a GLB container. */
export interface GlbChunks {
  readonly json: Uint8Array;
  /** Absent when the container carries no BIN chunk. */
  readonly bin: Uint8Array | undefined;
}

/** Rounds up to the 4-byte alignment the GLB spec requires of chunks. */
export function padTo4(length: number): number {
  return length % 4 === 0 ? length : length + (4 - (length % 4));
}

/**
 * Splits a GLB container into its JSON and BIN chunks.
 *
 * @throws if the file is not a version-2 GLB or carries no JSON chunk.
 */
export function readGlbChunks(data: Uint8Array): GlbChunks {
  if (data.byteLength < 12) {
    throw new Error(`Not a GLB: only ${data.byteLength} bytes`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Not a GLB: bad magic bytes');
  }
  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) {
    throw new Error(`Unsupported GLB version ${version}`);
  }

  let json: Uint8Array | undefined;
  let bin: Uint8Array | undefined;
  const end = data.byteLength;
  let offset = 12;
  while (offset + 8 <= end) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunk = data.subarray(chunkStart, Math.min(chunkStart + chunkLength, end));
    if (chunkType === CHUNK_TYPE_JSON && json === undefined) {
      json = chunk;
    } else if (chunkType === CHUNK_TYPE_BIN && bin === undefined) {
      bin = chunk;
    }
    offset = chunkStart + chunkLength;
  }

  if (json === undefined) {
    throw new Error('GLB has no JSON chunk');
  }
  return { json, bin };
}

/**
 * Parses a GLB container's JSON chunk.
 *
 * @throws if the container is malformed or its JSON does not parse.
 */
export function parseGlb(data: Uint8Array): GltfDocument {
  const { json } = readGlbChunks(data);
  return JSON.parse(new TextDecoder().decode(json)) as GltfDocument;
}

/**
 * Serializes a GLB container. Chunks are padded to 4-byte alignment (JSON with
 * spaces, BIN with zeros) as the spec requires, and the header length is
 * recomputed from the actual content.
 */
export function writeGlb(json: unknown, bin?: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = padTo4(jsonBytes.byteLength);
  const binLength = bin === undefined ? 0 : padTo4(bin.byteLength);
  const total = 12 + 8 + jsonLength + (bin === undefined ? 0 : 8 + binLength);

  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);

  view.setUint32(12, jsonLength, true);
  view.setUint32(16, CHUNK_TYPE_JSON, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);

  if (bin !== undefined) {
    const binHeader = 20 + jsonLength;
    view.setUint32(binHeader, binLength, true);
    view.setUint32(binHeader + 4, CHUNK_TYPE_BIN, true);
    bytes.set(bin, binHeader + 8);
  }
  return bytes;
}
