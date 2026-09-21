import { describe, expect, it } from 'vitest';
import {
  encodePng,
  ICON_TARGETS,
  renderIcon,
  sampleArtwork,
} from './generate-placeholder-icons';

const PNG_SIGNATURE = '89504e470d0a1a0a';

function readPngHeader(png: Buffer) {
  return {
    signature: png.subarray(0, 8).toString('hex'),
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colorType: png[25],
  };
}

describe('encodePng', () => {
  it('writes a valid RGBA PNG for the given dimensions', () => {
    const png = encodePng(2, 3, Buffer.alloc(2 * 3 * 4, 255));
    const header = readPngHeader(png);

    expect(header.signature).toBe(PNG_SIGNATURE);
    expect(header.width).toBe(2);
    expect(header.height).toBe(3);
    expect(header.bitDepth).toBe(8);
    expect(header.colorType).toBe(6);
    expect(png.subarray(-8).toString('latin1')).toContain('IEND');
  });
});

describe('renderIcon', () => {
  it('renders every manifest icon at its declared size', () => {
    for (const { size, pad } of ICON_TARGETS) {
      const header = readPngHeader(renderIcon(size, pad));
      expect(header.signature).toBe(PNG_SIGNATURE);
      expect(header.width).toBe(size);
      expect(header.height).toBe(size);
    }
  });

  it('shrinks artwork into the maskable safe zone', () => {
    const plain = renderIcon(64, 0);
    const maskable = renderIcon(64, 0.12);

    expect(plain.equals(maskable)).toBe(false);
    // Corner pixels stay in the sky band for both variants: the safe-zone
    // inset must not clip the ground off the bottom edge.
    expect(plain.equals(renderIcon(64, 0))).toBe(true);
  });
});

describe('sampleArtwork', () => {
  it('paints sky, sun, clouds, grass, and road band in their regions', () => {
    expect(sampleArtwork(0.02, 0.02)).toEqual([135, 206, 235]);
    expect(sampleArtwork(0.74, 0.24)).toEqual([255, 214, 102]);
    expect(sampleArtwork(0.26, 0.22)).toEqual([248, 248, 250]);
    expect(sampleArtwork(0.5, 0.72)).toEqual([124, 196, 124]);
    expect(sampleArtwork(0.1, 0.8)).toEqual([150, 150, 158]);
  });

  it('clamps out-of-bounds design space to sky', () => {
    expect(sampleArtwork(-0.2, 0.5)).toEqual([135, 206, 235]);
    expect(sampleArtwork(1.4, 0.5)).toEqual([135, 206, 235]);
  });
});
