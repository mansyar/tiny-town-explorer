import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILDING_MODELS,
  NATURE_MODELS,
  PROP_MODELS,
  ROAD_MODELS,
  TOWN_MODELS,
} from './modelRegistry';

/**
 * The registry is the only thing that decides which kit models ship, so a typo
 * here surfaces as a runtime 404 on a tablet unless something checks it. This
 * resolves each URL back to the committed file; `?url` imports keep the
 * project-relative path in development, which is enough to catch a bad name.
 */
function resolveVendoredPath(url: string): string {
  const path = url.split('?')[0] ?? url;
  const marker = '/assets/kits/';
  const index = path.indexOf(marker);
  expect(index, `not a vendored kit path: ${url}`).toBeGreaterThanOrEqual(0);
  return join('src', path.slice(index + 1));
}

describe('modelRegistry', () => {
  it('registers models that exist on disk', () => {
    const missing = TOWN_MODELS.filter((url) => !existsSync(resolveVendoredPath(url)));
    expect(missing).toEqual([]);
  });

  it('covers every group exactly once', () => {
    const groups = [
      ...Object.values(ROAD_MODELS),
      ...BUILDING_MODELS,
      ...Object.values(NATURE_MODELS),
      ...Object.values(PROP_MODELS),
    ];
    expect(new Set(TOWN_MODELS)).toEqual(new Set(groups));
    expect(new Set(TOWN_MODELS).size).toBe(TOWN_MODELS.length);
  });

  it('gives every registry entry a distinct kit model file', () => {
    const names = TOWN_MODELS.map((url) => basename(resolveVendoredPath(url)));
    expect(new Set(names).size).toBe(names.length);
  });
});
