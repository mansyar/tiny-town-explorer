import { describe, expect, it } from 'vitest';
import { POSITION_ATTRIBUTE, readGlbChunks, writeGlb } from './glb';
import { countTriangles, worldBounds } from './measure-assets';
import { packGlbModel } from './pack-glb-assets';

const PALETTE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);

/** Geometry bytes standing in for a real vertex/index buffer. */
const GEOMETRY = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2]);

interface PackedFixture {
  readonly glb: Uint8Array;
  readonly textures: Readonly<Record<string, Uint8Array>>;
}

/** A GLB shaped like Kenney's: embedded buffer, external palette image. */
function kenneyLikeGlb(uri = 'Textures/colormap.png'): PackedFixture {
  return {
    glb: writeGlb(
      {
        buffers: [{ byteLength: GEOMETRY.byteLength }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 6 },
          { buffer: 0, byteOffset: 6, byteLength: 6 },
        ],
        accessors: [
          { bufferView: 0, count: 3, min: [-1, 0, -1], max: [1, 1, 1] },
          { bufferView: 1, count: 6 },
        ],
        meshes: [
          {
            primitives: [
              { attributes: { [POSITION_ATTRIBUTE]: 0 }, indices: 1, material: 0 },
            ],
          },
        ],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        images: [{ uri, name: 'colormap' }],
        textures: [{ sampler: 0, source: 0, name: 'colormap' }],
        materials: [
          { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, name: 'colormap' },
        ],
      },
      GEOMETRY,
    ),
    textures: { [uri]: PALETTE },
  };
}

function pack(fixture: PackedFixture, kitId = 'toy-car-kit'): Uint8Array {
  return packGlbModel(fixture.glb, {
    kitId,
    readTexture: (uri) => {
      const bytes = fixture.textures[uri];
      if (bytes === undefined) {
        throw new Error(`Unknown texture ${uri}`);
      }
      return bytes;
    },
  });
}

/** Reads a packed GLB's embedded image bytes back out of its BIN chunk. */
function embeddedImage(bytes: Uint8Array): Uint8Array {
  const { json, bin } = readGlbChunks(bytes);
  const document = JSON.parse(new TextDecoder().decode(json)) as {
    images?: { bufferView?: number }[];
    bufferViews?: { byteOffset?: number; byteLength?: number }[];
  };
  const view = document.bufferViews?.[document.images?.[0]?.bufferView ?? -1];
  if (
    view?.byteOffset === undefined ||
    view.byteLength === undefined ||
    bin === undefined
  ) {
    throw new Error('no embedded image');
  }
  return bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
}

describe('packGlbModel', () => {
  it('embeds an external palette and clears its uri', () => {
    const packed = pack(kenneyLikeGlb());
    const { json } = readGlbChunks(packed);
    const document = JSON.parse(new TextDecoder().decode(json)) as {
      images?: { uri?: string; mimeType?: string; name?: string; bufferView?: number }[];
    };
    expect(document.images?.[0]?.uri).toBeUndefined();
    expect(document.images?.[0]?.mimeType).toBe('image/png');
    expect(document.images?.[0]?.bufferView).toBe(2);
    expect(embeddedImage(packed)).toEqual(PALETTE);
  });

  it('namespaces texture names so two kits cannot collide', () => {
    const packed = pack(kenneyLikeGlb(), 'city-kit-suburban');
    const { json } = readGlbChunks(packed);
    const document = JSON.parse(new TextDecoder().decode(json)) as {
      images?: { name?: string }[];
      textures?: { name?: string }[];
    };
    // three names a texture from the glTF texture name, falling back to the
    // image name, so both must carry the kit prefix.
    expect(document.images?.[0]?.name).toBe('city-kit-suburban/colormap');
    expect(document.textures?.[0]?.name).toBe('city-kit-suburban/colormap');
  });

  it('preserves geometry bounds and triangle count', () => {
    const fixture = kenneyLikeGlb();
    const packed = pack(fixture);
    const { json, bin } = readGlbChunks(packed);
    const document = JSON.parse(new TextDecoder().decode(json));

    expect(countTriangles(document)).toBe(
      countTriangles(
        JSON.parse(new TextDecoder().decode(readGlbChunks(fixture.glb).json)),
      ),
    );
    expect(worldBounds(document)?.max.x).toBe(1);
    // The original buffer keeps its offset 0, so existing views still resolve.
    expect(bin?.subarray(0, GEOMETRY.byteLength)).toEqual(GEOMETRY);
  });

  it('aligns the appended image to four bytes and resizes the buffer', () => {
    // An odd-length geometry so the image cannot land on an aligned offset by
    // accident.
    const odd = new Uint8Array([1, 2, 3, 4, 5]);
    const fixture = kenneyLikeGlb();
    const glb = writeGlb(
      {
        buffers: [{ byteLength: odd.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: odd.byteLength }],
        accessors: [{ bufferView: 0, count: 3 }],
        meshes: [{ primitives: [{ attributes: { [POSITION_ATTRIBUTE]: 0 } }] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        images: [{ uri: 'Textures/colormap.png' }],
        textures: [{ source: 0 }],
      },
      odd,
    );
    const packed = packGlbModel(glb, {
      kitId: 'kit',
      readTexture: () => fixture.textures['Textures/colormap.png'] as Uint8Array,
    });

    const { json, bin } = readGlbChunks(packed);
    const document = JSON.parse(new TextDecoder().decode(json)) as {
      buffers?: { byteLength?: number }[];
      bufferViews?: { byteOffset?: number; byteLength?: number }[];
    };
    const embedded = document.bufferViews?.[1];
    expect(embedded?.byteOffset).toBe(8);
    expect((embedded?.byteOffset ?? 0) % 4).toBe(0);
    expect(bin?.[7]).toBe(0);
    expect(document.buffers?.[0]?.byteLength).toBe(8 + PALETTE.byteLength);
  });

  it('is idempotent once packed', () => {
    const fixture = kenneyLikeGlb();
    const once = pack(fixture);
    expect(packGlbModel(once, { kitId: 'kit', readTexture: () => PALETTE })).toBe(once);
  });

  it('rejects an external buffer reference', () => {
    const glb = writeGlb({
      buffers: [{ uri: 'model.bin', byteLength: 4 }],
      images: [{ uri: 'Textures/colormap.png' }],
    });
    expect(() => packGlbModel(glb, { kitId: 'kit', readTexture: () => PALETTE })).toThrow(
      /external file "model.bin"/,
    );
  });

  it('rejects an image format it cannot describe', () => {
    const glb = writeGlb({
      buffers: [{ byteLength: 4 }],
      images: [{ uri: 'Textures/colormap.gif' }],
    });
    expect(() => packGlbModel(glb, { kitId: 'kit', readTexture: () => PALETTE })).toThrow(
      /Unsupported image format/,
    );
  });

  it('adds a BIN chunk when the container had none', () => {
    const glb = writeGlb({
      buffers: [{ byteLength: 0 }],
      images: [{ uri: 'Textures/colormap.png' }],
      textures: [{ source: 0 }],
    });
    const packed = packGlbModel(glb, { kitId: 'kit', readTexture: () => PALETTE });
    expect(embeddedImage(packed)).toEqual(PALETTE);
  });
});
