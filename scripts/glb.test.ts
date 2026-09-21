import { describe, expect, it } from 'vitest';
import {
  CHUNK_TYPE_BIN,
  CHUNK_TYPE_JSON,
  GLB_MAGIC,
  GLB_VERSION,
  parseGlb,
  readGlbChunks,
  writeGlb,
} from './glb';

describe('writeGlb', () => {
  it('writes a header the reader accepts', () => {
    const bytes = writeGlb({ asset: { version: '2.0' } });
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(GLB_MAGIC);
    expect(view.getUint32(4, true)).toBe(GLB_VERSION);
    expect(view.getUint32(8, true)).toBe(bytes.byteLength);
    expect(parseGlb(bytes)).toEqual({ asset: { version: '2.0' } });
  });

  it('pads the JSON chunk with spaces to a 4-byte boundary', () => {
    // A document whose serialized JSON length is not a multiple of four.
    const bytes = writeGlb({ a: 1 });
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16, true)).toBe(CHUNK_TYPE_JSON);
    const jsonLength = view.getUint32(12, true);
    expect(jsonLength % 4).toBe(0);
    expect(jsonLength).toBeGreaterThan(new TextEncoder().encode('{"a":1}').byteLength);
    expect(parseGlb(bytes)).toEqual({ a: 1 });
  });

  it('writes a BIN chunk padded with zeros', () => {
    const bin = new Uint8Array([1, 2, 3]);
    const bytes = writeGlb({ buffers: [{ byteLength: 3 }] }, bin);
    const chunks = readGlbChunks(bytes);
    expect(chunks.bin?.subarray(0, 3)).toEqual(bin);
    expect((chunks.bin?.byteLength ?? 0) % 4).toBe(0);

    const view = new DataView(bytes.buffer);
    const binHeader = 12 + 8 + view.getUint32(12, true);
    expect(view.getUint32(binHeader + 4, true)).toBe(CHUNK_TYPE_BIN);
  });

  it('omits the BIN chunk when no binary payload is given', () => {
    expect(readGlbChunks(writeGlb({ meshes: [] })).bin).toBeUndefined();
  });
});

describe('readGlbChunks', () => {
  it('rejects a file too short to be a container', () => {
    expect(() => readGlbChunks(new Uint8Array(8))).toThrow(/only 8 bytes/);
  });

  it('rejects a wrong magic number', () => {
    const bytes = writeGlb({ meshes: [] });
    bytes[0] = 0;
    expect(() => readGlbChunks(bytes)).toThrow(/bad magic/);
  });

  it('rejects an unsupported version', () => {
    const bytes = writeGlb({ meshes: [] });
    new DataView(bytes.buffer).setUint32(4, 1, true);
    expect(() => readGlbChunks(bytes)).toThrow(/Unsupported GLB version 1/);
  });

  it('rejects a container with no JSON chunk', () => {
    const bytes = writeGlb({ meshes: [] });
    new DataView(bytes.buffer).setUint32(16, CHUNK_TYPE_BIN, true);
    expect(() => readGlbChunks(bytes)).toThrow(/no JSON chunk/);
  });

  it('tolerates a truncated final chunk', () => {
    const bytes = writeGlb({ meshes: [] }, new Uint8Array([1, 2, 3, 4]));
    const truncated = bytes.subarray(0, bytes.byteLength - 4);
    expect(readGlbChunks(truncated).bin?.byteLength).toBe(0);
  });
});
