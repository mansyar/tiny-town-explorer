import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { padTo4, readGlbChunks, writeGlb } from './glb.ts';

/**
 * Packs Kenney kit GLBs into self-contained, bundler-friendly assets.
 *
 * Kenney ships each model as a GLB that points at an external palette
 * (`Textures/colormap.png`). A bundler cannot honour that reference: the sibling
 * PNG is not emitted and the hashed output URL has no such neighbour, so the
 * texture would 404 in a production build. This rewrites each model's BIN chunk
 * to carry the palette inline, which also makes the model a single file the
 * service worker can precache on its own.
 *
 * Packing runs at scaffold time, not per build, so the packed GLBs are the
 * committed artifacts and this only re-runs when a kit is added or a new model
 * is taken into the registry.
 *
 * Every texture is renamed to `<kitId>/<name>`. Each kit calls its palette
 * `colormap`, so without namespacing two kits collide on one name and a runtime
 * texture cache would hand one kit's palette to the other's models.
 *
 * Usage: `node scripts/pack-glb-assets.ts <sourceDir> <outDir> --kit=<id> [--file=<name>.glb]`
 *
 * `--file` packs one model (a freshly authored piece); without it the whole kit
 * is packed, which is a no-op for models that are already packed.
 */

/** Mutable glTF image, as far as packing needs to touch it. */
interface PackImage {
  uri?: string;
  name?: string;
  mimeType?: string;
  bufferView?: number;
}

/** Mutable glTF buffer view, as far as packing needs to create one. */
interface PackBufferView {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
  byteStride?: number;
  target?: number;
}

/** Mutable glTF texture, as far as packing needs to rename it. */
interface PackTexture {
  name?: string;
  source?: number;
  sampler?: number;
}

/** Mutable glTF buffer, as far as packing needs to resize it. */
interface PackBuffer {
  uri?: string;
  byteLength?: number;
}

/**
 * A glTF document with the fields packing edits made mutable. Undeclared
 * fields survive the round trip because they stay own properties of the parsed
 * object.
 */
interface PackDocument {
  buffers?: PackBuffer[];
  bufferViews?: PackBufferView[];
  images?: PackImage[];
  textures?: PackTexture[];
  [key: string]: unknown;
}

