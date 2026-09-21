#!/usr/bin/env node
/**
 * Generates flat placeholder PWA icons (sky, sun, clouds, grassy road band)
 * until the real Kenney-art icons land in the PWA phase. Dependency-free so
 * any machine can refresh them with `pnpm icons:generate`.
 *
 * Usage: node scripts/generate-placeholder-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'icons');

const COLORS = {
  sky: [135, 206, 235],
  sun: [255, 214, 102],
  cloud: [248, 248, 250],
  grass: [124, 196, 124],
  road: [150, 150, 158],
  dash: [250, 250, 252],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** @param {Buffer} bytes */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Buffer} data
 */
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/**
 * Encodes RGBA pixel data as a PNG (8-bit/color, no interlace).
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba
 */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // per-scanline filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Samples the placeholder artwork in normalized `0..1` design space.
 * @param {number} dx
 * @param {number} dy
 */
function sample(dx, dy) {
  if (dx < 0 || dx > 1 || dy < 0 || dy > 1) {
    return COLORS.sky;
  }
  if (Math.hypot(dx - 0.74, dy - 0.24) < 0.12) {
    return COLORS.sun;
  }
  for (const [cx, cy, r] of [
    [0.26, 0.22, 0.09],
    [0.38, 0.27, 0.07],
  ]) {
    if (Math.hypot(dx - cx, dy - cy) < r) {
      return COLORS.cloud;
    }
  }
  if (dy >= 0.7) {
    const onRoad = dy >= 0.78 && dy <= 0.94 && dx >= 0.06 && dx <= 0.94;
    if (onRoad) {
      const onDash = dy >= 0.845 && dy <= 0.875 && Math.floor(dx * 7) % 2 === 0;
      return onDash ? COLORS.dash : COLORS.road;
    }
    return COLORS.grass;
  }
  return COLORS.sky;
}

/**
 * @param {number} size
 * @param {number} pad Fraction of the canvas kept as maskable-safe margin.
 */
function renderIcon(size, pad) {
  const rgba = Buffer.alloc(size * size * 4);
  const inner = size * (1 - 2 * pad);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - size * pad) / inner;
      const dy = (y + 0.5 - size * pad) / inner;
      const [r, g, b] = sample(dx, dy);
      const offset = (y * size + x) * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, pad } of TARGETS) {
  const path = join(OUT_DIR, file);
  writeFileSync(path, renderIcon(size, pad));
  console.log(`wrote ${path.replace(ROOT, '.')} (${size}x${size})`);
}