/** What packing needs to know about a kit. */
export interface PackConfig {
  /** Kit id, used to namespace texture names. */
  readonly kitId: string;
  /** Resolves one external image reference to its bytes. */
  readonly readTexture: (uri: string) => Uint8Array;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function mimeTypeFor(uri: string): string {
  const extension = uri.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = MIME_TYPES[extension];
  if (mimeType === undefined) {
    throw new Error(`Unsupported image format in "${uri}"`);
  }
  return mimeType;
}

/**
 * Embeds every externally referenced image of one GLB into its BIN chunk.
 *
 * Returns the input untouched when there is nothing to embed, so re-packing an
 * already packed kit is a no-op rather than a re-write.
 *
 * @throws if a buffer is externally referenced (this packer only adds images)
 * or if an image format is not recognized.
 */
export function packGlbModel(glb: Uint8Array, config: PackConfig): Uint8Array {
  const chunks = readGlbChunks(glb);
  const document = JSON.parse(new TextDecoder().decode(chunks.json)) as PackDocument;
  const images = document.images ?? [];
  const external = images.filter((image) => image.uri !== undefined);
  if (external.length === 0) {
    return glb;
  }

  for (const buffer of document.buffers ?? []) {
    if (buffer.uri !== undefined) {
      throw new Error(
        `Cannot pack: buffer references the external file "${buffer.uri}". This packer embeds images only.`,
      );
    }
  }

  const bin = embedImages(document, external, chunks.bin, config);
  document.buffers = [{ byteLength: bin.byteLength }];
  namespaceTextureNames(document, images);
  return writeGlb(document, bin);
}

/** The original geometry bytes, truncated to the declared buffer length. */
function baseBytes(document: PackDocument, bin: Uint8Array | undefined): Uint8Array {
  const original = bin ?? new Uint8Array(0);
  const declaredLength = document.buffers?.[0]?.byteLength ?? original.byteLength;
  return original.subarray(0, Math.min(declaredLength, original.byteLength));
}

/** One externally referenced image, measured and ready to append. */
interface PlacedImage {
  readonly padding: number;
  readonly bytes: Uint8Array;
  readonly view: PackBufferView;
  readonly mimeType: string;
  readonly name: string;
}

function placeImage(image: PackImage, offset: number, config: PackConfig): PlacedImage {
  const uri = image.uri ?? '';
  const bytes = config.readTexture(uri);
  const padding = padTo4(offset) - offset;
  const extension = uri.split('.').pop() ?? '';
  return {
    padding,
    bytes,
    view: { buffer: 0, byteOffset: offset + padding, byteLength: bytes.byteLength },
    mimeType: mimeTypeFor(uri),
    name: `${config.kitId}/${basename(uri, `.${extension}`)}`,
  };
}

/**
 * Appends each external image to the BIN chunk. Existing buffer views address
 * offsets inside the original data, so new images can only follow it, padded to
 * the 4-byte alignment the container requires.
 */
function embedImages(
  document: PackDocument,
  external: readonly PackImage[],
  bin: Uint8Array | undefined,
  config: PackConfig,
): Uint8Array {
  const bufferViews = document.bufferViews ?? [];
  const parts: Uint8Array[] = [baseBytes(document, bin)];
  let offset = parts[0]?.byteLength ?? 0;

  for (const image of external) {
    const placed = placeImage(image, offset, config);
    if (placed.padding > 0) {
      parts.push(new Uint8Array(placed.padding));
    }
    image.bufferView = bufferViews.push(placed.view) - 1;
    image.mimeType = placed.mimeType;
    image.name = placed.name;
    delete image.uri;
    parts.push(placed.bytes);
    offset += placed.padding + placed.bytes.byteLength;
  }

  document.bufferViews = bufferViews;
  return concat(parts);
}

/**
 * three names a texture after the glTF texture name, falling back to the image
 * name, so both are pointed at the kit-namespaced image name to give the
 * runtime cache a collision-free key.
 */
function namespaceTextureNames(
  document: PackDocument,
  images: readonly PackImage[],
): void {
  for (const texture of document.textures ?? []) {
    const image = texture.source === undefined ? undefined : images[texture.source];
    if (image?.name !== undefined) {
      texture.name = image.name;
    }
  }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

/**
 * Packs the top-level `.glb` files of a kit directory into another directory.
 * `only` restricts it to a single file, which is how a freshly authored piece
 * is packed without rewriting the rest of the kit (re-packing is a no-op, but
 * 197 pointless writes are still 197 pointless writes).
 */
export async function packKit(
  sourceDir: string,
  outDir: string,
  kitId: string,
  only?: string,
): Promise<void> {
  const files = (await readdir(sourceDir)).filter(
    (name) => name.endsWith('.glb') && (only === undefined || name === only),
  );
  if (files.length === 0) {
    throw new Error(
      `No model to pack in ${sourceDir}${only === undefined ? '' : ` named ${only}`}`,
    );
  }
  await mkdir(outDir, { recursive: true });

  let before = 0;
  let after = 0;
  for (const file of files) {
    const source = new Uint8Array(await readFile(join(sourceDir, file)));
    const packed = packGlbModel(source, {
      kitId,
      readTexture: (uri) => new Uint8Array(readFileSync(join(sourceDir, uri))),
    });
    before += source.byteLength;
    after += packed.byteLength;
    await writeFile(join(outDir, file), packed);
  }
  process.stdout.write(
    `Packed ${files.length} models from ${relative(process.cwd(), sourceDir)} -> ${relative(process.cwd(), outDir)} (${(
      before / 1024 / 1024
    ).toFixed(2)} -> ${(after / 1024 / 1024).toFixed(2)} MiB)\n`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const [sourceDir, outDir] = positional;
  const kitId = args.find((arg) => arg.startsWith('--kit='))?.split('=')[1];
  const only = args.find((arg) => arg.startsWith('--file='))?.split('=')[1];
  if (sourceDir === undefined || outDir === undefined || kitId === undefined) {
    process.stderr.write(
      'Usage: node scripts/pack-glb-assets.ts <sourceDir> <outDir> --kit=<id>\n',
    );
    process.exitCode = 1;
    return;
  }
  await packKit(sourceDir, outDir, kitId, only);
}

if (process.argv[1]?.includes('pack-glb-assets')) {
  await main();
}
